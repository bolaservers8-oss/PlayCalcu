import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 2567);
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 4096;
const RESUME_GRACE_MS = 30_000;
const TICK_RATE_MS = 33;
const SNAPSHOT_RATE_MS = 66;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_COLORS = ['#9b8cff', '#31f5ce', '#ff8b6a', '#69baff'];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const rooms = new Map();
const httpServer = createServer((request, response) => {
  if (request.url === '/health' || request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', service: 'galaxy-lobby', rooms: rooms.size }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});
const websocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_MESSAGE_BYTES,
  perMessageDeflate: false
});

function createCode() {
  let code;
  do {
    const bytes = randomBytes(6);
    code = Array.from(bytes, (byte) => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20);
}

function publicRoom(room) {
  return {
    code: room.code,
    visibility: room.visibility,
    phase: room.phase,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      ready: player.ready,
      connected: player.connected
    }))
  };
}

function createWave(game) {
  game.enemies = [];
  game.playerShots = [];
  game.enemyShots = [];
  const bossWave = game.wave % 5 === 0;
  if (bossWave) {
    game.enemies.push({
      x: 160, y: 82, width: 76, height: 36, hp: 12 + game.wave * 2,
      maxHp: 12 + game.wave * 2, type: 'boss', phase: 0, diving: false
    });
  } else {
    const rows = Math.min(3 + Math.floor(game.wave / 3), 5);
    const columns = Math.min(7 + Math.floor(game.wave / 4), 9);
    const startX = (320 - (columns - 1) * 31) / 2;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        game.enemies.push({
          x: startX + column * 31,
          y: 54 + row * 30,
          width: 20,
          height: 16,
          row,
          column,
          type: row === 0 ? 'scout' : row === 1 ? 'drone' : 'invader',
          hp: row === 0 ? 2 : 1,
          phase: Math.random() * Math.PI * 2,
          diving: false
        });
      }
    }
  }
  game.enemyDirection = 1;
  game.enemyFireTimer = 1.1;
  game.diveTimer = Math.max(2.2, 4.8 - game.wave * 0.08);
  game.waveBanner = 1.6;
}

function createGame(room) {
  room.game = {
    wave: 1,
    teamScore: 0,
    enemies: [],
    playerShots: [],
    enemyShots: [],
    enemyDirection: 1,
    enemyFireTimer: 1.1,
    diveTimer: 3.5,
    waveBanner: 1.6,
    lastSnapshotAt: 0
  };
  room.players.forEach((player, index) => {
    player.ready = false;
    player.score = 0;
    player.lives = 3;
    player.x = 160 + (index - (room.players.length - 1) / 2) * 34;
    player.y = 442;
    player.width = 22;
    player.height = 20;
    player.invulnerable = 1.5;
    player.fireCooldown = 0;
    player.input = { direction: 0, fire: false, pointerX: null };
  });
  createWave(room.game);
  room.phase = 'running';
}

function gameSnapshot(room) {
  const game = room.game;
  if (!game) return null;
  return {
    wave: game.wave,
    teamScore: game.teamScore,
    waveBanner: game.waveBanner,
    enemies: game.enemies.map((enemy) => ({ ...enemy })),
    playerShots: game.playerShots.map((shot) => ({ ...shot })),
    enemyShots: game.enemyShots.map((shot) => ({ ...shot })),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      x: player.x,
      y: player.y,
      lives: player.lives,
      score: player.score,
      invulnerable: player.invulnerable,
      connected: player.connected
    }))
  };
}

function sendGameStarted(room, player) {
  if (!player.socket || player.socket.readyState !== WebSocket.OPEN) return;
  send(player.socket, {
    type: 'gameStarted',
    room: publicRoom(room),
    playerId: player.id,
    isHost: player.id === room.hostId,
    state: gameSnapshot(room)
  });
}

function broadcastGameState(room) {
  const state = gameSnapshot(room);
  for (const player of room.players) {
    if (player.socket) send(player.socket, { type: 'gameState', state });
  }
}

