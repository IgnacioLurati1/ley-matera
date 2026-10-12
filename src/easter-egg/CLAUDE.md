# El juego escondido

Three.js r186, sin motor. Entra por `index.js` y `Game.js`.

- `config/maps/<mapa>.js`: zonas, puertas y coordenadas (x al este, z al sur, 1 m por celda). Mapas: molino, granja, penal, torre, castillo, esteros, monumento, eclipse.
- `entities/`: muertos, jefes y el easter egg de cada mapa (`*Egg.js`). `weapons/`: los mates. `world/`: el mapa y sus colisiones.
- `net/`: en línea y los muñecos (`Avatars.js`, `gauchoSkin.js`). `fx/`: la imagen (`PostFX.js`, `Epic.js`, `Lens.js`).
- `core/`: sonido (`audio.js`), voces (`voice.js`), música y la lista de escenas de prueba (`music.js` SCENES; Alt+I en el título).
- `ui/`: HUD, menús y cinemáticas.

## Costumbres del código
- Comentarios en castellano que dicen el porqué (y quién lo pidió y cuándo). Seguir ese estilo.
- Cada cambio de comportamiento lleva su interruptor `globalThis.__mdu...`, nombrado en el comentario.
- Hay archivos con CRLF: al parchear, respetar el fin de línea.
- El usuario juega con voces de murmullo (`core/voice.js`): "audio" o "voces" es eso, no la voz del navegador.

## Trampas conocidas
- Un shader que no compila deja la malla invisible y las pruebas que miran huesos pasan igual. Después de tocar un material: calidad alta y mirar los errores de shader. En el material del gaucho ya existen `uKeyDir`, `uKeyCol` y `uRimCol` (`entities/bossSkin.js`).
- `core/matrixCache.js` no rehace matrices que no cambiaron. Un muñeco fuera de cámara queda congelado (`mcFrozen`): para mover algo de adentro, `obj.mcDirty = true`. El `matrixWorld` de algo escondido puede ser viejo.
- En línea, lo que dura una escena no depende del azar ni del reloj de cada compu, y se prueba con dos jugadores de verdad (`openPair`).
- Rendimiento: medir antes de optimizar. Si las primeras mediciones dan poco, parar y avisar.
