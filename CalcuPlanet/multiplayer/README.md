# Galaxia Classic · lobby cooperativo

Esta carpeta contiene el servidor de salas de la primera etapa del multijugador. Es un servicio Node.js independiente que usa WebSockets (`ws`); no reemplaza el juego individual ni la física existente.

## Requisitos

- Node.js 20 o posterior.
- Un hosting que mantenga procesos Node activos y permita conexiones WebSocket para jugar desde Internet.

## Ejecución local

Desde esta carpeta:

```powershell
npm install
npm start
```

El servidor escucha en el puerto `2567` (o en el puerto definido por `PORT`). Comprueba que responde en `http://localhost:2567/health`. Si abres `CalcuPlanet.html` directamente en la misma computadora, el cliente intenta conectarse a `ws://localhost:2567/galaxy`.

## Conexión desde la aplicación publicada

1. Despliega este servicio en un proveedor con soporte para WebSockets persistentes.
2. Configura TLS y expón una URL `wss://`. El proxy debe reenviar las solicitudes WebSocket de la ruta `/galaxy` al puerto del servicio y permitir el upgrade `HTTP/1.1`.
3. Configura `ALLOWED_ORIGINS` con el origen exacto de la aplicación, por ejemplo `https://tusitio.example`. Se permiten varios orígenes separados por comas.
4. En `data-map-config.js`, completa `galaxyRealtimeUrl` con el origen del servicio, sin agregar `/galaxy`; por ejemplo `wss://salas.example`.
5. Publica de nuevo la aplicación por HTTPS y verifica el endpoint `/health`.

No uses una dirección `ws://` desde una página HTTPS: los navegadores la bloquearán como contenido mixto. Supabase almacena los mapas de Vector Drift; no aloja este servidor de partidas.

## Funcionalidad incluida en esta etapa

- Crear salas públicas o privadas y unirse por código.
- Explorar salas públicas disponibles; el código de las privadas no aparece en el listado.
- Salas de hasta cuatro jugadores, anfitrión, lista de participantes y estado «listo».
- Códigos aleatorios de seis caracteres, nombres limitados y validados en servidor.
- Reconexión con token de sesión durante 30 segundos y limpieza posterior de jugadores/salas.
- Endpoint de salud, límite de tamaño y frecuencia de mensajes, heartbeat WebSocket y filtro opcional de origen.

Las salas viven en memoria y se pierden al reiniciar el proceso. Los códigos de invitación son credenciales temporales de acceso; compártelos solo con quienes quieras invitar. Esta etapa todavía no sincroniza naves, vidas, enemigos, oleadas ni puntuación, y no inicia una partida cooperativa jugable. Eso requiere la siguiente etapa de estado de juego autoritativo.

## Comprobación

```powershell
npm run check
```
