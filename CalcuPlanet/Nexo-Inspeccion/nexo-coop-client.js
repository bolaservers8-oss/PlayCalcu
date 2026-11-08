(function () {
  'use strict';

  const SESSION_KEY = 'calcuPlanetNexoSessionV1';
  const NICKNAME_KEY = 'calcuPlanetNexoNicknameV1';
  const $ = (id) => document.getElementById(id);
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false, shoot: false, melee: false, interact: false };
  let socket = null;
  let roomState = null;
  let playerId = null;
  let isHost = false;
  let ready = false;
  let running = false;
  let manuallyClosed = false;
  let reconnectTimer = null;
  let inputTimer = null;
  let frame = null;
  let previousState = null;
  let currentState = null;
  let snapshotAt = 0;
  let snapshotDuration = 67;
  let lastFrameAt = 0;
  let predictedPlayer = null;
  let soloMode = false;
  let soloRoom = null;
  let lastSoloTickAt = 0;
  let aim = { x: 480, y: 270 };
  let mouseFiring = false;
  let nextShotSoundAt = 0;

  function setStatus(message) {
    $('nexoOnlineStatus').textContent = message;
  }

  function session() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch (error) {
      console.warn('No se pudo leer la sesión de Nexo:', error);
      return null;
    }
  }

  function saveSession(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn('No se pudo guardar la sesión de Nexo:', error);
    }
  }

  function saveNickname(value) {
    try {
      sessionStorage.setItem(NICKNAME_KEY, value);
    } catch (error) {
      console.warn('No se pudo guardar el nombre de agente:', error);
    }
  }

  function loadNickname() {
    try {
      return sessionStorage.getItem(NICKNAME_KEY) || '';
    } catch (error) {
      console.warn('No se pudo leer el nombre de agente:', error);
      return '';
    }
  }

  function socketUrl() {
    const base = String((window.DATA_MAP_CONFIG || {}).galaxyRealtimeUrl || '').trim().replace(/\/+$/, '');
    if (base) return `${base}/galaxy`;
    if (window.location.protocol === 'file:' ||
        (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '2567')) {
      return 'ws://localhost:2567/galaxy';
    }
    return '';
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('No hay conexión con el servidor. Revisa la configuración online.');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function closeSocket() {
    manuallyClosed = true;
    clearTimeout(reconnectTimer);
    clearInterval(inputTimer);
    inputTimer = null;
    reconnectTimer = null;
    if (socket) {
      const oldSocket = socket;
      socket = null;
      oldSocket.close();
    }
  }

  function connect(message, reconnecting = false) {
    const url = socketUrl();
    if (!url) {
      setStatus('Configura galaxyRealtimeUrl en data-map-config.js para conectar el cooperativo.');
      return;
    }
    closeSocket();
    manuallyClosed = false;
    setStatus(reconnecting ? 'Reconectando a la operación…' : 'Conectando al servidor…');
    try {
      socket = new WebSocket(url);
    } catch (error) {
      setStatus('No se pudo abrir la conexión WebSocket.');
      return;
    }
    const activeSocket = socket;
    activeSocket.addEventListener('open', () => {
      if (activeSocket === socket) activeSocket.send(JSON.stringify(message));
    });
    activeSocket.addEventListener('message', (event) => {
      if (activeSocket !== socket) return;
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (error) {
        setStatus('El servidor envió una respuesta ilegible.');
        return;
      }
      handleMessage(payload);
    });
    activeSocket.addEventListener('error', () => {
      if (activeSocket === socket) setStatus('No se pudo conectar. Comprueba que el servidor esté activo.');
    });
    activeSocket.addEventListener('close', () => {
      if (activeSocket !== socket) return;
      if (!manuallyClosed && session()) {
        setStatus('Conexión interrumpida. Reintentando…');
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          const saved = session();
          if (saved) connect({ type: 'resume', roomCode: saved.roomCode, resumeToken: saved.resumeToken }, true);
        }, 1500);
      } else if (!manuallyClosed) {
        setStatus('Se cerró la conexión con el servidor.');
      }
    });
  }

  function nickname() {
    const value = $('nexoNickname').value.trim().slice(0, 20);
    if (!value) {
      setStatus('Escribe un nombre antes de continuar.');
      $('nexoNickname').focus();
      return '';
    }
    saveNickname(value);
    return value;
  }

  function renderRooms(rooms) {
    const list = $('nexoPublicRooms');
    list.replaceChildren();
    rooms = rooms.filter((room) => room.gameType === 'nexo');
    if (!rooms.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No hay salas públicas disponibles.';
      list.appendChild(empty);
      return;
    }
    rooms.forEach((room) => {
      const row = document.createElement('div');
      row.className = 'nexo-room-row';
      const label = document.createElement('span');
      label.textContent = `${room.code} · ${room.playerCount}/${room.maxPlayers || 2} agentes`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Unirse';
      button.addEventListener('click', () => {
        const name = nickname();
        if (!name) return;
        saveSession(null);
        connect({ type: 'join', gameType: 'nexo', code: room.code, nickname: name });
      });
      row.append(label, button);
      list.appendChild(row);
    });
  }

  function renderRoom(room, currentPlayerId, host) {
    roomState = room;
    playerId = currentPlayerId;
    isHost = host;
    const compatible = room.gameProtocol >= 4 && room.gameType === 'nexo';
    const currentPlayer = room.players.find((player) => player.id === playerId);
    ready = Boolean(currentPlayer && currentPlayer.ready);
    $('nexoLobby').hidden = false;
    $('nexoLobbyCode').textContent = room.code;
    $('nexoReady').hidden = room.phase === 'running';
    $('nexoReady').disabled = !compatible;
    $('nexoReady').textContent = ready ? 'Cancelar listo' : 'Marcarme listo';
    $('nexoReturnLobby').disabled = room.phase !== 'ended';
    $('nexoStartGame').hidden = !compatible || !host || room.phase === 'running' ||
      room.players.length !== 2 || !room.players.every((player) => player.connected && player.ready);
    $('nexoStartGame').textContent = room.phase === 'ended' ? 'Iniciar otra operación' : 'Iniciar operación';
    const list = $('nexoPlayerList');
    list.replaceChildren();
    room.players.forEach((player) => {
      const item = document.createElement('li');
      item.className = 'nexo-lobby-player';
      const label = document.createElement('span');
      label.textContent = `${player.name}${player.id === playerId ? ' · tú' : ''}${player.id === room.hostId ? ' · líder' : ''}`;
      const status = document.createElement('span');
      status.textContent = player.ready ? 'LISTO' : player.connected ? 'ESPERANDO' : 'RECONEXIÓN…';
      item.append(label, status);
      list.appendChild(item);
    });
    setStatus(compatible
      ? `${room.players.length}/2 agentes · ${room.phase === 'running' ? 'operación en curso' : 'esperando al equipo'}`
      : 'Actualiza el servidor en Render para iniciar Nexo (protocolo 4).');
  }

  function handleMessage(message) {
    if (message.type === 'roomState') {
      if (message.room.gameType !== 'nexo' || message.room.gameProtocol < 4) {
        saveSession(null);
        roomState = null;
        manuallyClosed = true;
        send({ type: 'leave' });
        setStatus('El servidor no reconoce Nexo. Actualiza el servicio en Render y vuelve a intentar.');
        return;
      }
      if (message.resumeToken) saveSession({ roomCode: message.room.code, resumeToken: message.resumeToken });
      renderRoom(message.room, message.playerId, message.isHost);
    } else if (message.type === 'roomList') {
      renderRooms(message.rooms);
      if (!message.rooms.length) setStatus('No hay salas públicas ahora; crea una o únete con código.');
    } else if (message.type === 'gameStarted') {
      renderRoom(message.room, message.playerId, message.isHost);
      startGame(message.state);
    } else if (message.type === 'gameState') {
      applyState(message.state);
    } else if (message.type === 'gameEnded') {
      roomState = message.room;
      renderRoom(message.room, message.playerId, message.isHost);
      applyState(message.state);
      stopGame();
      $('nexoGameStatus').textContent = message.state.result === 'victory'
        ? 'Operación completada: el equipo alcanzó la salida.'
        : 'Operación fallida: el equipo agotó sus reservas.';
      $('nexoReturnLobby').disabled = false;
    } else if (message.type === 'left') {
      saveSession(null);
      roomState = null;
      $('nexoLobby').hidden = true;
      setStatus('Saliste de la sala.');
    } else if (message.type === 'error') {
      const messages = {
        ROOM_FULL: 'La sala ya tiene dos agentes.',
        ROOM_NOT_FOUND: 'La sala ya no existe o el código venció.',
        GAME_IN_PROGRESS: 'La operación ya comenzó.',
        NOT_ENOUGH_PLAYERS: 'Se necesitan dos agentes para iniciar.',
        PLAYERS_NOT_READY: 'Los dos agentes deben marcarse listos.',
        GAME_TYPE_MISMATCH: 'Ese código pertenece a una sala de otro juego.',
        BAD_REQUEST: 'No se pudo completar la solicitud.'
      };
      if (message.code === 'ROOM_NOT_FOUND') saveSession(null);
      setStatus(messages[message.code] || message.message || 'El servidor rechazó la solicitud.');
    }
  }

  function openPanel() {
    $('nexoPanel').classList.add('active');
    window.setCalcuNexoMode(true);
    const savedName = loadNickname();
    if (savedName && !$('nexoNickname').value) $('nexoNickname').value = savedName;
    const saved = session();
    if (saved) connect({ type: 'resume', roomCode: saved.roomCode, resumeToken: saved.resumeToken }, true);
    else connect({ type: 'list', gameType: 'nexo' });
  }

  function startGame(state) {
    running = true;
    $('nexoPanel').classList.add('nexo-playing');
    previousState = null;
    currentState = null;
    predictedPlayer = null;
    snapshotAt = 0;
    lastFrameAt = 0;
    $('nexoLobbyView').hidden = true;
    $('nexoGameView').hidden = false;
    $('nexoGameStatus').textContent = soloMode
      ? 'Modo individual: elimina a los guardias y alcanza el punto de extracción.'
      : 'Neutralicen la vigilancia y lleguen juntos al punto de extracción.';
    $('nexoReturnLobby').disabled = true;
    $('nexoReturnLobby').textContent = soloMode ? 'Jugar otra vez' : 'Volver a la sala';
    window.setCalcuNexoMode(true);
    applyState(state);
    clearInterval(inputTimer);
    inputTimer = setInterval(() => {
      if (!running) return;
      if (!soloMode) {
        send({ type: 'input', input: currentInput() });
        return;
      }
      const now = Date.now();
      const delta = Math.min((now - lastSoloTickAt) / 1000, 0.05);
      lastSoloTickAt = now;
      const player = soloRoom.players[0];
      player.input = currentInput();
      player.lastInputAt = now;
      window.NexoSoloEngine.tickNexoGame(soloRoom, delta, now, () => {
        const finalState = window.NexoSoloEngine.nexoGameSnapshot(soloRoom);
        applyState(finalState);
        drawArena(finalState, performance.now() / 1000);
        stopGame();
        $('nexoGameStatus').textContent = finalState.result === 'victory'
          ? 'Operación completada: alcanzaste la salida.'
          : 'Operación fallida: agotaste tus reservas.';
        $('nexoReturnLobby').disabled = false;
      });
      if (running) applyState(window.NexoSoloEngine.nexoGameSnapshot(soloRoom));
    }, 33);
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderFrame);
    window.playCalcuGameSound('start');
  }

  function stopGame() {
    running = false;
    $('nexoPanel').classList.remove('nexo-playing');
    clearInterval(inputTimer);
    inputTimer = null;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    keys.clear();
    mouseFiring = false;
    Object.keys(touch).forEach((key) => { touch[key] = false; });
  }

  function applyState(state) {
    if (!state) return;
    const receivedAt = performance.now();
    if (currentState) {
      previousState = currentState;
      snapshotDuration = Math.max(50, Math.min(180, receivedAt - snapshotAt));
    } else {
      previousState = state;
    }
    currentState = state;
    snapshotAt = receivedAt;
    const localPlayer = (state.players || []).find((player) => player.id === playerId);
    const previousLocalPlayer = previousState &&
      (previousState.players || []).find((player) => player.id === playerId);
    if (localPlayer) {
      if (!predictedPlayer) predictedPlayer = { x: localPlayer.x, y: localPlayer.y };
      else {
        predictedPlayer.x += Math.max(-8, Math.min(8, (localPlayer.x - predictedPlayer.x) * 0.3));
        predictedPlayer.y += Math.max(-8, Math.min(8, (localPlayer.y - predictedPlayer.y) * 0.3));
      }
      $('nexoHudLives').textContent = localPlayer.lives;
      $('nexoHudAmmo').textContent = localPlayer.ammo;
      $('nexoHudPlayers').textContent = `${state.players.filter((player) => player.lives > 0).length}/${soloMode ? 1 : 2}`;
      $('nexoHudScore').textContent = state.score;
      $('nexoHudObjective').textContent = state.exitUnlocked ? 'Alcanzar extracción' : 'Neutralizar vigilancia';
      if (previousLocalPlayer && localPlayer.lives < previousLocalPlayer.lives) window.playCalcuGameSound('hit');
    }
    if (previousState) {
      const enemies = new Map((state.enemies || []).map((enemy) => [enemy.id, enemy]));
      let destroyed = false;
      let damaged = false;
      (previousState.enemies || []).forEach((enemy) => {
        const updated = enemies.get(enemy.id);
        if (!updated) destroyed = true;
        else if (updated.hp < enemy.hp) damaged = true;
      });
      if (destroyed) window.playCalcuGameSound('clear');
      else if (damaged) window.playCalcuGameSound('impact');
    }
  }

  function currentInput() {
    const horizontal = Number(keys.has('d') || keys.has('arrowright') || touch.right) -
      Number(keys.has('a') || keys.has('arrowleft') || touch.left);
    const vertical = Number(keys.has('s') || keys.has('arrowdown') || touch.down) -
      Number(keys.has('w') || keys.has('arrowup') || touch.up);
    const length = Math.hypot(horizontal, vertical);
    return {
      moveX: length ? horizontal / length : 0,
      moveY: length ? vertical / length : 0,
      aimX: aim.x,
      aimY: aim.y,
      shoot: mouseFiring || touch.shoot || keys.has('f'),
      melee: keys.has(' ') || touch.melee,
      interact: keys.has('e') || touch.interact
    };
  }

  function updateAim(event) {
    const canvas = $('nexoCanvas');
    const bounds = canvas.getBoundingClientRect();
    aim = {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height
    };
  }

  function handleKeyDown(event) {
    if (!running) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e', 'f'].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
    if (key === 'escape') {
      event.preventDefault();
      setStatus('Usa “Volver a la sala” para regresar al lobby sin cerrar la sesión.');
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function releaseAll() {
    keys.clear();
    mouseFiring = false;
    Object.keys(touch).forEach((key) => { touch[key] = false; });
  }

  function interpolate(list, oldList, amount) {
    const oldById = new Map((oldList || []).map((entity) => [entity.id, entity]));
    return (list || []).map((entity) => {
      const old = oldById.get(entity.id);
      if (!old) return entity;
      return {
        ...entity,
        x: old.x + (entity.x - old.x) * amount,
        y: old.y + (entity.y - old.y) * amount
      };
    });
  }

  function localBlocked(map, x, y) {
    const radius = 12;
    const solids = [...map.walls, ...map.cover, ...map.doors.filter((door) => !door.open)];
    return solids.some((rect) => {
      const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
      const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
      return (x - closestX) ** 2 + (y - closestY) ** 2 < radius ** 2;
    });
  }

  function drawAgent(context, player, time) {
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle || 0);
    context.globalAlpha = player.lives > 0 ? (player.invulnerable > 0 && Math.floor(time * 10) % 2 ? 0.4 : 1) : 0.25;
    context.fillStyle = player.color || '#a6f2d8';
    context.beginPath();
    context.moveTo(15, 0);
    context.lineTo(5, 11);
    context.lineTo(-10, 9);
    context.lineTo(-12, 0);
    context.lineTo(-10, -9);
    context.lineTo(5, -11);
    context.closePath();
    context.fill();
    context.fillStyle = '#e9fff7';
    context.fillRect(1, -3, 17, 6);
    context.restore();
    context.globalAlpha = 1;
    context.fillStyle = '#e1efe8';
    context.font = '12px "SFMono-Regular", Consolas, monospace';
    context.textAlign = 'center';
    context.fillText(`${player.name} · ${player.lives}`, player.x, player.y - 20);
  }

  function drawArena(state, time) {
    const canvas = $('nexoCanvas');
    const context = canvas.getContext('2d');
    if (!context || !state.map) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#101819';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(177, 210, 192, .045)';
    context.lineWidth = 1;
    for (let x = 18; x < canvas.width; x += 32) {
      context.beginPath(); context.moveTo(x, 18); context.lineTo(x, canvas.height - 18); context.stroke();
    }
    for (let y = 18; y < canvas.height; y += 32) {
      context.beginPath(); context.moveTo(18, y); context.lineTo(canvas.width - 18, y); context.stroke();
    }
    state.map.walls.forEach((wall) => {
      context.fillStyle = '#38433f';
      context.fillRect(wall.x, wall.y, wall.width, wall.height);
      context.strokeStyle = '#65736a';
      context.strokeRect(wall.x + .5, wall.y + .5, wall.width - 1, wall.height - 1);
    });
    state.map.cover.forEach((cover) => {
      context.fillStyle = '#4b5148';
      context.fillRect(cover.x, cover.y, cover.width, cover.height);
      context.fillStyle = 'rgba(229, 232, 198, .18)';
      context.fillRect(cover.x + 3, cover.y + 3, Math.max(0, cover.width - 6), 3);
    });
    state.map.doors.forEach((door) => {
      context.fillStyle = door.open ? '#52756a' : '#c08c57';
      context.fillRect(door.x, door.y, door.width, door.height);
      if (!door.open) {
        context.strokeStyle = '#f0d7a3';
        context.strokeRect(door.x + 4, door.y + 4, door.width - 8, door.height - 8);
      }
    });
    const exit = state.map.exit;
    context.beginPath();
    context.arc(exit.x, exit.y, exit.radius, 0, Math.PI * 2);
    context.fillStyle = state.exitUnlocked ? 'rgba(86, 240, 191, .18)' : 'rgba(152, 165, 151, .08)';
    context.fill();
    context.strokeStyle = state.exitUnlocked ? '#8df4c8' : '#79847b';
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = state.exitUnlocked ? '#a6f2d8' : '#86928a';
    context.font = 'bold 12px "SFMono-Regular", Consolas, monospace';
    context.textAlign = 'center';
    context.fillText(state.exitUnlocked ? 'SALIDA · E' : 'SALIDA', exit.x, exit.y + 4);

    (state.pickups || []).filter((pickup) => !pickup.collected).forEach((pickup) => {
      context.fillStyle = '#f1d27b';
      context.fillRect(pickup.x - 7, pickup.y - 7, 14, 14);
      context.strokeStyle = '#fff0bd';
      context.strokeRect(pickup.x - 5, pickup.y - 5, 10, 10);
    });
    (state.enemies || []).forEach((enemy) => {
      context.save();
      context.translate(enemy.x, enemy.y);
      context.fillStyle = enemy.alert > 0 ? '#de7866' : '#a9b48d';
      context.beginPath();
      context.arc(0, 0, enemy.type === 'heavy' ? 14 : 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#17201d';
      context.fillRect(1, -3, 14, 6);
      context.restore();
      if (enemy.type === 'heavy') {
        context.fillStyle = '#1c2824';
        context.fillRect(enemy.x - 15, enemy.y - 20, 30, 4);
        context.fillStyle = '#e09a74';
        context.fillRect(enemy.x - 15, enemy.y - 20, 30 * enemy.hp / 2, 4);
      }
      if (enemy.alert > 0) {
        context.fillStyle = '#ffc778';
        context.font = 'bold 15px sans-serif';
        context.textAlign = 'center';
        context.fillText('!', enemy.x, enemy.y - 19);
      }
    });
    (state.playerShots || []).forEach((shot) => {
      context.fillStyle = '#fff0bf';
      context.beginPath(); context.arc(shot.x, shot.y, 3, 0, Math.PI * 2); context.fill();
    });
    (state.enemyShots || []).forEach((shot) => {
      context.fillStyle = '#ff927d';
      context.beginPath(); context.arc(shot.x, shot.y, 3.5, 0, Math.PI * 2); context.fill();
    });
    (state.players || []).forEach((player) => {
      drawAgent(context, player, time);
    });
  }

  function renderFrame(timestamp) {
    frame = null;
    if (!running || document.hidden || !currentState) return;
    const delta = lastFrameAt ? Math.min((timestamp - lastFrameAt) / 1000, 0.05) : 0;
    lastFrameAt = timestamp;
    const elapsed = Math.max(0, timestamp - snapshotAt);
    const amount = Math.min(1, elapsed / snapshotDuration);
    const state = {
      ...currentState,
      players: interpolate(currentState.players, previousState && previousState.players, amount),
      enemies: interpolate(currentState.enemies, previousState && previousState.enemies, amount),
      playerShots: interpolate(currentState.playerShots, previousState && previousState.playerShots, amount),
      enemyShots: interpolate(currentState.enemyShots, previousState && previousState.enemyShots, amount)
    };
    const localPlayer = state.players.find((player) => player.id === playerId);
    if (localPlayer && predictedPlayer && localPlayer.lives > 0) {
      const input = currentInput();
      const nextX = Math.max(30, Math.min(930, predictedPlayer.x + input.moveX * 190 * delta));
      const nextY = Math.max(30, Math.min(510, predictedPlayer.y + input.moveY * 190 * delta));
      if (!localBlocked(currentState.map, nextX, predictedPlayer.y)) predictedPlayer.x = nextX;
      if (!localBlocked(currentState.map, predictedPlayer.x, nextY)) predictedPlayer.y = nextY;
      localPlayer.x = predictedPlayer.x;
      localPlayer.y = predictedPlayer.y;
      localPlayer.angle = Math.atan2(aim.y - predictedPlayer.y, aim.x - predictedPlayer.x);
      const now = performance.now();
      if (input.shoot && now >= nextShotSoundAt) {
        window.playCalcuGameSound('shot');
        nextShotSoundAt = now + 220;
      }
    }
    drawArena(state, timestamp / 1000);
    frame = requestAnimationFrame(renderFrame);
  }

  function startInputUpdates() {
    clearInterval(inputTimer);
    inputTimer = setInterval(() => {
      if (running) send({ type: 'input', input: currentInput() });
    }, 33);
  }

  function leaveToLobby() {
    if (soloMode) {
      startSoloGame();
      return;
    }
    if (!roomState || roomState.phase !== 'ended') {
      $('nexoGameStatus').textContent = 'La operación sigue activa. Sal al menú si quieres abandonar la sala.';
      return;
    }
    stopGame();
    send({ type: 'returnToLobby' });
    $('nexoGameView').hidden = true;
    $('nexoLobbyView').hidden = false;
    $('nexoGameStatus').textContent = '';
  }

  function exitToCalculator() {
    stopGame();
    if (roomState) send({ type: 'leave' });
    saveSession(null);
    roomState = null;
    soloRoom = null;
    soloMode = false;
    closeSocket();
    $('nexoLobby').hidden = true;
    $('nexoGameView').hidden = true;
    $('nexoLobbyView').hidden = false;
    $('nexoPanel').classList.remove('active');
    window.setCalcuNexoMode(false);
  }

  function startSoloGame() {
    if (!window.NexoSoloEngine) {
      setStatus('No se pudo cargar la simulación local. Recarga la página e inténtalo otra vez.');
      return;
    }
    stopGame();
    closeSocket();
    saveSession(null);
    roomState = null;
    playerId = 'solo-player';
    soloMode = true;
    soloRoom = {
      phase: 'lobby',
      players: [{
        id: playerId,
        name: 'Agente',
        connected: true,
        input: currentInput(),
        lastInputAt: Date.now()
      }]
    };
    window.NexoSoloEngine.createNexoGame(soloRoom);
    lastSoloTickAt = Date.now();
    $('nexoLobbyView').hidden = true;
    $('nexoGameView').hidden = false;
    startGame(window.NexoSoloEngine.nexoGameSnapshot(soloRoom));
  }

  function initialize() {
    $('nexoCreateRoom').addEventListener('click', () => {
      const name = nickname();
      if (!name) return;
      saveSession(null);
      connect({ type: 'create', gameType: 'nexo', nickname: name, visibility: $('nexoVisibility').value });
    });
    $('nexoJoinRoom').addEventListener('click', () => {
      const name = nickname();
      if (!name) return;
      const code = $('nexoJoinCode').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        setStatus('El código debe tener seis letras o números.');
        $('nexoJoinCode').focus();
        return;
      }
      saveSession(null);
      connect({ type: 'join', gameType: 'nexo', code, nickname: name });
    });
    $('nexoRefreshRooms').addEventListener('click', () => connect({ type: 'list', gameType: 'nexo' }));
    $('nexoReady').addEventListener('click', () => send({ type: 'ready', ready: !ready }));
    $('nexoStartGame').addEventListener('click', () => send({ type: 'startGame' }));
    $('nexoLeaveRoom').addEventListener('click', () => {
      send({ type: 'leave' });
      saveSession(null);
      roomState = null;
      closeSocket();
      $('nexoLobby').hidden = true;
      connect({ type: 'list', gameType: 'nexo' });
    });
    $('nexoCopyInvite').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('nexoLobbyCode').textContent);
        setStatus('Código copiado.');
      } catch (error) {
        setStatus('No se pudo copiar. Anota el código para compartirlo.');
      }
    });
    $('nexoReturnLobby').addEventListener('click', leaveToLobby);
    $('nexoGameExit').addEventListener('click', exitToCalculator);
    $('nexoExit').addEventListener('click', exitToCalculator);
    $('nexoJoinCode').addEventListener('input', (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    $('playNexoSolo').addEventListener('click', startSoloGame);

    const canvas = $('nexoCanvas');
    canvas.addEventListener('pointermove', updateAim);
    canvas.addEventListener('pointerdown', (event) => {
      updateAim(event);
      if (event.pointerType === 'mouse' && event.button === 0) mouseFiring = true;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) =>
      canvas.addEventListener(name, () => { mouseFiring = false; })
    );
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    document.querySelectorAll('[data-nexo-control]').forEach((button) => {
      const control = button.dataset.nexoControl;
      const release = () => { touch[control] = false; button.setAttribute('aria-pressed', 'false'); };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        touch[control] = true;
        button.setAttribute('aria-pressed', 'true');
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => button.addEventListener(name, release));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = null;
        lastFrameAt = 0;
        releaseAll();
      } else if (!document.hidden && running && !frame) {
        frame = requestAnimationFrame(renderFrame);
      }
    });
  }

  window.openNexoGame = openPanel;
  window.startNexoSoloGame = startSoloGame;
  window.NexoGame = { handleKeyDown, handleKeyUp, releaseAll };
  window.addEventListener('load', initialize, { once: true });
})();
