(function () {
  'use strict';

  if (navigator.userAgentData?.mobile || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ||
      !window.matchMedia('(pointer: fine)').matches) {
    document.body.innerHTML = '<main class="unavailable"><h1>DATA EDITOR es exclusivo para PC</h1><p>Abre el editor desde una computadora.</p><a href="CalcuPlanet.html">Volver a Vector Drift</a></main>';
    return;
  }

  const projectKey = 'calcuPlanetDataEditorProjectsV1';
  const canvas = document.getElementById('mapCanvas');
  const context = canvas.getContext('2d');
  const viewport = document.getElementById('canvasViewport');
  const projectInfo = document.getElementById('projectInfo');
  const inspector = document.getElementById('inspector');
  const layersList = document.getElementById('layersList');
  const libraryDialog = document.getElementById('libraryDialog');
  let project = DataMapFormat.createMap();
  let currentTool = 'select';
  let selectedIds = new Set();
  let selectedMarker = null;
  let zoom = 1;
  let pan = { x: 0, y: 0 };
  let dpr = 1;
  let history = [];
  let historyIndex = -1;
  let dirty = false;
  let drawPoints = [];
  let dragState = null;
  let pointerWorld = { x: 0, y: 0 };
  let clipboard = [];
  let spaceDown = false;

  const LOCAL_PROJECT_KEY = (id) => `${projectKey}:${id}`;
  const toolNames = {
    select: 'SELECCIÓN', line: 'LÍNEA RECTA', polyline: 'POLILÍNEA',
    bezier: 'CURVA BÉZIER', vertex: 'EDICIÓN DE VÉRTICES',
    wall: 'PARED FÍSICA', obstacle: 'OBSTÁCULO', spawn: 'APARICIÓN',
    goal: 'META', checkpoint: 'CHECKPOINT', zone: 'ZONA ESPECIAL', delete: 'ELIMINAR'
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function saveHistory() {
    history = history.slice(0, historyIndex + 1);
    history.push(clone(project));
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
  }

  function markDirty() {
    dirty = true;
    document.getElementById('saveStatus').textContent = 'CAMBIOS SIN GUARDAR';
    refreshProjectInfo();
    draw();
    renderInspector();
  }

  function refreshProjectInfo() {
    projectInfo.textContent = `${project.dimensions.width} × ${project.dimensions.height} · ${project.name}`;
    document.getElementById('elementCount').textContent = project.elements.length.toString().padStart(2, '0');
    document.getElementById('emptyCanvasHint').hidden = project.elements.length > 0;
  }

  function pointToScreen(point) {
    return { x: pan.x + point.x * zoom, y: pan.y + point.y * zoom };
  }

  function screenToWorld(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - pan.x) / zoom,
      y: (event.clientY - bounds.top - pan.y) / zoom
    };
  }

  function snap(point) {
    if (!document.getElementById('snapToggle').checked) return point;
    const size = Math.max(4, Number(document.getElementById('gridSize').value) || 20);
    return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size };
  }

  function resizeCanvas() {
    const bounds = viewport.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    draw();
  }

  function drawGrid() {
    if (!document.getElementById('gridToggle').checked) return;
    const size = Math.max(4, Number(document.getElementById('gridSize').value) || 20);
    const left = Math.max(0, Math.floor(-pan.x / zoom / size) * size);
    const top = Math.max(0, Math.floor(-pan.y / zoom / size) * size);
    const right = Math.min(project.dimensions.width, (canvas.clientWidth - pan.x) / zoom);
    const bottom = Math.min(project.dimensions.height, (canvas.clientHeight - pan.y) / zoom);
    context.beginPath();
    for (let x = left; x <= right; x += size) { context.moveTo(x, top); context.lineTo(x, bottom); }
    for (let y = top; y <= bottom; y += size) { context.moveTo(left, y); context.lineTo(right, y); }
    context.strokeStyle = 'rgba(126, 158, 194, .09)';
    context.lineWidth = 1 / zoom;
    context.stroke();
  }

  function drawLine(points, style, selected = false) {
    if (!points.length) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    if (style.closed) context.closePath();
    context.lineCap = 'square';
    context.lineJoin = 'bevel';
    context.strokeStyle = selected ? '#f5ffff' : style.color;
    context.lineWidth = Math.max(selected ? 1.5 : 1, style.width) / zoom;
    context.shadowColor = style.color;
    context.shadowBlur = Math.max(0, style.glow) / zoom;
    context.stroke();
    context.shadowBlur = 0;
    if (selected) {
      points.forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, 3.5 / zoom, 0, Math.PI * 2);
        context.fillStyle = '#dffaff';
        context.fill();
      });
    }
  }

  function drawMarker(point, angle, color, label, selected = false) {
    const size = selected ? 13 : 10;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(angle || 0);
    context.strokeStyle = color;
    context.lineWidth = 1.5 / zoom;
    context.shadowColor = color;
    context.shadowBlur = 12 / zoom;
    context.beginPath();
    context.moveTo(-size, 0); context.lineTo(size, 0);
    context.moveTo(0, -size * .55); context.lineTo(0, size * .55);
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = '#dce8f7';
    context.font = `${10 / zoom}px Consolas, monospace`;
    context.fillText(label, size + 5, -size * .4);
    context.restore();
  }

  function draw() {
    if (!context || !canvas.width || !canvas.height) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#070a10';
    context.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    context.save();
    context.translate(pan.x, pan.y);
    context.scale(zoom, zoom);
    drawGrid();
    context.strokeStyle = 'rgba(134, 158, 192, .28)';
    context.lineWidth = 1 / zoom;
    context.strokeRect(0, 0, project.dimensions.width, project.dimensions.height);

    project.elements.forEach((element) => {
      const layer = project.layers.find((item) => item.id === element.layerId);
      if (layer && !layer.visible) return;
      const points = DataMapFormat.sampleGeometry(element.geometry);
      const style = {
        color: element.style.color,
        width: element.style.width,
        glow: element.style.glow,
        closed: element.type === 'obstacle' && element.geometry.closed
      };
      drawLine(points, style, selectedIds.has(element.id));
      if (selectedIds.has(element.id) && element.geometry.type === 'bezier') {
        context.setLineDash([4 / zoom, 4 / zoom]);
        drawLine([element.geometry.points[0], element.geometry.points[1], element.geometry.points[2], element.geometry.points[3]], {
          color: 'rgba(180, 193, 214, .42)', width: 1, glow: 0
        });
        context.setLineDash([]);
      }
    });

    project.checkpoints.forEach((checkpoint, index) => {
      drawMarker(checkpoint, checkpoint.angle, '#bd9cff', `CP ${index + 1}`,
        selectedMarker && selectedMarker.kind === 'checkpoint' && selectedMarker.index === index);
    });
    drawMarker(project.start, project.start.angle, '#7ce9ff', 'START', selectedMarker?.kind === 'start');
    drawMarker(project.goal, project.goal.angle, '#ff83bb', 'GOAL', selectedMarker?.kind === 'goal');
    if (drawPoints.length) {
      const points = drawPoints.concat([pointerWorld]);
      drawLine(points, { color: '#f4e3ff', width: 1, glow: 7 });
      drawPoints.forEach((point) => {
        context.beginPath(); context.arc(point.x, point.y, 3 / zoom, 0, Math.PI * 2);
        context.fillStyle = '#ffffff'; context.fill();
      });
    }
    context.restore();
  }

  function renderLayers() {
    layersList.replaceChildren();
    project.layers.sort((a, b) => a.order - b.order).forEach((layer) => {
      const row = document.createElement('label');
      row.className = 'layer-row';
      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.checked = layer.visible;
      visible.addEventListener('change', () => { layer.visible = visible.checked; markDirty(); });
      const name = document.createElement('span');
      name.textContent = layer.name;
      const select = document.createElement('button');
      select.type = 'button';
      select.textContent = 'usar';
      select.setAttribute('aria-label', `Usar capa ${layer.name}`);
      select.addEventListener('click', () => {
        project.elements.forEach((element) => { if (selectedIds.has(element.id)) element.layerId = layer.id; });
        markDirty();
      });
      row.append(visible, name, select);
      layersList.append(row);
    });
  }

  function addInspectorField(labelText, value, type, onChange, options = {}) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    if (type !== 'select') input.type = type;
    if (type === 'select') options.values.forEach(([optionValue, text]) => {
      const option = document.createElement('option');
      option.value = optionValue; option.textContent = text; input.append(option);
    });
    if (type === 'checkbox') input.checked = Boolean(value);
    else input.value = value;
    input.addEventListener('change', () => {
      onChange(type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value);
    });
    label.append(input);
    inspector.append(label);
  }

  function renderInspector() {
    inspector.replaceChildren();
    if (selectedMarker) {
      const marker = selectedMarker.kind === 'start' ? project.start :
        selectedMarker.kind === 'goal' ? project.goal : project.checkpoints[selectedMarker.index];
      const markerName = selectedMarker.kind === 'checkpoint' ? `CHECKPOINT ${selectedMarker.index + 1}` : selectedMarker.kind.toUpperCase();
      const title = document.createElement('p');
      title.className = 'inspector-title'; title.textContent = markerName; inspector.append(title);
      ['x', 'y'].forEach((axis) => addInspectorField(axis.toUpperCase(), marker[axis], 'number', (value) => {
        saveHistory(); marker[axis] = value; markDirty();
      }));
      addInspectorField('Orientación · grados', marker.angle * 180 / Math.PI, 'number', (value) => {
        saveHistory(); marker.angle = value * Math.PI / 180; markDirty();
      });
      if (selectedMarker.kind === 'checkpoint') {
        const remove = document.createElement('button'); remove.textContent = 'Eliminar checkpoint';
        remove.addEventListener('click', () => {
          saveHistory(); project.checkpoints.splice(selectedMarker.index, 1); selectedMarker = null; markDirty();
        });
        inspector.append(remove);
      }
      return;
    }
    if (!selectedIds.size) {
      inspector.className = 'inspector empty-inspector';
      const message = document.createElement('p'); message.textContent = 'Selecciona una geometría, pared o marcador para editar sus propiedades.';
      inspector.append(message);
      addInspectorField('Nombre del nivel', project.name, 'text', (value) => {
        saveHistory(); project.name = value.trim() || 'Nivel sin título'; markDirty();
      });
      return;
    }
    inspector.className = 'inspector';
    if (selectedIds.size > 1) {
      const heading = document.createElement('p'); heading.className = 'inspector-title';
      heading.textContent = `${selectedIds.size} ELEMENTOS SELECCIONADOS`; inspector.append(heading);
      const duplicate = document.createElement('button'); duplicate.textContent = 'Duplicar selección';
      duplicate.addEventListener('click', duplicateSelection); inspector.append(duplicate);
      const remove = document.createElement('button'); remove.textContent = 'Eliminar selección';
      remove.addEventListener('click', deleteSelection); inspector.append(remove);
      return;
    }
    const element = project.elements.find((item) => selectedIds.has(item.id));
    if (!element) { selectedIds.clear(); renderInspector(); return; }
    const title = document.createElement('p'); title.className = 'inspector-title';
    title.textContent = element.type.toUpperCase(); inspector.append(title);
    addInspectorField('Identificador', element.id, 'text', () => {});
    addInspectorField('Tipo de geometría', element.geometry.type, 'select', (value) => {
      saveHistory();
      if (value === 'bezier' && element.geometry.points.length !== 4) {
        const [start, end] = [element.geometry.points[0], element.geometry.points[element.geometry.points.length - 1]];
        element.geometry.points = [
          start,
          { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
          { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 },
          end
        ];
      }
      element.geometry.type = value; markDirty();
    }, { values: [['line','Línea'],['polyline','Polilínea'],['bezier','Bézier']] });
    if (['obstacle', 'zone'].includes(element.type) && element.geometry.type !== 'bezier') {
      addInspectorField('Cerrar contorno', Boolean(element.geometry.closed), 'checkbox', (value) => {
        saveHistory(); element.geometry.closed = value; markDirty();
      });
    }
    addInspectorField('Categoría', element.type, 'select', (value) => {
      saveHistory();
      element.type = value;
      element.layerId = value === 'wall' ? 'walls' : value === 'obstacle' ? 'obstacles' :
        value === 'zone' ? 'zones' : 'decorative';
      if (value === 'wall' || value === 'obstacle') {
        element.collision = true;
        if (element.physics.behavior === 'none') element.physics.behavior = 'bounce';
      } else {
        element.collision = false;
        if (value === 'decoration') element.physics.behavior = 'none';
      }
      markDirty();
    }, { values: [['decoration','Decoración'],['wall','Pared física'],['obstacle','Obstáculo'],['zone','Zona especial']] });
    addInspectorField('Capa', element.layerId, 'select', (value) => {
      saveHistory(); element.layerId = value; renderLayers(); markDirty();
    }, { values: project.layers.map((layer) => [layer.id, layer.name]) });
    addInspectorField('Color', element.style.color, 'color', (value) => {
      saveHistory(); element.style.color = value; markDirty();
    });
    addInspectorField('Grosor visual', element.style.width, 'number', (value) => {
      saveHistory(); element.style.width = Math.max(1, Math.min(80, value)); markDirty();
    });
    addInspectorField('Intensidad de luz', element.style.glow, 'number', (value) => {
      saveHistory(); element.style.glow = Math.max(0, Math.min(40, value)); markDirty();
    });
    addInspectorField('Colisión física', element.collision, 'checkbox', (value) => {
      saveHistory(); element.collision = value; markDirty();
    });
    addInspectorField('Comportamiento', element.physics.behavior, 'select', (value) => {
      saveHistory(); element.physics.behavior = value; markDirty();
    }, { values: [['solid','Sólido'],['bounce','Rebote'],['boost','Impulso'],['none','Sin efecto']] });
    element.geometry.points.forEach((point, index) => {
      const row = document.createElement('div'); row.className = 'point-row';
      const heading = document.createElement('p'); heading.className = 'inspector-title'; heading.textContent = `VÉRTICE ${index + 1}`;
      const grid = document.createElement('div'); grid.className = 'point-grid';
      ['x','y'].forEach((axis) => {
        const label = document.createElement('label'); label.textContent = axis.toUpperCase();
        const input = document.createElement('input'); input.type = 'number'; input.value = point[axis];
        input.addEventListener('change', () => { saveHistory(); point[axis] = Number(input.value); markDirty(); });
        label.append(input); grid.append(label);
      });
      row.append(heading, grid); inspector.append(row);
    });
  }

  function nearestOnSegment(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq ? Math.max(0, Math.min(1, ((point.x-a.x)*dx + (point.y-a.y)*dy) / lengthSq)) : 0;
    return { x: a.x + dx*t, y: a.y + dy*t };
  }

  function hitTest(point) {
    const markerCandidates = [
      { kind: 'start', marker: project.start },
      ...project.checkpoints.map((marker, index) => ({ kind: 'checkpoint', index, marker })),
      { kind: 'goal', marker: project.goal }
    ];
    for (const candidate of markerCandidates) {
      if (Math.hypot(candidate.marker.x-point.x, candidate.marker.y-point.y) < 18 / zoom) {
        return { kind: 'marker', value: candidate };
      }
    }
    for (let i = project.elements.length - 1; i >= 0; i--) {
      const element = project.elements[i];
      const layer = project.layers.find((item) => item.id === element.layerId);
      if (layer && !layer.visible) continue;
      const points = DataMapFormat.sampleGeometry(element.geometry);
      for (let p = 0; p < element.geometry.points.length; p++) {
        if (Math.hypot(element.geometry.points[p].x-point.x, element.geometry.points[p].y-point.y) < 8 / zoom) {
          return { kind: 'vertex', element, index: p };
        }
      }
      for (let p = 0; p < points.length - 1; p++) {
        const nearest = nearestOnSegment(point, points[p], points[p+1]);
        if (Math.hypot(nearest.x-point.x, nearest.y-point.y) < Math.max(8, element.style.width) / zoom + 4) {
          return { kind: 'element', element };
        }
      }
    }
    return null;
  }

  function createElement(tool, points) {
    const type = tool === 'wall' ? 'wall' : tool === 'obstacle' ? 'obstacle' : tool === 'zone' ? 'zone' : 'decoration';
    const layerId = type === 'wall' ? 'walls' : type === 'obstacle' ? 'obstacles' : type === 'zone' ? 'zones' : 'decorative';
    const color = type === 'wall' ? '#66dcff' : type === 'obstacle' ? '#ff8cb8' : type === 'zone' ? '#a48bff' : '#9aafff';
    return {
      id: DataMapFormat.makeId(),
      type, layerId,
      geometry: { type: points.length === 2 ? 'line' : tool === 'bezier' ? 'bezier' : 'polyline', points: clone(points) },
      style: { color, width: type === 'wall' ? 2 : 1.5, glow: type === 'wall' ? 12 : 7 },
      collision: type === 'wall' || type === 'obstacle',
      physics: { behavior: type === 'wall' ? 'bounce' : type === 'obstacle' ? 'solid' : 'none' }
    };
  }

  function finishDrawing() {
    if (drawPoints.length < 2) { drawPoints = []; draw(); return; }
    if (currentTool === 'bezier' && drawPoints.length !== 4) return;
    saveHistory();
    const element = createElement(currentTool, drawPoints);
    project.elements.push(element);
    selectedIds = new Set([element.id]);
    selectedMarker = null;
    drawPoints = [];
    markDirty();
    renderLayers();
  }

  function placeMarker(tool, point) {
    saveHistory();
    selectedIds.clear();
    if (tool === 'spawn') { project.start = { ...point, angle: 0 }; selectedMarker = { kind: 'start' }; }
    else if (tool === 'goal') { project.goal = { ...point, angle: 0 }; selectedMarker = { kind: 'goal' }; }
    else {
      project.checkpoints.push({ ...point, angle: 0 });
      selectedMarker = { kind: 'checkpoint', index: project.checkpoints.length - 1 };
    }
    markDirty();
  }

  function deleteSelection() {
    if (selectedMarker) {
      saveHistory();
      if (selectedMarker.kind === 'checkpoint') project.checkpoints.splice(selectedMarker.index, 1);
      selectedMarker = null;
      markDirty();
      return;
    }
    if (!selectedIds.size) return;
    saveHistory();
    project.elements = project.elements.filter((element) => !selectedIds.has(element.id));
    selectedIds.clear();
    markDirty();
    renderLayers();
  }

  function duplicateSelection() {
    const copies = project.elements.filter((element) => selectedIds.has(element.id)).map((element) => {
      const copy = clone(element); copy.id = DataMapFormat.makeId();
      copy.geometry.points.forEach((point) => { point.x += 20; point.y += 20; });
      return copy;
    });
    if (!copies.length) return;
    saveHistory(); project.elements.push(...copies);
    selectedIds = new Set(copies.map((element) => element.id));
    markDirty(); renderLayers();
  }

  function copySelection() {
    clipboard = project.elements.filter((element) => selectedIds.has(element.id)).map(clone);
  }

  function pasteSelection() {
    if (!clipboard.length) return;
    const copies = clipboard.map((element) => {
      const copy = clone(element); copy.id = DataMapFormat.makeId();
      copy.geometry.points.forEach((point) => { point.x += 20; point.y += 20; });
      return copy;
    });
    saveHistory(); project.elements.push(...copies);
    selectedIds = new Set(copies.map((element) => element.id));
    selectedMarker = null; markDirty(); renderLayers();
  }

  function setTool(tool) {
    currentTool = tool;
    drawPoints = [];
    document.querySelectorAll('.tool-button').forEach((button) => button.classList.toggle('selected', button.dataset.tool === tool));
    document.getElementById('activeToolLabel').textContent = toolNames[tool] || tool.toUpperCase();
    canvas.style.cursor = tool === 'select' ? 'default' : tool === 'delete' ? 'not-allowed' : 'crosshair';
    draw();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const nextZoom = Math.max(.2, Math.min(4, zoom * factor));
    pan.x = x - (x - pan.x) * nextZoom / zoom;
    pan.y = y - (y - pan.y) * nextZoom / zoom;
    zoom = nextZoom;
    document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`;
    draw();
  }

  function downloadProject() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'nivel'}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function readProjectFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const validation = DataMapFormat.validateMap(parsed);
        if (!validation.valid) throw new Error(validation.errors.join('\n'));
        project = parsed; selectedIds.clear(); selectedMarker = null; drawPoints = [];
        history = []; historyIndex = -1; saveHistory(); dirty = false;
        document.getElementById('saveStatus').textContent = 'PROYECTO CARGADO';
        renderLayers(); refreshProjectInfo(); renderInspector(); draw();
      } catch (error) {
        alert(`No se pudo abrir el mapa:\n${error.message}`);
      }
    };
    reader.onerror = () => alert('No se pudo leer el archivo seleccionado.');
    reader.readAsText(file);
  }

  function saveLocalProject() {
    project.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(LOCAL_PROJECT_KEY(project.id), JSON.stringify(project));
      const index = JSON.parse(localStorage.getItem(projectKey) || '[]').filter((item) => item.id !== project.id);
      index.unshift({ id: project.id, name: project.name, updatedAt: project.updatedAt });
      localStorage.setItem(projectKey, JSON.stringify(index));
      dirty = false;
      document.getElementById('saveStatus').textContent = 'GUARDADO LOCAL';
    } catch (error) {
      document.getElementById('saveStatus').textContent = 'ERROR AL GUARDAR';
      alert(`No se pudo guardar en este navegador: ${error.message}`);
    }
  }

  function openLocalProject() {
    let projects;
    try { projects = JSON.parse(localStorage.getItem(projectKey) || '[]'); }
    catch (error) { alert('El índice local de proyectos está dañado.'); return; }
    if (!projects.length) { document.getElementById('openFile').click(); return; }
    const choice = prompt(`Proyectos guardados:\n${projects.map((item, index) => `${index + 1}. ${item.name}`).join('\n')}\n\nEscribe un número, o deja vacío para elegir un archivo JSON.`);
    if (!choice) { document.getElementById('openFile').click(); return; }
    const index = Number(choice) - 1;
    if (!Number.isInteger(index) || !projects[index]) { alert('Selecciona un número de proyecto válido.'); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_PROJECT_KEY(projects[index].id)));
      const validation = DataMapFormat.validateMap(saved);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      project = saved; selectedIds.clear(); selectedMarker = null; history = []; historyIndex = -1; saveHistory();
      dirty = false; renderLayers(); refreshProjectInfo(); renderInspector(); draw();
      document.getElementById('saveStatus').textContent = 'PROYECTO ABIERTO';
    } catch (error) { alert(`No se pudo abrir el proyecto: ${error.message}`); }
  }

  function syncAuthStatus(message = '') {
    const session = DataMapLibrary.getAuth();
    document.getElementById('authStatus').textContent = message ||
      (session ? `Sesión activa: ${session.user.email}` : 'Sin sesión de editor.');
    document.getElementById('signOutButton').hidden = !session;
    document.getElementById('signInButton').hidden = Boolean(session);
    document.getElementById('signUpButton').hidden = Boolean(session);
  }

  async function loadLibraryDialog() {
    libraryDialog.showModal();
    const status = document.getElementById('libraryDialogStatus');
    const list = document.getElementById('libraryList');
    list.replaceChildren();
    status.textContent = 'Consultando la biblioteca compartida…';
    try {
      const maps = await DataMapLibrary.listMaps();
      status.textContent = maps.length ? `${maps.length} nivel(es) disponible(s).` : 'Todavía no hay mapas publicados.';
      maps.forEach((map) => {
        const row = document.createElement('div'); row.className = 'library-item';
        const title = document.createElement('strong'); title.textContent = map.name;
        const meta = document.createElement('small'); meta.textContent = `v${map.version} · ${new Date(map.updatedAt).toLocaleDateString()}`;
        const open = document.createElement('button'); open.textContent = 'Abrir';
        open.addEventListener('click', () => {
          project = clone(map); history = []; historyIndex = -1; saveHistory(); selectedIds.clear(); selectedMarker = null;
          dirty = false; renderLayers(); refreshProjectInfo(); renderInspector(); draw(); libraryDialog.close();
          document.getElementById('saveStatus').textContent = 'MAPA DE BIBLIOTECA ABIERTO';
        });
        row.append(title, meta, open); list.append(row);
      });
    } catch (error) {
      status.textContent = `Sin conexión con la nube: ${error.message}`;
      const cached = DataMapLibrary.readCache();
      cached.forEach((map) => {
        const row = document.createElement('div'); row.className = 'library-item';
        const title = document.createElement('strong'); title.textContent = map.name;
        const meta = document.createElement('small'); meta.textContent = `Caché · v${map.version}`;
        const open = document.createElement('button'); open.textContent = 'Abrir';
        open.addEventListener('click', () => {
          project = clone(map); history = []; historyIndex = -1; saveHistory(); selectedIds.clear(); selectedMarker = null;
          dirty = false; renderLayers(); refreshProjectInfo(); renderInspector(); draw(); libraryDialog.close();
        });
        row.append(title, meta, open); list.append(row);
      });
    }
  }

  async function signIn() {
    try {
      await DataMapLibrary.signIn(document.getElementById('editorEmail').value.trim(), document.getElementById('editorPassword').value);
      syncAuthStatus('Sesión iniciada. Ya puedes publicar mapas propios.');
    } catch (error) { syncAuthStatus(error.message); }
  }

  async function signUp() {
    try {
      const result = await DataMapLibrary.signUp(document.getElementById('editorEmail').value.trim(), document.getElementById('editorPassword').value);
      syncAuthStatus(result.confirmationRequired
        ? 'Cuenta creada. Confirma el correo y luego inicia sesión para publicar.'
        : 'Cuenta creada y sesión iniciada.');
    } catch (error) { syncAuthStatus(error.message); }
  }

  async function publishProject() {
    const name = project.name.trim();
    if (!name) { syncAuthStatus('El mapa necesita un nombre antes de publicarse.'); return; }
    const validation = DataMapFormat.validateMap(project);
    if (!validation.valid) { syncAuthStatus(validation.errors.join(' ')); return; }
    const button = document.getElementById('publishProject');
    button.disabled = true;
    try {
      const cached = DataMapLibrary.readCache().find((map) => map.id === project.id);
      project.version = Math.max(project.version, cached ? cached.version + 1 : 1);
      project.updatedAt = new Date().toISOString();
      await DataMapLibrary.publishMap(project);
      saveLocalProject();
      syncAuthStatus(`Publicado · ${project.name} · versión ${project.version}. Ya aparecerá en el juego al sincronizar.`);
    } catch (error) { syncAuthStatus(error.message); }
    finally { button.disabled = false; }
  }

  canvas.addEventListener('pointermove', (event) => {
    const raw = screenToWorld(event);
    pointerWorld = snap(raw);
    document.getElementById('cursorPosition').textContent = `X ${Math.round(raw.x).toString().padStart(3, '0')} · Y ${Math.round(raw.y).toString().padStart(3, '0')}`;
    if (!dragState) { draw(); return; }
    if (dragState.kind === 'pan') {
      pan.x = dragState.panX + event.clientX - dragState.clientX;
      pan.y = dragState.panY + event.clientY - dragState.clientY;
    } else {
      const dx = pointerWorld.x - dragState.last.x;
      const dy = pointerWorld.y - dragState.last.y;
      if (dragState.kind === 'vertex') {
        dragState.element.geometry.points[dragState.index].x += dx;
        dragState.element.geometry.points[dragState.index].y += dy;
      } else if (dragState.kind === 'marker') {
        dragState.marker.x += dx; dragState.marker.y += dy;
      } else {
        selectedIds.forEach((id) => {
          const element = project.elements.find((item) => item.id === id);
          if (element) element.geometry.points.forEach((point) => { point.x += dx; point.y += dy; });
        });
        if (dragState.marker) { dragState.marker.x += dx; dragState.marker.y += dy; }
      }
      dragState.last = pointerWorld;
      dirty = true;
    }
    draw();
    if (dragState.kind !== 'pan') renderInspector();
  });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const raw = screenToWorld(event);
    const point = snap(raw);
    if (event.button === 1 || spaceDown) {
      dragState = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    if (currentTool === 'spawn' || currentTool === 'goal' || currentTool === 'checkpoint') {
      placeMarker(currentTool, point); setTool('select'); return;
    }
    if (currentTool === 'delete') {
      const hit = hitTest(point);
      if (hit && hit.kind === 'marker') {
        selectedMarker = { kind: hit.value.kind, index: hit.value.index };
        deleteSelection();
      } else if (hit && hit.kind === 'element') {
        selectedIds = new Set([hit.element.id]); deleteSelection();
      }
      return;
    }
    if (['polyline', 'bezier', 'wall', 'obstacle', 'zone'].includes(currentTool)) {
      if (event.detail > 1 && currentTool !== 'bezier') { finishDrawing(); return; }
      drawPoints.push(point);
      if (currentTool === 'bezier' && drawPoints.length === 4) finishDrawing();
      else draw();
      return;
    }
    if (currentTool === 'line') {
      dragState = { kind: 'draw', start: point, current: point };
      return;
    }
    const hit = hitTest(point);
    if (currentTool === 'vertex') {
      if (hit && hit.kind === 'vertex') {
        saveHistory();
        dragState = { kind: 'vertex', element: hit.element, index: hit.index, last: point };
        selectedIds = new Set([hit.element.id]); selectedMarker = null; renderInspector();
      } else if (hit && hit.kind === 'element' && hit.element.geometry.type !== 'bezier') {
        const points = hit.element.geometry.points;
        let insertion = 1;
        let closest = Infinity;
        for (let index = 0; index < points.length - 1; index++) {
          const nearest = nearestOnSegment(point, points[index], points[index + 1]);
          const distance = Math.hypot(nearest.x - point.x, nearest.y - point.y);
          if (distance < closest) { closest = distance; insertion = index + 1; }
        }
        saveHistory();
        points.splice(insertion, 0, point);
        hit.element.geometry.type = 'polyline';
        dragState = { kind: 'vertex', element: hit.element, index: insertion, last: point };
        selectedIds = new Set([hit.element.id]); selectedMarker = null; renderInspector(); markDirty();
      }
      return;
    }
    if (hit && hit.kind === 'marker') {
      if (event.ctrlKey || event.metaKey) selectedIds.clear();
      selectedIds.clear();
      selectedMarker = { kind: hit.value.kind, index: hit.value.index };
      const marker = hit.value.marker;
      saveHistory(); dragState = { kind: 'marker', marker, last: point };
      renderInspector(); draw(); return;
    }
    if (hit && hit.kind === 'element') {
      if (event.ctrlKey || event.metaKey) {
        if (selectedIds.has(hit.element.id)) selectedIds.delete(hit.element.id);
        else selectedIds.add(hit.element.id);
      } else if (!selectedIds.has(hit.element.id)) selectedIds = new Set([hit.element.id]);
      selectedMarker = null;
      if (selectedIds.has(hit.element.id)) { saveHistory(); dragState = { kind: 'move', last: point }; }
    } else { selectedIds.clear(); selectedMarker = null; }
    renderInspector(); draw();
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!dragState) return;
    if (dragState.kind === 'draw') {
      const end = snap(screenToWorld(event));
      if (Math.hypot(end.x - dragState.start.x, end.y - dragState.start.y) > 2) {
        createAndSelect(dragState.start, end);
      }
    } else if (dragState.kind !== 'pan') markDirty();
    dragState = null;
  });

  function createAndSelect(start, end) {
    saveHistory();
    const element = createElement(currentTool, [start, end]);
    if (currentTool === 'line') { element.type = 'decoration'; element.layerId = 'decorative'; element.collision = false; }
    project.elements.push(element);
    selectedIds = new Set([element.id]); selectedMarker = null;
    markDirty(); renderLayers();
  }

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => {
    if (['polyline', 'wall', 'obstacle', 'zone'].includes(currentTool)) finishDrawing();
  });
  viewport.addEventListener('contextmenu', (event) => event.preventDefault());
  document.querySelectorAll('.tool-button').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
  document.getElementById('gridToggle').addEventListener('change', draw);
  document.getElementById('snapToggle').addEventListener('change', draw);
  document.getElementById('gridSize').addEventListener('change', draw);
  document.getElementById('fitCanvas').addEventListener('click', () => {
    zoom = Math.min((canvas.clientWidth - 80) / project.dimensions.width, (canvas.clientHeight - 80) / project.dimensions.height, 1);
    pan = { x: (canvas.clientWidth - project.dimensions.width * zoom) / 2, y: (canvas.clientHeight - project.dimensions.height * zoom) / 2 };
    document.getElementById('zoomValue').textContent = `${Math.round(zoom * 100)}%`; draw();
  });
  document.getElementById('newProject').addEventListener('click', () => {
    if (dirty && !confirm('Hay cambios sin guardar. ¿Crear un mapa nuevo de todos modos?')) return;
    project = DataMapFormat.createMap(); history = []; historyIndex = -1; saveHistory(); selectedIds.clear(); selectedMarker = null;
    dirty = false; renderLayers(); refreshProjectInfo(); renderInspector(); draw();
    document.getElementById('saveStatus').textContent = 'PROYECTO NUEVO';
  });
  document.getElementById('openProject').addEventListener('click', openLocalProject);
  document.getElementById('openFile').addEventListener('change', (event) => {
    if (event.target.files[0]) readProjectFile(event.target.files[0]);
    event.target.value = '';
  });
  document.getElementById('importProject').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (event) => {
    if (event.target.files[0]) readProjectFile(event.target.files[0]);
    event.target.value = '';
  });
  document.getElementById('saveProject').addEventListener('click', saveLocalProject);
  document.getElementById('publishProject').addEventListener('click', publishProject);
  document.getElementById('exportProject').addEventListener('click', downloadProject);
  document.getElementById('undoAction').addEventListener('click', undo);
  document.getElementById('redoAction').addEventListener('click', redo);
  document.getElementById('testProject').addEventListener('click', () => {
    const validation = DataMapFormat.validateMap(project);
    if (!validation.valid) { alert(validation.errors.join('\n')); return; }
    DataMapLibrary.saveLocalMap(project);
    window.open(`CalcuPlanet.html?testMap=${encodeURIComponent(project.id)}`, '_blank', 'noopener');
  });
  document.getElementById('libraryProject').addEventListener('click', loadLibraryDialog);
  document.getElementById('signInButton').addEventListener('click', signIn);
  document.getElementById('signUpButton').addEventListener('click', signUp);
  document.getElementById('signOutButton').addEventListener('click', () => {
    DataMapLibrary.signOut(); syncAuthStatus('Sesión cerrada.');
  });

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex--; project = clone(history[historyIndex]); markDirty(); renderLayers();
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex++; project = clone(history[historyIndex]); markDirty(); renderLayers();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      spaceDown = true; event.preventDefault(); return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    else if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); }
    else if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteSelection(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
    else if (event.key === 'Enter' && ['polyline', 'wall', 'obstacle', 'zone'].includes(currentTool)) finishDrawing();
    else if (event.key === 'Escape') { drawPoints = []; selectedIds.clear(); selectedMarker = null; renderInspector(); draw(); }
  });
  document.addEventListener('keyup', (event) => { if (event.code === 'Space') spaceDown = false; });
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('beforeunload', (event) => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  });

  function initialize() {
    resizeCanvas();
    saveHistory();
    renderLayers();
    refreshProjectInfo();
    renderInspector();
    syncAuthStatus();
    document.getElementById('cloudStatus').textContent = DataMapLibrary.configured()
      ? 'Supabase configurado. Publica niveles aquí para que aparezcan en todos los dispositivos.'
      : 'Sin Supabase: edición, guardado y pruebas locales funcionan. Añade URL y clave pública en data-map-config.js para sincronizar.';
    document.getElementById('fitCanvas').click();
  }
  initialize();
})();
