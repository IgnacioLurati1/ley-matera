import * as THREE from 'three';
import { clampT } from '../bossSkin';

// El Espantapájaros con cuerpo de verdad (entities/bossSkin.js; modelo,
// esqueleto y clips de Meshy, los clips de su biblioteca en el mismo
// esqueleto, suyos y de nadie más). La pelea del Prado (world/Prado.js, la de
// la Salamanca con su ropa): parado se estira con los brazos en cruz y se
// tuerce el cuello; camina a los tumbos, como un muñeco de paja mal atado; la
// carga es el mismo tumbo a trancos largos, agachado y con la horquilla al
// frente (es un gigante: no corre a lo loco, el paso va a lo que anda). Sale
// de la tierra agachado y se levanta con los brazos abiertos, llama a los
// cuervos con la mano, amenaza pasándose el dedo por el cuello, se agazapa
// antes de embestir, gira y clava la horquilla, barre con ella, y atontado se
// rasca la cabeza. Cada golpe a tiempo con el daño. Cae de
// rodillas y así lo encuentra el final (ui/FarmCinematic.js): mira al cielo,
// abre los brazos en cruz mientras arde, se cae para adelante y se hunde en
// la paja. La horquilla (en la mano de la pieza 6) y el cuervo del hombro
// van colgados de sus huesos y desaparecen cuando la escena esconde los del
// de piezas; el fuego y el carbón del final se copian de los materiales del
// de piezas (bossMats) a los suyos.

// cuándo camina (m/s) y cuánto puede apurar o frenar el paso
const WALK_V = 0.35;
// el golpe: cuándo clava la horquilla en el clip (después del giro) y en el juego (Zombies slam: 0,75 s)
const SLAM_HIT = 1.0;
// el barrido: la mano de la horquilla bien adelante a los 0,55 s; el juego suelta el golpe al final de whipWind (0,65 s)
const LASH_AT = 0.55;
// la brasa del fuego sobre la ropa (la paja, más)
const BURN = 0.6;
// de rodillas (la muerte y el final) la horquilla queda clavada al lado de la
// rodilla izquierda (m del modelo, mirando a +z): cerca de donde la escena la
// deja caer cuando se desarma
const PLANT = [0.52, 0.36];
const CHAR = new THREE.Color(0x1a120c);

// El que está a la vista (para ui/FarmCinematic: la horquilla que suelta, de
// dónde sale el primer cuervo).
let shown = null;
export function scarecrowProp(name) {
  return shown?.root?.visible ? shown[name] || null : null;
}
// Cómo quedó el cuerpo a la vista (para que el final arranque donde murió, sin
// saltar): la cadera, la cabeza y hacia dónde mira (por la línea de los hombros).
// who: el jefe o títere que se dibujó así; pts: de dónde sale el fuego.
const FIRE_BONES = ['Hips', 'Spine01', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg'];
export function scarecrowPose() {
  const S = shown;
  if (!S?.root?.visible) return null;
  const B = S.bones;
  const at = (n) => B[n].getWorldPosition(new THREE.Vector3());
  const l = at('LeftArm');
  const r = at('RightArm');
  return { who: S.lastZ, hips: at('Hips'), head: at('Head'), chest: at('Spine'), pts: FIRE_BONES.filter((n) => B[n]).map(at), yaw: Math.atan2(-(l.z - r.z), l.x - r.x) };
}
// Cuánto se corre la cadera en el mundo con la caída del final (el clip 'cae'
// de punta a punta, a su escala y girado con él): ahí queda tirado.
export function scarecrowFallTravel(yaw) {
  const S = shown;
  const C = S?.clips?.cae;
  if (!C) return new THREE.Vector3();
  const n = C.n - 1;
  const s = S.root.scale.x;
  return new THREE.Vector3((C.hips[n * 3] - C.hips[0]) * s, 0, (C.hips[n * 3 + 2] - C.hips[2]) * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

const lum = (c) => c.r * 0.3 + c.g * 0.5 + c.b * 0.2;

// La horquilla: cabo de madera, virola y tres dientes de hierro oxidado,
// curvos (en metros del modelo; el agarre en el origen, los dientes para +y).
function buildFork() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5e4128, roughness: 0.82 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4e4640, roughness: 0.55, metalness: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 1.5, 8), wood);
  shaft.position.y = 0.3;
  g.add(shaft);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.1, 8), iron);
  ferrule.position.y = 1.08;
  g.add(ferrule);
  for (const x of [-1, 0, 1]) {
    const pts = [
      new THREE.Vector3(0, 1.1, 0),
      new THREE.Vector3(x * 0.07, 1.16, 0.005),
      new THREE.Vector3(x * 0.1, 1.28, 0.02),
      new THREE.Vector3(x * 0.105, 1.44, 0.06),
    ];
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.01, 5), iron));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.07, 5), iron);
    tip.position.set(x * 0.105, 1.475, 0.068);
    tip.rotation.x = 0.25;
    g.add(tip);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return g;
}

