// Fachada ES module: reglas compartidas, sin copia de simulación.
import '../maps.js';
import * as shared from './nexo-core.js';
const api=shared.default||globalThis.NexoSoloEngine;
export const {createNexoGame,tickNexoGame,nexoGameSnapshot}=api;
