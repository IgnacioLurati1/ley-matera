# Cinemáticas

## Orden de trabajo (regla del usuario)
1. Armar la escena en Blender: `C:/Users/ignac/Tools/mdu-blender/escena.py` (leer su `README.md`). Antes de ubicar nada, el plano desde arriba.
2. Mandar la vista previa en gris a la página de revisión (`E.a_revision`). Página: `http://127.0.0.1:5189/`; si no está arriba, `node C:/Users/ignac/Tools/mdu-blender/revision/servidor.mjs` en segundo plano. Notas del usuario: `C:/Users/ignac/Tools/mdu-blender/revision/notas/<id>--gris.json`.
3. Recién con su sí: conectarla al juego (`blendScene.js`; ejemplo, el cañonazo en `entities/TowerEgg.js`), grabarla, correr `revisar-cinematicas.mjs` y mandar ese video a la misma página.

Un arreglo puntual a una escena que ya existe se hace directo.

## Reglas
- Siempre los cuatro gauchos (`cineCrew.js`), cada uno con su carácter.
- El mate, en la mano o escondido. Nunca flotando.
- Nada aparece ni salta de golpe sin un corte. Nada se atraviesa.
- Mejorar es retocar lo que hay: la misma historia y las mismas líneas.
- Dos gauchos lado a lado: 1,2 m o más (el poncho mide 1 m de ancho).
- Lo que ya está en el lugar (un fantasma, un NPC) sale en cámara: ponerlo en Blender con `E.figura`.
- Se revisa en tiempo real y en calidad alta: `Game.update` le pisa el lente a la escena que no pone `wantFov`.

## Piezas
- `castleCine.js`: base de las escenas (guion por pasos, textos, fundidos). `cineActors.js`: los cuatro con clips. `cineLife.js`: respiran, parpadean, mueven la boca.
- `blendScene.js`: reproduce lo exportado de Blender (cuerpos, cámara, foco, luz por toma, pasos, líneas).
- Clips: `public/assets/sotano/modelos/gaucho/*.json`. Animaciones de Mixamo, con fotos: `C:/Users/ignac/Tools/mdu-blender/out/indice/indice.html`.
