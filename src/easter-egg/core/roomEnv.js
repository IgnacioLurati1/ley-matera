import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Los reflejos de los mates en la mano (virolas, bombillas): una sala de
// luces pasada por PMREM (weapons/Weapons usa la textura).
// Armarla de una traba la placa ~400 ms: los shaders de la sala y del
// desenfoque se compilan y se usan en el mismo momento, y la primera vez que
// se usan la placa espera a que terminen de compilar (y mientras tanto no
// dibuja nada de la página: el logo de Luta Studios se congelaba). Con
// roomEnvAsync se compilan antes en paralelo (compileAsync) y recién cuando
// están listos se arma: sin espera. Game.init la arma así mientras carga.

function room() {
  const r = new RoomEnvironment();
  // (los paneles de luz de la sala, de 17 a 100, se reflejaban en las
  // virolas lisas como manchitas blancas que el bloom hacía encandilar)
  r.traverse((o) => {
    if (o.material?.emissiveIntensity > 8) o.material.emissiveIntensity = 8;
  });
  return r;
}

function bake(pmrem, r) {
  const tex = pmrem.fromScene(r, 0.04).texture;
  r.dispose?.();
  pmrem.dispose();
  return tex;
}

// De una (como antes): lo que usa Weapons si no se armó antes.
export function roomEnv(renderer) {
  return bake(new THREE.PMREMGenerator(renderer), room());
}

// Sin trabar: primero se compila todo en paralelo y después se arma.
// (usa partes internas de PMREMGenerator de three 0.186; si faltan, se
// compila solo la sala y el resto queda como antes)
export async function roomEnvAsync(renderer) {
  const R = renderer;
  const pmrem = new THREE.PMREMGenerator(R);
  const r = room();
  const prev = R.getRenderTarget();
  // contra un buffer como el de PMREM (lineal, sin tone mapping): las mismas
  // variantes que va a usar al armarla
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const jobs = [];
  // el fondo de la sala (como el _backgroundBox de PMREM): se suelta recién
  // después de armarla, si no su programa se borra y se compila de nuevo
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false }));
  try {
    pmrem._setSize?.(256);
    const target = pmrem._allocateTargets?.();
    target?.dispose();
    // el desenfoque y el filtrado, con mallas como las que usa PMREM (los
    // atributos de la malla también eligen la variante del programa)
    const fx = new THREE.Scene();
    const plane = pmrem._lodMeshes?.[0]?.geometry;
    for (const m of [pmrem._blurMaterial, pmrem._ggxMaterial]) if (m && plane) fx.add(new THREE.Mesh(plane, m));
    fx.add(box);
    R.setRenderTarget(rt);
    jobs.push(R.compileAsync(r, new THREE.PerspectiveCamera(90, 1, 0.1, 100)));
    jobs.push(R.compileAsync(fx, new THREE.OrthographicCamera()));
  } finally {
    R.setRenderTarget(prev);
  }
  try {
    await Promise.all(jobs);
    return bake(pmrem, r);
  } finally {
    rt.dispose();
    box.geometry.dispose();
    box.material.dispose();
  }
}
