// Las cinemáticas no se pueden trabar a la mitad. Lo que traba es compilar
// shaders en el medio de la escena: la primera vez que se ve algo (Fierro, el
// Alcaide, el Chiquitijuein, un pedazo del mapa que nunca estuvo en cámara) o
// cuando cambia la cantidad de luces (ahí se recompila todo). Por eso:
//  · las luces de las cinemáticas ya existen desde que se arma el mapa (y no
//    se agregan ni se sacan durante la escena);
//  · al arrancar, con todos los actores ya armados (aunque estén escondidos),
//    se compila todo lo de la escena en segundo plano. `compile` de three
//    recorre también lo escondido, y compileAsync no frena el cuadro si la
//    placa compila en paralelo.
// Ojo: el mundo se dibuja en el buffer del postproceso (sin tone mapping y en
// lineal), no en la pantalla; compilando contra la pantalla saldrían otras
// variantes de los shaders y se volverían a compilar igual al aparecer.
export function warmScene(g) {
  const R = g.renderer;
  if (!R?.compile) return;
  const prev = R.getRenderTarget();
  R.setRenderTarget(g.post?.composer?.renderTarget1 || prev);
  try {
    if (R.compileAsync) R.compileAsync(g.scene, g.camera).catch(() => {});
    else R.compile(g.scene, g.camera);
  } catch {
    /* si falla, se compila sobre la marcha como siempre */
  } finally {
    R.setRenderTarget(prev);
  }
}

// Lo mismo para un actor que llega tarde (un modelo que baja con la escena ya
// armada: Belgrano en ui/MonumentoEnding): sus texturas a la placa y sus
// shaders compilados contra las luces y la niebla de la escena, escondido.
export function warmObject(g, obj) {
  const R = g.renderer;
  if (!R?.compile || !obj) return;
  obj.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) if (m[k]?.isTexture) R.initTexture(m[k]);
    }
  });
  const prev = R.getRenderTarget();
  R.setRenderTarget(g.post?.composer?.renderTarget1 || prev);
  try {
    if (R.compileAsync) R.compileAsync(obj, g.camera, g.scene).catch(() => {});
    else R.compile(obj, g.camera, g.scene);
  } catch {
    /* si falla, se compila sobre la marcha como siempre */
  } finally {
    R.setRenderTarget(prev);
  }
}
