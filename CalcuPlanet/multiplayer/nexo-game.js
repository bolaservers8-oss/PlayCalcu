// Fachada ES module: reglas compartidas, sin copia de simulación.
import maps from '../maps.js';

globalThis.NexoMaps = maps;
await import('./nexo-core.js');

const api = globalThis.NexoSoloEngine;
export const {createNexoGame,tickNexoGame,nexoGameSnapshot}=api;