// La horquilla en la mano, cada cuadro. Parado y caminando la lleva como un
// bastón (derecha, un poco hacia donde va el brazo); en el golpe y el
// latigazo sigue la línea del brazo (los dientes llegan al piso cuando pega);
// en la carga, como una lanza, para adelante y un poco abajo. off: por dónde
// la agarra (m del modelo desde el agarre de siempre hacia el cabo).
const fv = { hand: new THREE.Vector3(), fa: new THREE.Vector3(), arm: new THREE.Vector3(), fwd: new THREE.Vector3(), d: new THREE.Vector3(), x: new THREE.Vector3(), z: new THREE.Vector3(), t: new THREE.Vector3(), m: new THREE.Matrix4() };
const UPV = new THREE.Vector3(0, 1, 0);
const fvq = new THREE.Quaternion();
function holdFork(S, z, dt) {
  const B = S.bones;
  const st = z?.state;
  const strike = st === 'slam' || st === 'whipWind' || st === 'whip' ? 1 : 0;
  const lance = st === 'charge' ? 1 : 0;
  // (atontado se agarra la cabeza: la horquilla le cuelga de la mano)
  const hang = st === 'stunned' ? 1 : 0;
  const k = Math.min(1, dt * 8);
  S.fk += (strike - S.fk) * k;
  S.fl += (lance - S.fl) * k;
  S.fh = (S.fh || 0) + (hang - (S.fh || 0)) * k;
  const s = S.root.scale.x;
  B.LeftHand.getWorldPosition(fv.hand);
  B.LeftForeArm.getWorldPosition(fv.fa);
  fv.arm.copy(fv.hand).sub(fv.fa).normalize();
  const yaw = z?.yaw || 0;
  fv.fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
  // bastón / línea del brazo / lanza
  const ks = Math.max(0, 1 - S.fk - S.fl - S.fh);
  fv.d.set(fv.arm.x * 0.5, 1, fv.arm.z * 0.5).addScaledVector(fv.fwd, 0.15).normalize().multiplyScalar(ks);
  fv.d.addScaledVector(fv.arm, S.fk);
  fv.t.copy(fv.fwd).addScaledVector(UPV, -0.14).addScaledVector(fv.arm, 0.2).normalize();
  fv.d.addScaledVector(fv.t, S.fl);
  fv.t.copy(fv.fwd).multiplyScalar(0.35).addScaledVector(UPV, -1);
  fv.d.addScaledVector(fv.t.normalize(), S.fh).normalize();
  // los dientes abiertos de costado (se ven los tres de frente)
  fv.x.crossVectors(fv.d, fv.fwd);
  if (fv.x.lengthSq() < 1e-4) fv.x.crossVectors(fv.d, UPV);
  fv.x.normalize();
  fv.z.crossVectors(fv.x, fv.d);
  fv.m.makeBasis(fv.x, fv.d, fv.z);
  const F = S.fork;
  F.quaternion.setFromRotationMatrix(fv.m);
  // el agarre (dónde la agarra, desde el agarre del modelo de la horquilla):
  // de bastón, por la mitad (el cabo casi en el piso); en el golpe y colgando,
  // del cabo
  const off = 0.32 * ks - 0.3 * S.fk - 0.1 * S.fl - 0.35 * S.fh;
  F.position.copy(fv.hand).addScaledVector(fv.arm, 0.07 * s).addScaledVector(fv.d, -off * s);
  // de rodillas: clavada en el piso a su lado, un poco inclinada para afuera
  S.fp = (S.fp || 0) + ((S.plant ? 1 : 0) - (S.fp || 0)) * Math.min(1, dt * 5);
  if (S.fp > 0.001 && z) {
    fv.d.set(0.1, 1, -0.05).applyAxisAngle(UPV, yaw).normalize();
    // (desde la cadera del modelo: arrodillado, el cuerpo no queda sobre z.pos)
    fv.t.set(PLANT[0], 0, PLANT[1]).applyAxisAngle(UPV, yaw).multiplyScalar(s).add(B.Hips.getWorldPosition(fv.x));
    fv.t.y = (z.baseY || 0) + 0.42 * s * fv.d.y;
    fv.x.crossVectors(fv.d, fv.fwd).normalize();
    fv.z.crossVectors(fv.x, fv.d);
    fv.m.makeBasis(fv.x, fv.d, fv.z);
    F.quaternion.slerp(fvq.setFromRotationMatrix(fv.m), S.fp);
    F.position.lerp(fv.t, S.fp);
  }
  S.root.worldToLocal(F.position);
}

