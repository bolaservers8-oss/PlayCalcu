(function () {
  'use strict';

  const SESSION_KEY = 'calcuPlanetGalaxyLobbyV1';
  const NICKNAME_KEY = 'calcuPlanetGalaxyNicknameV1';
  const $ = (id) => document.getElementById(id);
  let socket = null;
  let roomState = null;
  let playerId = null;
  let isHost = false;
  let ready = false;
  let manuallyClosed = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let inputTimer = null;

  function setStatus(message) {
    $('galaxyOnlineStatus').textContent = message;
  }

  function getSocketUrl() {
    const configured = String((window.DATA_MAP_CONFIG || {}).galaxyRealtimeUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '') + '/galaxy';
    if (window.location.protocol === 'file:' ||
        (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '2567')) {
      return 'ws://localhost:2567/galaxy';
    }
    return '';
  }

  function savedSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch (error) {
      console.warn('No se pudo leer la sesión del lobby:', error);
      return null;
    }
  }

  function persistSession(session) {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn('No se pudo guardar la sesión del lobby:', error);
    }
  }

  function getSavedNickname() {
    try {
      return sessionStorage.getItem(NICKNAME_KEY) || '';
    } catch (error) {
      console.warn('No se pudo leer el nombre del piloto:', error);
      return '';
    }
  }

  function saveNickname(value) {
    try {
      sessionStorage.setItem(NICKNAME_KEY, value);
    } catch (error) {
      console.warn('No se pudo guardar el nombre del piloto:', error);
    }
  }

  function setBusy(busy) {
    ['createGalaxyRoom', 'joinGalaxyRoom', 'refreshGalaxyRooms'].forEach((id) => {
      $(id).disabled = busy;
    });
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('No hay conexión con el servidor de salas.');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function nickname() {
    const value = $('galaxyNickname').value.trim().slice(0, 20);
    if (!value) {
      setStatus('Escribe un nombre antes de continuar.');
      $('galaxyNickname').focus();
      return '';
    }
    saveNickname(value);
    return value;
  }

  function closeSocket() {
    manuallyClosed = true;
    clearTimeout(reconnectTimer);
    clearInterval(inputTimer);
    inputTimer = null;
    reconnectTimer = null;
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function connect(initialMessage, reconnecting) {
    const url = getSocketUrl();
    if (!url) {
      setStatus('Configura galaxyRealtimeUrl en data-map-config.js con la URL WebSocket segura de tu servidor (wss://...).');
      setBusy(false);
      return;
    }
    closeSocket();
    manuallyClosed = false;
    setBusy(true);
    setStatus(reconnecting ? 'Reconectando a la sala…' : 'Conectando al servidor de salas…');
    try {
      socket = new WebSocket(url);
    } catch (error) {
      setStatus('No se pudo abrir la conexión WebSocket. Revisa la URL del servidor.');
      setBusy(false);
      return;
    }
    const activeSocket = socket;
    activeSocket.addEventListener('open', () => {
      if (activeSocket !== socket) return;
      reconnectAttempt = 0;
      activeSocket.send(JSON.stringify(initialMessage));
    });
    activeSocket.addEventListener('message', (event) => {
      if (activeSocket !== socket) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        setStatus('El servidor envió una respuesta que no se pudo interpretar.');
        return;
      }
      handleMessage(message);
    });
    activeSocket.addEventListener('error', () => {
      if (activeSocket === socket) setStatus('No se pudo conectar. Comprueba que el servidor esté activo y que la URL sea correcta.');
    });
    activeSocket.addEventListener('close', () => {
      if (activeSocket !== socket) return;
      setBusy(false);
      if (!manuallyClosed && savedSession()) scheduleReconnect();
      else if (!manuallyClosed) setStatus('Se cerró la conexión con el servidor.');
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempt), 8000);
    reconnectAttempt += 1;
    setStatus('Conexión interrumpida. Reintentando…');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      const session = savedSession();
      if (session && session.resumeToken) {
        connect({ type: 'resume', roomCode: session.roomCode, resumeToken: session.resumeToken }, true);
      }
    }, delay);
  }

  function renderRoomList(rooms) {
    const container = $('galaxyPublicRooms');
    container.replaceChildren();
    if (!rooms.length) {
      const empty = document.createElement('p');
      empty.className = 'galaxy-help';
      empty.textContent = 'No hay salas públicas disponibles. Puedes crear una o unirte con invitación.';
      container.appendChild(empty);
      return;
    }
    rooms.forEach((room) => {
      const row = document.createElement('div');
      row.className = 'galaxy-room-entry';
      const details = document.createElement('span');
      details.textContent = `${room.code} · ${room.playerCount}/4 pilotos`;
      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = 'Unirse';
      join.addEventListener('click', () => {
        const name = nickname();
        if (!name) return;
        persistSession(null);
        connect({ type: 'join', code: room.code, nickname: name }, false);
      });
      row.append(details, join);
      container.appendChild(row);
    });
  }

  function renderRoom(room, currentPlayerId, host) {
    roomState = room;
    playerId = currentPlayerId;
    isHost = host;
    const currentPlayer = room.players.find((player) => player.id === playerId);
    ready = Boolean(currentPlayer && currentPlayer.ready);
    const canStart = host && room.phase !== 'running' && room.players.length >= 2 &&
      room.players.every((player) => player.connected && player.ready);
    $('galaxyLobby').hidden = false;
    $('galaxyLobbyCode').textContent = room.code;
    $('toggleGalaxyReady').textContent = ready ? 'Cancelar listo' : 'Marcarme listo';
    $('toggleGalaxyReady').hidden = room.phase === 'running';
    $('startGalaxyCoop').hidden = !canStart;
    $('startGalaxyCoop').textContent = room.phase === 'ended' ? 'Iniciar otra ronda' : 'Iniciar partida cooperativa';
    const list = $('galaxyPlayerList');
    list.replaceChildren();
    room.players.forEach((player) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      const flags = [];
      if (player.id === room.hostId) flags.push('anfitrión');
      if (player.id === playerId) flags.push('tú');
      label.textContent = `${player.name}${flags.length ? ` · ${flags.join(' · ')}` : ''}`;
      const status = document.createElement('span');
      status.textContent = player.ready ? 'LISTO' : player.connected ? 'ESPERANDO' : 'RECONEXIÓN…';
      status.style.color = player.ready ? '#83f5c5' : player.connected ? '#aab6c8' : '#ffc77b';
      item.append(label, status);
      list.appendChild(item);
    });
    const phaseText = room.phase === 'running' ? ' · partida en curso' : room.phase === 'ended' ? ' · ronda terminada' : '';
    setStatus(`Sala ${room.visibility === 'private' ? 'privada' : 'pública'} · ${room.players.length}/4 pilotos${isHost ? ' · eres anfitrión' : ''}${phaseText}.`);
    setBusy(false);
  }

  function startInputUpdates() {
    clearInterval(inputTimer);
    inputTimer = setInterval(() => {
      if (!roomState || roomState.phase !== 'running' || !window.getGalaxyCoopInput) return;
      send({ type: 'input', input: window.getGalaxyCoopInput() });
    }, 50);
  }

  function handleMessage(message) {
    if (message.type === 'roomState') {
      if (message.resumeToken) persistSession({ roomCode: message.room.code, resumeToken: message.resumeToken });
      renderRoom(message.room, message.playerId, message.isHost);
    } else if (message.type === 'gameStarted') {
      roomState = message.room;
      renderRoom(message.room, message.playerId, message.isHost);
      if (window.startGalaxyCoopGame) window.startGalaxyCoopGame(message.state);
      startInputUpdates();
    } else if (message.type === 'gameState') {
      if (window.applyGalaxyCoopState) window.applyGalaxyCoopState(message.state);
    } else if (message.type === 'gameEnded') {
      clearInterval(inputTimer);
      inputTimer = null;
      roomState = message.room;
      renderRoom(message.room, message.playerId, message.isHost);
      if (window.endGalaxyCoopGame) window.endGalaxyCoopGame(message.state);
    } else if (message.type === 'roomList') {
      renderRoomList(message.rooms);
      setStatus('Lista de salas públicas actualizada.');
      setBusy(false);
    } else if (message.type === 'left') {
      persistSession(null);
      roomState = null;
      playerId = null;
      $('galaxyLobby').hidden = true;
      clearInterval(inputTimer);
      inputTimer = null;
      setStatus('Saliste de la sala.');
      setBusy(false);
    } else if (message.type === 'error') {
      const messages = {
        INVALID_CODE: 'Ese código no corresponde a una sala disponible.',
        ROOM_FULL: 'La sala ya alcanzó el máximo de 4 jugadores.',
        ROOM_NOT_FOUND: 'La sala ya no existe o el código venció.',
        GAME_IN_PROGRESS: 'La partida ya comenzó. Espera a que termine para unirte.',
        NOT_ENOUGH_PLAYERS: 'Se necesitan al menos 2 jugadores para iniciar.',
        PLAYERS_NOT_READY: 'Todos los jugadores conectados deben marcarse listos.',
        NAME_REQUIRED: 'El nombre debe contener entre 1 y 20 caracteres.',
        NOT_HOST: 'Solo el anfitrión puede cambiar esta opción.',
        BAD_REQUEST: 'No se pudo completar la solicitud. Inténtalo de nuevo.'
      };
      if (message.code === 'ROOM_NOT_FOUND') persistSession(null);
      setStatus(messages[message.code] || message.message || 'El servidor rechazó la solicitud.');
      setBusy(false);
    }
  }

  function createRoom() {
    const name = nickname();
    if (!name) return;
    persistSession(null);
    connect({
      type: 'create',
      nickname: name,
      visibility: $('galaxyRoomVisibility').value,
      speed: window.getGalaxyCoopSpeed ? window.getGalaxyCoopSpeed() : 'slow'
    }, false);
  }

  function joinRoom() {
    const name = nickname();
    if (!name) return;
    const code = $('galaxyJoinCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setStatus('El código debe tener 6 letras o números.');
      $('galaxyJoinCode').focus();
      return;
    }
    persistSession(null);
    connect({ type: 'join', code, nickname: name }, false);
  }

  function loadPublicRooms() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      send({ type: 'list' });
    } else {
      connect({ type: 'list' }, false);
    }
  }

  function leaveRoom() {
    if (!roomState) return;
    send({ type: 'leave' });
    persistSession(null);
    roomState = null;
    playerId = null;
    closeSocket();
    $('galaxyLobby').hidden = true;
    setStatus('Saliste de la sala.');
  }

  function leaveMatch() {
    send({ type: 'returnToLobby' });
    clearInterval(inputTimer);
    inputTimer = null;
  }

  function openPanel() {
    $('galaxyMenu').hidden = true;
    $('galaxyOnlinePanel').hidden = false;
    const previousName = getSavedNickname();
    if (previousName && !$('galaxyNickname').value) $('galaxyNickname').value = previousName;
    if (roomState) renderRoom(roomState, playerId, isHost);
    else {
      const session = savedSession();
      if (session && session.resumeToken && (!socket || socket.readyState !== WebSocket.OPEN)) {
        connect({ type: 'resume', roomCode: session.roomCode, resumeToken: session.resumeToken }, true);
      } else {
        loadPublicRooms();
      }
    }
  }

  function closePanel() {
    $('galaxyOnlinePanel').hidden = true;
    $('galaxyMenu').hidden = false;
  }

  function initialize() {
    const storedName = getSavedNickname();
    if (storedName) $('galaxyNickname').value = storedName;
    $('openGalaxyOnline').addEventListener('click', openPanel);
    $('closeGalaxyOnline').addEventListener('click', closePanel);
    $('createGalaxyRoom').addEventListener('click', createRoom);
    $('joinGalaxyRoom').addEventListener('click', joinRoom);
    $('refreshGalaxyRooms').addEventListener('click', loadPublicRooms);
    $('leaveGalaxyRoom').addEventListener('click', leaveRoom);
    $('toggleGalaxyReady').addEventListener('click', () => send({ type: 'ready', ready: !ready }));
    $('startGalaxyCoop').addEventListener('click', () => send({ type: 'startGame' }));
    $('exitGalaxyCoop').addEventListener('click', leaveMatch);
    $('galaxyJoinCode').addEventListener('input', (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    $('copyGalaxyInvite').addEventListener('click', async () => {
      if (!roomState) return;
      try {
        await navigator.clipboard.writeText(roomState.code);
        setStatus('Código de invitación copiado.');
      } catch (error) {
        $('galaxyJoinCode').value = roomState.code;
        setStatus(`Copia este código para invitar: ${roomState.code}`);
      }
    });
    window.GalaxyMultiplayer = {
      leaveRoom,
      leaveMatch,
      playerId: () => playerId,
      disconnect: () => {
        leaveRoom();
        closeSocket();
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
