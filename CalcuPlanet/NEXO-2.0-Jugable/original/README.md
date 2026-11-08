# NEXO · Distrito Umbral (copia independiente)

Esta carpeta contiene una copia aislada de NEXO para jugar, inspeccionar y experimentar sin modificar la versión integrada en CalcuPlanet.

## Qué es el juego

NEXO es un juego original de acción cenital que se puede jugar en solitario o en cooperativo online. Recorre una arena, combate guardias, recoge munición, abre puertas e intenta llegar a la salida.

Incluye:

- Modo individual local, sin conexión al servidor.
- Salas online públicas o privadas y entrada por código.
- Estado de listo e inicio de partida por parte del anfitrión.
- Movimiento y puntería con teclado y ratón, además de controles táctiles.
- Enemigos, proyectiles, vidas, munición, puertas, objetos y extracción.
- Simulación de partida autoritativa en el servidor.

## Abrir la copia

1. Abre `index.html` en un navegador o sirve esta carpeta en local.
2. Elige **Jugar solo** para iniciar una operación local sin servidor, o **Jugar cooperativo online** para conectarte.
3. En cooperativo, escribe un nombre y crea una sala; la segunda persona puede unirse con el código.
4. Cuando estén los dos en la sala y listos, el anfitrión inicia la operación.

Para servirla localmente con Python, abre una terminal en esta carpeta y ejecuta:

```powershell
python -m http.server 8000
```

Después abre `http://localhost:8000`.

El modo individual funciona localmente y no necesita conexión al servidor; comienza con más reservas y munición para compensar que juegas sin compañero. El cooperativo usa el servidor configurado en `data-map-config.js` (actualmente `wss://playcalcu.onrender.com`). Si el servidor restringe los orígenes, agrega el origen donde publiques o sirvas esta copia a `ALLOWED_ORIGINS` en Render. Para el servidor local de ejemplo, el origen es `http://localhost:8000`. El servidor necesita reconocer el protocolo de juego 4 o posterior.

## Controles

- **PC:** WASD o flechas para moverte; ratón para apuntar; clic o F para disparar; espacio para golpear; E para interactuar.
- **Móvil:** gira el dispositivo a horizontal y usa el pad y los botones de acción.

Los efectos de sonido están desactivados en esta copia independiente; en CalcuPlanet los proporciona el sistema de audio compartido.

## Archivos

- `index.html`: página y estilos propios de esta copia; no incluye la calculadora ni los otros juegos.
- `nexo-coop-client.js`: cliente del lobby, controles, renderizado y conexión online.
- `multiplayer/nexo-game.js`: simulación autoritativa de la arena en el servidor.
- `multiplayer/nexo-solo-engine.js`: versión para navegador de la misma simulación, usada por el modo individual.
- `data-map-config.js`: URL del servidor cooperativo para esta copia.

Esta carpeta no duplica el `server.js` compartido porque ese servidor también administra las salas de Galaxia Classic. Para jugar en línea se conecta al servicio existente.

## Volver a integrar mejoras en CalcuPlanet

Esta copia es independiente: editar sus archivos no cambia CalcuPlanet automáticamente. Cuando quieras conservar una mejora:

1. Copia los cambios de `nexo-coop-client.js` al archivo homónimo de la carpeta principal.
2. Si cambiaste las reglas de la partida, conserva la simulación del servidor (`multiplayer/nexo-game.js`) y la de navegador (`multiplayer/nexo-solo-engine.js`) sincronizadas. La versión solo adapta las exportaciones del módulo para ejecutarlas en una página normal y agrega el balance de reservas/munición de un jugador.
3. Copia los cambios de `multiplayer/nexo-game.js` al archivo homónimo dentro de `multiplayer` en la carpeta principal.
4. Si cambiaste controles, elementos de la interfaz o estilos en `index.html`, pasa esos cambios a la sección NEXO de `CalcuPlanet.html`.
5. Si cambiaste mensajes del protocolo o comportamiento del servidor, integra el cambio también en el `multiplayer/server.js` compartido.
6. Ejecuta `npm run check` desde `multiplayer` y prueba el juego integrado antes de publicarlo.

Mantén ambos archivos de simulación al día si sigues desarrollando en paralelo; una modificación aquí no se sincroniza sola con el juego original.