// Un enganche colgado de un hueso, puesto en el mundo con el modelo en reposo.
function socket(bone, pos, quat, scale = 1) {
  const o = new THREE.Object3D();
  const W = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(scale, scale, scale));
  const L = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(W);
  L.decompose(o.position, o.quaternion, o.scale);
  bone.add(o);
  return o;
}

export default {
  kind: 'scarecrow',
  dir: 'scarecrow',
  loops: ['quieto', 'caminar', 'carga', 'rodillas'],
  // el latigazo sale de la mano de la horquilla (Zombies.whipFx)
  alias: { whip: 'LeftHand' },

  ready(S) {
    const B = S.bones;
    S.root.updateMatrixWorld(true);
    const wp = (n) => B[n].getWorldPosition(new THREE.Vector3());
    S.root.traverse((o) => {
      if (o.isSkinnedMesh) S.mat = o.material;
    });
    // la horquilla en la izquierda del modelo (la pieza 6, la del rebenque):
    // cuelga del modelo y cada cuadro va a la mano (after: hacia dónde apunta)
    S.fork = buildFork();
    S.root.add(S.fork);
    S.fk = 0;
    S.fl = 0;
    // el cuervo, arriba del hombro derecho del modelo (el de la pieza 3), mirando para adentro
    S.crowSock = socket(B.RightShoulder, wp('RightArm').add(new THREE.Vector3(0.03, 0.1, -0.02)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), 1.4);
    // el fuego del final: la brasa en la ropa y la paja, y el carbón (uniforms:
    // el programa es uno solo, prendido o apagado)
    S.burnU = { value: new THREE.Color(0) };
    S.charU = { value: 0 };
    if (S.mat) {
      S.mat.onBeforeCompile = (sh) => {
        sh.uniforms.uBurn = S.burnU;
        sh.uniforms.uChar = S.charU;
        sh.fragmentShader = sh.fragmentShader
          .replace('void main() {', 'uniform vec3 uBurn;\nuniform float uChar;\nvoid main() {')
          .replace('#include <map_fragment>', '#include <map_fragment>\n\tfloat sLum = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));\n\tdiffuseColor.rgb *= 1.0 - uChar * 0.85;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uBurn * (0.25 + smoothstep(0.2, 0.55, sLum)) * (1.0 - uChar * 0.5);');
      };
      S.mat.customProgramCacheKey = () => 'scarecrowSkin';
      S.mat.needsUpdate = true;
    }
  },

  // La pelea y el final (la escena arma su Espantapájaros como jefe).
  pick(z, { S, dt, s, g }) {
    const st = z.state;
    const Tt = z.stateT || 0;
    const C = S.clips;
    S.dy = 0;
    S.plant = false;
    // el final: de rodillas, mira al cielo, en cruz, se cae y se hunde
    const F = g.cine;
    if (F?.sc === z) {
      S.plant = true;
      // (al entrar al final, de rodillas de una: sin fundirse con la muerte de la
      // pelea, que el títere ya quedó puesto donde cayó y como cayó)
      if (S.cPose == null) S.layers.length = 0;
      const pose = F.fallT != null ? 'fall' : F.scPose;
      if (pose !== S.cPose) {
        S.cPose = pose;
        S.cT = 0;
      } else S.cT += dt;
      switch (pose) {
        case 'look':
          return { key: 'mira', t: clampT(S, 'mira', S.cT) };
        case 'cross':
          return { key: 'cruz', t: clampT(S, 'cruz', S.cT) };
        case 'fall':
          S.dy = z.P.rootY || 0;
          return { key: 'cae', t: clampT(S, 'cae', S.cT) };
      }
      return { key: 'rodillas', t: null };
    }
    S.cPose = null;
    if (z.dead || st === 'dead' || st === 'melting') {
      S.deadT = (S.deadT ?? -dt) + dt;
      // (al caer de rodillas clava la horquilla)
      S.plant = S.deadT > 0.9;
      return { key: 'muere', t: clampT(S, 'muere', S.deadT) };
    }
    S.deadT = null;
    switch (st) {
      // sale de la tierra agachado y se levanta abriendo los brazos (1,8 s)
      case 'intro':
        return { key: 'ruge', t: clampT(S, 'ruge', 1.8 + Tt * 1.2) };
      // llama a los cuervos y a los muertos con la mano
      case 'summon':
        return { key: 'llama', t: clampT(S, 'llama', 1.6 + Tt) };
      // se enfurece: el dedo por el cuello
      case 'enrage':
      case 'howl':
        return { key: 'amenaza', t: clampT(S, 'amenaza', 0.2 + Tt) };
      // agazapado, se hamaca y se tira para adelante (0,85 s)
      case 'chargeWind':
        return { key: 'agazapa', t: clampT(S, 'agazapa', 4.4 + Tt) };
      case 'charge':
        S.chargeT = (S.chargeT || 0) + dt * Math.max(0.7, Math.min(1.5, S.v / (C.carga.speed * s)));
        return { key: 'carga', t: S.chargeT % C.carga.dur };
      // el horquillazo: los dientes tocan el piso cuando pega (0,75 s)
      case 'slam':
        return { key: 'golpe', t: clampT(S, 'golpe', SLAM_HIT - 0.75 + Tt) };
      // el latigazo, con la mano de la horquilla
      case 'whipWind':
        return { key: 'latigo', t: clampT(S, 'latigo', LASH_AT - 0.65 + Tt) };
      case 'whip':
        return { key: 'latigo', t: clampT(S, 'latigo', LASH_AT + Tt) };
      // atontado se rasca la cabeza (no entiende nada)
      case 'stunned':
        return { key: 'aturdido', t: clampT(S, 'aturdido', 1.2 + Tt) };
      // bajo tierra (entities/bossMoves.js): se agacha en cuatro patas y se
      // hunde; sale agachado y se levanta con los brazos abiertos
      case 'burrow':
      case 'emerge':
        S.dy = z.P.rootY || 0;
        return { key: 'ruge', t: clampT(S, 'ruge', (st === 'burrow' ? 3.9 : 1.8) + Tt) };
      case 'chase':
      case 'toLock': {
        if (S.v > WALK_V) {
          S.walkT = (S.walkT || 0) + dt * Math.max(0.6, Math.min(1.5, S.v / (C.caminar.speed * s)));
          return { key: 'caminar', t: S.walkT % C.caminar.dur };
        }
        S.idleT = (S.idleT || 0) + dt;
        return { key: 'quieto', t: S.idleT % C.quieto.dur };
      }
    }
    return { key: 'rig' };
  },

  cine() {
    return { key: 'rig' };
  },

  // hundido (bajo tierra, en la pila de paja): lo que baja el de piezas
  adjust(S, ctx, z, qYaw, hipsW) {
    if (S.dy) hipsW.y += S.dy;
  },

  // La horquilla y el cuervo, como los del de piezas; el fuego y el carbón.
  after(S, { zs, dt, g }, z) {
    shown = S;
    S.lastZ = z;
    holdFork(S, z, dt);
    const R = zs.bossRig;
    if (!R) return;
    // (el cuervo es una copia del de piezas: mismas mallas, la cabeza se mueve igual)
    const src = R.parts[1].children.find((o) => Math.abs(o.position.x + 0.22) < 0.01 && Math.abs(o.position.y - 0.33) < 0.01);
    if (src && !S.crow) {
      S.crow = src.clone();
      S.crow.position.set(0, 0, 0);
      S.crow.rotation.set(0, 0, 0);
      S.crow.traverse((o) => {
        o.layers.set(0);
        o.frustumCulled = false;
      });
      S.crowSock.add(S.crow);
    }
    if (S.crow && src) {
      // (en el final no: de rodillas, mirando al cielo, le atravesaba la boca)
      S.crow.visible = src.visible && !(z && g?.cine?.sc === z);
      if (src.children[1] && S.crow.children[1]) S.crow.children[1].quaternion.copy(src.children[1].quaternion);
    }
    S.fork.visible = R.parts[17].children.some((o) => o.visible);
    const BM = zs.bossMats;
    if (!BM || !S.mat) return;
    const c = BM.cloth;
    S.burnU.value.copy(c.emissive || CHAR).multiplyScalar((c.emissiveIntensity || 0) * BURN);
    const L = lum(c.color);
    if (!(c.emissiveIntensity > 0) && (S.cloth0 == null || L > S.cloth0)) S.cloth0 = L;
    const L0 = S.cloth0 ?? L;
    S.charU.value = Math.max(0, Math.min(1, (L0 - L) / Math.max(1e-3, L0 - lum(CHAR))));
  },
};
