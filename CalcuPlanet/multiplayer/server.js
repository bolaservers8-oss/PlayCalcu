import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 2567);
const MAX_PLAYERS = 4;
const MAX_MESSAGE_BYTES = 4096;
const RESUME_GRACE_MS = 30_000;
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
}

function createRoom(socket, message) {
  const name = cleanName(message.nickname);
  if (!name) return sendError(socket, 'NAME_REQUIRED', 'El nombre debe contener entre 1 y 20 caracteres.');
  const visibility = message.visibility === 'private' ? 'private' : 'public';
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
  const room = { code, visibility, hostId: player.id, players: [player] };
  rooms.set(code, room);
  attachPlayer(socket, room, player);
}

function joinRoom(socket, message) {
  const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
  const room = rooms.get(code);
  if (!room) return sendError(socket, /^[A-Z0-9]{6}$/.test(code) ? 'ROOM_NOT_FOUND' : 'INVALID_CODE', 'No se encontró una sala con ese código.');
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
      .filter((room) => room.visibility === 'public' && room.players.length < MAX_PLAYERS)
      .map((room) => ({ code: room.code, playerCount: room.players.length }));
    return send(socket, { type: 'roomList', rooms: publicRooms });
  }

  const player = socket.player;
  const room = socket.room;
  if (!player || !room) return sendError(socket, 'BAD_REQUEST', 'Primero crea o únete a una sala.');
  if (message.type === 'ready') {
    player.ready = Boolean(message.ready);
    return sendRoomState(room);
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
    if (socket.messageCount > 40) {
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
  for (const room of rooms.values()) {
    for (const player of room.players) clearTimeout(player.disconnectTimer);
  }
  websocketServer.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
