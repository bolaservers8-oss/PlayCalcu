// Vacío: se conecta al servidor que sirve esta página. Para alojamiento separado, URL ws(s) explícita.
window.DATA_MAP_CONFIG = {galaxyRealtimeUrl: location.protocol==='file:'?'ws://localhost:2567':location.origin.replace(/^http/,'ws')};
