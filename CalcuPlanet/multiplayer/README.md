# Multijugador cooperativo · Galaxia Classic y Nexo

Esta carpeta contiene el servidor WebSocket autoritativo que mantiene salas separadas para Galaxia Classic y Nexo. Valida el inicio de cada ronda y simula el combate de cada juego de forma independiente.

## Requisitos

- Node.js 20 o posterior.
- Un hosting que mantenga procesos Node activos y permita conexiones WebSocket para jugar desde Internet.

## Ejecución local

Desde esta carpeta:

```powershell
npm install
npm start
```

El servidor escucha en el puerto `2567` (o en el puerto definido por `PORT`). Comprueba que responde en `http://localhost:2567/health` con `"gameProtocol":4`. Si abres `CalcuPlanet.html` directamente en la misma computadora, el cliente intenta conectarse a `ws://localhost:2567/galaxy`.

## Conexión desde la aplicación publicada

1. Despliega este servicio en un proveedor con soporte para WebSockets persistentes.
2. Configura TLS y expón una URL `wss://`. El proxy debe reenviar las solicitudes WebSocket de la ruta `/galaxy` al puerto del servicio y permitir el upgrade `HTTP/1.1`.
3. Configura `ALLOWED_ORIGINS` con el origen exacto de la aplicación, por ejemplo `https://tusitio.example`. Se permiten varios orígenes separados por comas.
4. En `data-map-config.js`, completa `galaxyRealtimeUrl` con el origen del servicio, sin agregar `/galaxy`; por ejemplo `wss://salas.example`.
5. Publica de nuevo la aplicación por HTTPS y verifica el endpoint `/health`.

No uses una dirección `ws://` desde una página HTTPS: los navegadores la bloquearán como contenido mixto. Supabase almacena los mapas de Vector Drift; no aloja este servidor de partidas.

## Funcionalidad incluida

- Crear salas públicas o privadas y unirse por código.
- Explorar salas públicas disponibles; el código de las privadas no aparece en el listado.
- Salas de hasta cuatro jugadores, anfitrión, lista de participantes y estado «listo».
- El anfitrión puede iniciar cuando hay al menos dos jugadores conectados y todos están listos.
- Simulación autoritativa en el servidor: movimiento, disparos, enemigos, impactos, vidas, oleadas y jefes.
- Naves y vidas individuales, puntuación personal y puntuación total del equipo.
- Controles de teclado y táctiles; snapshots compartidos se envían a los clientes durante el combate.
- Colisión de proyectiles con un tamaño de nave explícito de 22 × 20 unidades y puntería ajustada a la posición del jugador.
- Predicción local del movimiento con corrección autoritativa suave; snapshots compartidos a aproximadamente 15 por segundo e interpolación para los demás pilotos y enemigos.
- Efectos locales de disparo, impacto, destrucción, daño y fin de ronda; se controlan con la opción de sonidos del juego.
- Límite de cola para omitir snapshots atrasados y descartar entrada obsoleta al perder una conexión o quedar la pestaña en segundo plano.
- El servidor renueva el watchdog en cada paquete de control para que mantener un botón no se interprete como entrada obsoleta.
- Al terminar, todos pueden volver a la sala y el anfitrión puede iniciar otra ronda.
- El tipo de juego se asigna a cada sala para mantener aisladas las partidas cooperativas de Galaxia y Nexo.
- Nexo incluye una arena cooperativa original para dos jugadores con movimiento, puertas, armas, enemigos y extracción.
- Nexo se desbloquea escribiendo `2012` en la calculadora y pulsando `=`. Usa WASD/flechas para moverte, ratón para apuntar, clic o F para disparar, espacio para el ataque cercano y E para interactuar. En móvil ofrece controles táctiles; se recomienda jugar en horizontal.
- Códigos aleatorios de seis caracteres, nombres limitados y validados en servidor.
- Reconexión con token de sesión durante 30 segundos y limpieza posterior de jugadores/salas.
- Endpoint de salud, límite de tamaño y frecuencia de mensajes, heartbeat WebSocket y filtro opcional de origen.

Las salas y las partidas viven en memoria y se pierden al reiniciar el proceso. Los códigos de invitación son credenciales temporales de acceso; compártelos solo con quienes quieras invitar. El combate cooperativo requiere una conexión activa con el servidor y no funciona sin conexión.

## Flujo de inicio · Galaxia Classic

1. Un jugador crea la sala y comparte el código.
2. Los demás se unen desde la opción online de Galaxia Classic.
3. Cada participante pulsa **Marcarme listo**.
4. Cuando hay al menos dos jugadores y todos están conectados/listos, el botón de inicio aparece únicamente para el anfitrión.
5. El anfitrión pulsa **Iniciar partida cooperativa**. El servidor arranca y sincroniza la ronda para toda la sala.
6. Al finalizar, cada jugador puede volver a la sala, marcarse listo y el anfitrión puede empezar otra ronda.

## Flujo de inicio · Nexo

1. En CalcuPlanet, escribe `2012` y pulsa `=`.
2. Crea una sala privada o pública; la otra persona se une con el código.
3. Ambos agentes marcan «listo» y el anfitrión inicia la operación.
4. Neutralicen a los guardias, abran las puertas con `E` y lleguen juntos a la salida. En móvil, giren el dispositivo a horizontal y usen el pad y los botones táctiles.

## Comprobación

```powershell
npm run check
```
