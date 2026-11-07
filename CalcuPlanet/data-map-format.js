(function (global) {
  'use strict';

  const FORMAT = 'data-wing-map';
  const FORMAT_VERSION = 1;
  const LAYERS = [
    { id: 'decorative', name: 'Decoración', visible: true, locked: false, order: 0 },
    { id: 'walls', name: 'Paredes', visible: true, locked: false, order: 1 },
    { id: 'obstacles', name: 'Obstáculos', visible: true, locked: false, order: 2 },
    { id: 'zones', name: 'Zonas especiales', visible: true, locked: false, order: 3 },
    { id: 'gameplay', name: 'Jugabilidad', visible: true, locked: false, order: 4 }
  ];

  function makeId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createMap(name = 'Nivel sin título') {
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      id: makeId(),
      name,
      version: 1,
      updatedAt: new Date().toISOString(),
      dimensions: { width: 960, height: 540 },
      layers: LAYERS.map((layer) => ({ ...layer })),
      elements: [],
      start: { x: 90, y: 450, angle: 0 },
      checkpoints: [],
      goal: { x: 870, y: 90, angle: 0 }
    };
  }

  function isFinitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function validateMap(map) {
    const errors = [];
    if (!map || typeof map !== 'object') return { valid: false, errors: ['El documento no es un objeto JSON.'] };
    if (map.format !== FORMAT) errors.push(`El formato debe ser "${FORMAT}".`);
    if (map.formatVersion !== FORMAT_VERSION) errors.push(`Versión de formato no compatible: ${map.formatVersion}.`);
    if (typeof map.id !== 'string' || !map.id.trim()) errors.push('Falta el identificador del mapa.');
    if (typeof map.name !== 'string' || !map.name.trim() || map.name.length > 80) errors.push('El nombre del mapa debe tener entre 1 y 80 caracteres.');
    if (!map.dimensions || !Number.isFinite(map.dimensions.width) || !Number.isFinite(map.dimensions.height) ||
        map.dimensions.width < 100 || map.dimensions.height < 100 ||
        map.dimensions.width > 10000 || map.dimensions.height > 10000) {
      errors.push('Las dimensiones deben estar entre 100 y 10000 unidades.');
    }
    if (!Array.isArray(map.layers) || !Array.isArray(map.elements) || map.elements.length > 500) errors.push('Faltan capas o los elementos superan el límite de 500.');
    if (!isFinitePoint(map.start) || !Number.isFinite(map.start.angle)) errors.push('El punto de aparición no es válido.');
    if (!isFinitePoint(map.goal) || !Number.isFinite(map.goal.angle)) errors.push('La meta no es válida.');
    if (!Array.isArray(map.checkpoints)) errors.push('Los checkpoints deben ser una lista.');

    const layerIds = new Set((map.layers || []).map((layer) => layer.id));
    const elementIds = new Set();
    (map.elements || []).forEach((element, index) => {
      if (!element || typeof element.id !== 'string' || !element.id.trim()) errors.push(`Elemento ${index + 1}: falta el id.`);
      else if (elementIds.has(element.id)) errors.push(`El id de elemento "${element.id}" está duplicado.`);
      else elementIds.add(element.id);
      if (!element || !layerIds.has(element.layerId)) errors.push(`Elemento ${index + 1}: capa desconocida.`);
      if (!element || !['wall', 'obstacle', 'decoration', 'zone'].includes(element.type)) {
        errors.push(`Elemento ${index + 1}: tipo de geometría no compatible.`);
      }
      const points = element && element.geometry && element.geometry.points;
      if (!Array.isArray(points) || points.length < 2 || points.length > 512 || points.some((point) => !isFinitePoint(point))) {
        errors.push(`Elemento ${index + 1}: geometría inválida; se requieren al menos dos vértices.`);
      }
      if (element && element.geometry && !['line', 'polyline', 'bezier'].includes(element.geometry.type)) {
        errors.push(`Elemento ${index + 1}: tipo de trazo no compatible.`);
      }
      if (element && element.geometry && element.geometry.type === 'bezier' && points && points.length !== 4) {
        errors.push(`Elemento ${index + 1}: una curva Bézier necesita cuatro puntos de control.`);
      }
      if (!element || typeof element.collision !== 'boolean') errors.push(`Elemento ${index + 1}: falta indicar si tiene colisión.`);
      if (!element || !element.physics || !['solid', 'bounce', 'boost', 'none'].includes(element.physics.behavior)) {
        errors.push(`Elemento ${index + 1}: comportamiento físico inválido.`);
      }
      if (!element || !element.style ||
          !Number.isFinite(element.style.width) || element.style.width < 1 || element.style.width > 80 ||
          !Number.isFinite(element.style.glow) || element.style.glow < 0 || element.style.glow > 40 ||
          !/^#[0-9a-f]{6}$/i.test(element.style.color || '')) {
        errors.push(`Elemento ${index + 1}: propiedades visuales inválidas.`);
      }
    });
    (map.checkpoints || []).forEach((checkpoint, index) => {
      if (!isFinitePoint(checkpoint) || !Number.isFinite(checkpoint.angle)) errors.push(`Checkpoint ${index + 1}: posición inválida.`);
    });
    return { valid: errors.length === 0, errors };
  }

  function sampleGeometry(geometry, curveSteps = 24) {
    const points = geometry.points;
    if (geometry.type !== 'bezier' || points.length !== 4) return points.map((point) => ({ x: point.x, y: point.y }));
    const sampled = [];
    for (let step = 0; step <= curveSteps; step++) {
      const t = step / curveSteps;
      const inverse = 1 - t;
      sampled.push({
        x: inverse ** 3 * points[0].x + 3 * inverse ** 2 * t * points[1].x + 3 * inverse * t ** 2 * points[2].x + t ** 3 * points[3].x,
        y: inverse ** 3 * points[0].y + 3 * inverse ** 2 * t * points[1].y + 3 * inverse * t ** 2 * points[2].y + t ** 3 * points[3].y
      });
    }
    return sampled;
  }

  global.DataMapFormat = { FORMAT, FORMAT_VERSION, LAYERS, createMap, makeId, sampleGeometry, validateMap };
})(window);
