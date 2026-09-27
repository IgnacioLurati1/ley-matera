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
