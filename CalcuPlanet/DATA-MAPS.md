# DATA EDITOR y biblioteca de mapas

## Arquitectura actual

Vector Drift vive dentro de `CalcuPlanet.html`. Antes de esta integración, los tres niveles estaban definidos en `VECTOR_COURSES`, y el juego derivaba dos límites y las colisiones de una polilínea central. El bucle de movimiento, la nave, la pausa, los efectos y el cronómetro ya existentes se conservan. Los mapas personalizados se dibujan como geometría abierta, se mueven con la misma nave y aplican colisión contra sus segmentos físicos.

El editor es un módulo independiente (`data-editor.html`, `data-editor.css`, `data-editor.js`). Usa `data-map-format.js` para validar, muestrear curvas y fijar el formato; `data-map-library.js` gestiona caché local, sesión de editor y sincronización; `data-map-config.js` contiene la configuración pública del proyecto Supabase.

## Formato JSON, versión 1

Cada documento tiene:

- `format` / `formatVersion`: discriminador y versión del formato.
- `id`, `name`, `version`, `updatedAt`: identidad y versión publicada.
- `dimensions`: ancho y alto del espacio de juego.
- `layers`: capas con visibilidad y orden.
- `elements`: paredes, obstáculos, líneas decorativas y zonas con vértices, trazo, brillo, colisión y comportamiento.
- `start`, `checkpoints`, `goal`: coordenadas y orientación en radianes.

Las geometrías admitidas son `line`, `polyline` y `bezier` cúbica (cuatro puntos: inicio, dos controles y final). Se exportan coordenadas y propiedades geométricas, nunca una imagen del mapa.

## Habilitar Supabase

1. Crea un proyecto Supabase y habilita Email/Password en Authentication. Si está activa la confirmación de correo, el editor informa al usuario que debe confirmarlo antes de iniciar sesión.
2. Ejecuta `supabase/migrations/001_data_maps.sql` en SQL Editor.
3. Copia la URL del proyecto y la clave **anon/public** (nunca la `service_role`) en `data-map-config.js`.
4. Sirve los archivos mediante HTTPS (por ejemplo, Pages o un hosting estático) y añade el dominio de la aplicación a los URLs permitidos de Authentication.
5. Crea una cuenta desde DATA EDITOR. Solo esa cuenta puede crear, actualizar o borrar sus mapas; los mapas publicados se pueden leer sin sesión.

La clave `anon/public` no es un secreto y está restringida por RLS. No coloques claves `service_role` en archivos del cliente. El SQL bloquea escritura de visitantes anónimos y limita las modificaciones a la cuenta propietaria.

## Flujo y modo sin conexión

- DATA EDITOR permite crear/abrir proyectos, editar geometría, guardar en el almacenamiento local del navegador, importar/exportar JSON y probar un nivel.
- `Publicar` requiere conexión, URL/key Supabase y una sesión de editor.
- Vector Drift sincroniza los mapas publicados al abrir su menú. Conserva una caché local para jugarlos sin conexión; los niveles originales siguen disponibles aunque la sincronización falle.
- La opción de editor se muestra solo en PC. La selección y ejecución de niveles publicados también está disponible en dispositivos móviles.

La sincronización central requiere configurar y alojar el backend del proyecto; si `data-map-config.js` permanece vacío, el editor y la prueba local funcionan, pero no se publican mapas ni se sincronizan entre dispositivos.

## Galaxia Classic · lobby cooperativo (etapa 1)

El lobby es un servicio independiente dentro de `multiplayer/`. Ejecuta `npm install` y `npm start` desde esa carpeta para iniciar el servidor Node.js; los pasos de despliegue y configuración WebSocket están en [`multiplayer/README.md`](./multiplayer/README.md). Configura `galaxyRealtimeUrl` en `data-map-config.js` con el origen `wss://` del servicio antes de publicar la aplicación. La conexión local usa `ws://localhost:2567` al abrir el HTML como archivo local.

Esta etapa permite crear y explorar salas, unirse mediante código, ver hasta cuatro jugadores, marcarse listo y reconectarse durante 30 segundos. No altera el modo individual. Todavía no sincroniza ni ejecuta combate cooperativo: vidas, naves, enemigos, oleadas y puntuaciones compartidas corresponden a una etapa posterior.