function endRoomGame(room) {
  if (room.phase !== 'running') return;
  room.phase = 'ended';
  const state = gameSnapshot(room);
  for (const player of room.players) {
    if (player.socket) {
      send(player.socket, { type: 'gameEnded', room: publicRoom(room), playerId: player.id, isHost: player.id === room.hostId, state });
    }
  }
  sendRoomState(room);
}

function hits(a, b) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2;
}

function damagePlayer(player, game) {
  if (player.lives <= 0 || player.invulnerable > 0) return;
  player.lives -= 1;
  player.invulnerable = 1.7;
  game.enemyShots = game.enemyShots.filter((shot) =>
    shot.y < player.y - 42 || Math.abs(shot.x - player.x) > 40
  );
}

function tickGame(room, delta, now) {
  if (room.phase !== 'running' || !room.game) return;
  const game = room.game;
  const speedSettings = {
    slow: { multiplier: 0.78, enemyShots: 0.72, fireInterval: 0.38 },
    fast: { multiplier: 1, enemyShots: 1, fireInterval: 0.29 },
    ultra: { multiplier: 1.24, enemyShots: 1.35, fireInterval: 0.22 }
  }[room.speed];
  const { multiplier, enemyShots: enemyShotMultiplier, fireInterval } = speedSettings;

  for (const player of room.players) {
    if (!player.connected || player.lives <= 0) continue;
    const input = player.input;
    if (Number.isFinite(input.pointerX)) {
      const difference = input.pointerX - player.x;
      player.x += Math.sign(difference) * Math.min(Math.abs(difference), 250 * delta);
    } else {
      player.x += input.direction * 250 * delta;
    }
    player.x = Math.max(15, Math.min(305, player.x));
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.fireCooldown = Math.max(0, player.fireCooldown - delta);
    if (input.fire && player.fireCooldown <= 0) {
      game.playerShots.push({
        x: player.x, y: player.y - 14, width: 3, height: 12,
        speed: 420, ownerId: player.id
      });
      player.fireCooldown = fireInterval;
    }
  }

  for (let index = game.playerShots.length - 1; index >= 0; index--) {
    const shot = game.playerShots[index];
    shot.y -= shot.speed * multiplier * delta;
    if (shot.y < -10) game.playerShots.splice(index, 1);
  }
  for (let index = game.enemyShots.length - 1; index >= 0; index--) {
    const shot = game.enemyShots[index];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    if (shot.y > 500 || shot.x < -10 || shot.x > 330) {
      game.enemyShots.splice(index, 1);
      continue;
    }
    const target = room.players.find((player) => player.lives > 0 && hits({ ...shot, width: 8, height: 10 }, player));
    if (target) {
      game.enemyShots.splice(index, 1);
      damagePlayer(target, game);
    }
  }

  const boss = game.enemies.length === 1 && game.enemies[0].type === 'boss';
  if (boss) {
    const enemy = game.enemies[0];
    enemy.phase += delta * multiplier;
    enemy.x = 160 + Math.sin(enemy.phase * 1.2) * 105;
    enemy.y = 72 + Math.sin(enemy.phase * 2.4) * 15;
  } else if (game.enemies.length) {
    const formationSpeed = (22 + game.wave * 3.2) * multiplier;
    const diver = game.enemies.find((enemy) => enemy.diving);
    if (diver) {
      diver.phase += delta * (1.3 + multiplier);
      diver.x += Math.sin(diver.phase * 2) * 54 * delta;
      diver.y += 65 * multiplier * delta;
      if (diver.y > 490) game.enemies.splice(game.enemies.indexOf(diver), 1);
    } else {
      const minX = Math.min(...game.enemies.map((enemy) => enemy.x));
      const maxX = Math.max(...game.enemies.map((enemy) => enemy.x));
      if (maxX > 303) game.enemyDirection = -1;
      if (minX < 17) game.enemyDirection = 1;
      game.enemies.forEach((enemy) => {
        enemy.x += game.enemyDirection * formationSpeed * delta;
        enemy.phase += delta * 2;
      });
    }
  }

  game.enemyFireTimer -= delta;
  if (game.enemyFireTimer <= 0 && game.enemies.length) {
    const livingEnemies = game.enemies.filter((enemy) => enemy.y < 430);
    const shooters = boss ? livingEnemies : livingEnemies.filter((enemy) =>
      !livingEnemies.some((other) => other.column === enemy.column && other.y > enemy.y + 2));
    const livingPlayers = room.players.filter((player) => player.connected && player.lives > 0);
    if (shooters.length && livingPlayers.length) {
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      const target = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
      const aim = (target.x - shooter.x) / 220;
      game.enemyShots.push({
        x: shooter.x, y: shooter.y + shooter.height / 2, vx: aim * 42,
        vy: (135 + game.wave * 5) * enemyShotMultiplier, width: 5, height: 10
      });
      if (boss) {
        game.enemyShots.push({ x: shooter.x - 22, y: shooter.y, vx: -35, vy: 150 * enemyShotMultiplier, width: 5, height: 10 });
        game.enemyShots.push({ x: shooter.x + 22, y: shooter.y, vx: 35, vy: 150 * enemyShotMultiplier, width: 5, height: 10 });
      }
    }
    game.enemyFireTimer = (boss ? 0.72 : 1.1) / enemyShotMultiplier * (0.85 + Math.random() * 0.5);
  }

  if (!boss && !game.enemies.some((enemy) => enemy.diving)) {
    game.diveTimer -= delta;
    if (game.diveTimer <= 0) {
      const candidates = game.enemies.filter((enemy) => enemy.y < 200);
      if (candidates.length) {
        const diver = candidates[Math.floor(Math.random() * candidates.length)];
        diver.diving = true;
        diver.phase = Math.random() * Math.PI * 2;
      }
      game.diveTimer = Math.max(1.6, 4.2 - game.wave * 0.1) / multiplier;
    }
  }

  for (let index = game.playerShots.length - 1; index >= 0; index--) {
    const shot = game.playerShots[index];
    for (let enemyIndex = game.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = game.enemies[enemyIndex];
      if (!hits(shot, enemy)) continue;
      game.playerShots.splice(index, 1);
      enemy.hp -= 1;
      if (enemy.hp <= 0) {
        const points = (enemy.type === 'boss' ? 1000 : enemy.type === 'scout' ? 40 : enemy.type === 'drone' ? 25 : 10) *
          Math.min(game.wave, 5);
        const scorer = room.players.find((player) => player.id === shot.ownerId);
        if (scorer) scorer.score += points;
        game.teamScore += points;
        game.enemies.splice(enemyIndex, 1);
      }
      break;
    }
  }

  for (let index = game.enemies.length - 1; index >= 0; index--) {
    const enemy = game.enemies[index];
    for (const player of room.players) {
      if (player.lives > 0 && hits(enemy, player)) damagePlayer(player, game);
    }
    if (enemy.y > 450) {
      game.enemies.splice(index, 1);
      const target = room.players.filter((player) => player.lives > 0)
        .sort((left, right) => Math.abs(left.x - enemy.x) - Math.abs(right.x - enemy.x))[0];
      if (target) damagePlayer(target, game);
    }
  }

  game.waveBanner = Math.max(0, game.waveBanner - delta);
  if (game.enemies.length === 0) {
    game.wave += 1;
    room.players.forEach((player) => {
      if (player.lives > 0) player.invulnerable = Math.max(player.invulnerable, 1);
    });
    createWave(game);
  }

  if (!room.players.some((player) => player.lives > 0)) {
    endRoomGame(room);
  } else if (now - game.lastSnapshotAt >= SNAPSHOT_RATE_MS) {
    game.lastSnapshotAt = now;
    broadcastGameState(room);
  }
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendRoomState(room) {
  for (const player of room.players) {
    if (!player.socket || player.socket.readyState !== WebSocket.OPEN) continue;
    send(player.socket, {
      type: 'roomState',
      room: publicRoom(room),
      playerId: player.id,
      isHost: player.id === room.hostId,
      resumeToken: player.resumeToken
    });
  }
}

function sendError(socket, code, message) {
  send(socket, { type: 'error', code, message });
}

function removePlayer(room, player) {
  clearTimeout(player.disconnectTimer);
  room.players = room.players.filter((entry) => entry !== player);
  if (player.socket) {
    player.socket.player = null;
    player.socket = null;
  }
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  if (!room.players.some((entry) => entry.id === room.hostId && entry.connected)) {
    const nextHost = room.players.find((entry) => entry.connected) || room.players[0];
    room.hostId = nextHost.id;
  }
  sendRoomState(room);
}

function attachPlayer(socket, room, player) {
  clearTimeout(player.disconnectTimer);
  if (player.socket && player.socket !== socket) {
    player.socket.player = null;
    player.socket.close(4001, 'Session resumed elsewhere');
  }
  player.socket = socket;
  player.connected = true;
  socket.player = player;
  socket.room = room;
  sendRoomState(room);
  if (room.phase === 'running') sendGameStarted(room, player);
}

function createRoom(socket, message) {
  const name = cleanName(message.nickname);
  if (!name) return sendError(socket, 'NAME_REQUIRED', 'El nombre debe contener entre 1 y 20 caracteres.');
  const visibility = message.visibility === 'private' ? 'private' : 'public';
  const speed = ['slow', 'fast', 'ultra'].includes(message.speed) ? message.speed : 'slow';
  const code = createCode();
  const player = {
    id: randomUUID(),
    resumeToken: randomBytes(32).toString('base64url'),
    name,
    color: PLAYER_COLORS[0],
    ready: false,
    connected: true,
    socket,
    disconnectTimer: null
  };
  const room = { code, visibility, hostId: player.id, players: [player], phase: 'lobby', speed, game: null };
  rooms.set(code, room);
  attachPlayer(socket, room, player);
}

function joinRoom(socket, message) {
  const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
  const room = rooms.get(code);
  if (!room) return sendError(socket, /^[A-Z0-9]{6}$/.test(code) ? 'ROOM_NOT_FOUND' : 'INVALID_CODE', 'No se encontró una sala con ese código.');
  if (room.phase === 'running') return sendError(socket, 'GAME_IN_PROGRESS', 'La partida ya comenzó. Espera a que termine para unirte.');
  if (room.players.length >= MAX_PLAYERS) return sendError(socket, 'ROOM_FULL', 'La sala ya alcanzó el máximo de jugadores.');
  const name = cleanName(message.nickname);
  if (!name) return sendError(socket, 'NAME_REQUIRED', 'El nombre debe contener entre 1 y 20 caracteres.');
  const player = {
    id: randomUUID(),
    resumeToken: randomBytes(32).toString('base64url'),
    name,
    color: PLAYER_COLORS[room.players.length % PLAYER_COLORS.length],
    ready: false,
    connected: true,
    socket,
    disconnectTimer: null
  };
  room.players.push(player);
  attachPlayer(socket, room, player);
}

function resumeRoom(socket, message) {
  const code = typeof message.roomCode === 'string' ? message.roomCode.trim().toUpperCase() : '';
  const room = rooms.get(code);
  const player = room && room.players.find((entry) =>
    entry.resumeToken === message.resumeToken && !entry.connected
  );
  if (!player) return sendError(socket, 'ROOM_NOT_FOUND', 'La sesión ya no se puede recuperar; vuelve a unirte con el código.');
  attachPlayer(socket, room, player);
}

function onMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch (error) {
    return sendError(socket, 'BAD_REQUEST', 'Mensaje JSON inválido.');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
    return sendError(socket, 'BAD_REQUEST', 'Solicitud inválida.');
  }

  if (message.type === 'create' && !socket.player) return createRoom(socket, message);
  if (message.type === 'join' && !socket.player) return joinRoom(socket, message);
  if (message.type === 'resume' && !socket.player) return resumeRoom(socket, message);
  if (message.type === 'list' && !socket.player) {
    const publicRooms = Array.from(rooms.values())
        .filter((room) => room.visibility === 'public' && room.phase !== 'running' && room.players.length < MAX_PLAYERS)
      .map((room) => ({ code: room.code, playerCount: room.players.length }));
    return send(socket, { type: 'roomList', rooms: publicRooms });
  }

  const player = socket.player;
  const room = socket.room;
  if (!player || !room) return sendError(socket, 'BAD_REQUEST', 'Primero crea o únete a una sala.');
  if (message.type === 'ready') {
    if (room.phase !== 'running') player.ready = Boolean(message.ready);
    return sendRoomState(room);
  }
  if (message.type === 'startGame') {
    if (player.id !== room.hostId) return sendError(socket, 'NOT_HOST', 'Solo el anfitrión puede iniciar la partida.');
    if (room.phase === 'running') return sendError(socket, 'GAME_IN_PROGRESS', 'La partida ya está en curso.');
    if (room.players.length < 2) return sendError(socket, 'NOT_ENOUGH_PLAYERS', 'Se necesitan al menos 2 jugadores.');
    if (!room.players.every((entry) => entry.connected && entry.ready)) {
      return sendError(socket, 'PLAYERS_NOT_READY', 'Todos los jugadores conectados deben marcarse listos.');
    }
    createGame(room);
    sendRoomState(room);
    for (const entry of room.players) sendGameStarted(room, entry);
    return;
  }
  if (message.type === 'input') {
    if (room.phase !== 'running' || !player.input || !message.input || typeof message.input !== 'object') return;
    const direction = Number(message.input.direction);
    player.input.direction = Number.isFinite(direction) ? Math.max(-1, Math.min(1, Math.sign(direction))) : 0;
    player.input.fire = Boolean(message.input.fire);
    const pointerX = message.input.pointerX;
    player.input.pointerX = Number.isFinite(pointerX) ? Math.max(15, Math.min(305, pointerX)) : null;
    return;
  }
  if (message.type === 'returnToLobby') {
    if (room.phase === 'ended') {
      room.phase = 'lobby';
      room.game = null;
      room.players.forEach((entry) => {
        entry.ready = false;
        entry.input = null;
      });
      sendRoomState(room);
    } else if (room.phase === 'running') {
      sendError(socket, 'GAME_IN_PROGRESS', 'La ronda sigue en curso; usa Volver a la calculadora para abandonar la sala.');
    }
    return;
  }
  if (message.type === 'leave') {
    removePlayer(room, player);
    send(socket, { type: 'left' });
    return socket.close(1000, 'Left room');
  }
  sendError(socket, 'BAD_REQUEST', 'Tipo de solicitud desconocido.');
}

httpServer.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (request.url !== '/galaxy') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit('connection', websocket, request);
  });
});

websocketServer.on('connection', (socket) => {
  socket.messageWindowStarted = Date.now();
  socket.messageCount = 0;
  socket.on('message', (raw) => {
    const now = Date.now();
    if (now - socket.messageWindowStarted > 5000) {
      socket.messageWindowStarted = now;
      socket.messageCount = 0;
    }
    socket.messageCount += 1;
    if (socket.messageCount > 160) {
      socket.close(1008, 'Too many requests');
      return;
    }
    onMessage(socket, raw);
  });
  socket.on('close', () => {
    const player = socket.player;
    const room = socket.room;
    if (!player || !room || player.socket !== socket) return;
    player.connected = false;
    player.socket = null;
    if (player.input) player.input = { direction: 0, fire: false, pointerX: null };
    player.disconnectTimer = setTimeout(() => removePlayer(room, player), RESUME_GRACE_MS);
    sendRoomState(room);
  });
  socket.on('error', (error) => {
    console.error('Error de WebSocket:', error.message);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Galaxia lobby escuchando en el puerto ${PORT}.`);
});

let previousTick = Date.now();
const gameTicker = setInterval(() => {
  const now = Date.now();
  const delta = Math.min((now - previousTick) / 1000, 0.1);
  previousTick = now;
  for (const room of rooms.values()) tickGame(room, delta, now);
}, TICK_RATE_MS);

const heartbeat = setInterval(() => {
  for (const socket of websocketServer.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 25_000);

websocketServer.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
});

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(gameTicker);
  for (const room of rooms.values()) {
    for (const player of room.players) clearTimeout(player.disconnectTimer);
  }
  websocketServer.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
