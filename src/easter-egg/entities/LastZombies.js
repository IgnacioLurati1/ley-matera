import * as THREE from 'three';

// Los últimos de la ronda: si quedan uno o dos por más de 20 s, se les ve la
// silueta roja a través de las paredes para ir a buscarlos. Y si alguno se
// trabó (no avanza), vuelve a salir por una entrada. Decide el anfitrión (o
// el que juega solo); a los invitados les llega la lista de cuáles son.
// (Los que se pierden lejos ya vuelven solos a la cola: Zombies, farT.)

const WAIT = 20;
// segundos persiguiendo sin moverse del lugar: trabado
const STUCK = 12;
const MAX_MARK = 2;
// las partes del cuerpo que se ven a través de las paredes (sin ojos ni adornos)
const BODY = ['pelvis', 'torso', 'head', 'uarm', 'farm', 'thigh', 'shin', 'foot'];
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();

export default class LastZombies {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.ids = [];
    this.sendT = 0;
    this.watch = new Map();
    this.los = new Map();
    this.k = 0;
    this.meshes = null;
  }

  // Invitado: los que marcó el anfitrión.
  setRemote(ids) {
    this.ids = Array.isArray(ids) ? ids.slice(0, MAX_MARK).map((x) => x | 0) : [];
  }

  update(dt) {
    if (!this.g.net?.guest) this.decide(dt);
    this.draw(dt);
  }

  decide(dt) {
    const g = this.g;
    const r = g.rounds;
    const live = r.state === 'active' && g.state === 'playing' ? g.zombies.pool.filter((z) => z.active && !z.dead) : [];
    const left = live.length + (r.toSpawn || 0);
    this.t = live.length && left <= MAX_MARK ? this.t + dt : 0;
    const on = this.t > WAIT;
    if (on) for (const z of live) this.unstick(z, dt);
    else this.watch.clear();
    // (los carpinchos y caballos no llevan silueta: se los devuelve igual si se traban)
    const ids = on ? live.filter((z) => z.active && !z.dead && !z.dog).map((z) => z.id) : [];
    const key = ids.join(',');
    const changed = key !== this.ids.join(',');
    this.ids = ids;
    // en línea: la lista a los invitados cuando cambia (y cada tanto, por los que entran)
    this.sendT -= dt;
    if (g.net?.host && (changed || (ids.length && this.sendT <= 0))) {
      this.sendT = 1;
      g.net.net.broadcast({ t: 'lastz', ids });
    }
  }

  // El que persigue sin moverse del lugar se trabó: vuelve a la cola de la ronda.
  // (Pegándole a alguien, rompiendo una ventana o saliendo de la tierra no cuenta.)
  unstick(z, dt) {
    const g = this.g;
    if (z.state !== 'chase') {
      this.watch.delete(z.id);
      return;
    }
    let w = this.watch.get(z.id);
    if (!w || Math.hypot(z.pos.x - w.x, z.pos.z - w.z) > 1.5) {
      this.watch.set(z.id, { x: z.pos.x, z: z.pos.z, t: 0 });
      return;
    }
    w.t += dt;
    if (w.t < STUCK) return;
    this.watch.delete(z.id);
    g.zombies.free(z);
    g.rounds.requeue(1);
  }

  // Las mallas de la silueta: las mismas de los zombies, de un solo color y
  // dibujadas solo donde algo las tapa.
  build() {
    const g = this.g;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
    this.meshes = g.zombies.meshes
      .filter((M) => BODY.includes(M.key))
      .map((M) => {
        const im = new THREE.InstancedMesh(M.im.geometry, this.mat, MAX_MARK * M.parts.length);
        im.frustumCulled = false;
        im.renderOrder = 9;
        im.count = 0;
        g.scene.add(im);
        return { parts: M.parts, im };
      });
  }

  draw(dt) {
    const g = this.g;
    const on = this.ids.length > 0;
    if (on !== !!this.was) {
      this.was = on;
    }
    if (!on && !this.meshes) return;
    if (!this.meshes) this.build();
    const cam = g.camera.position;
    let n = 0;
    for (const id of this.ids) {
      const z = g.zombies.pool.find((q) => q.active && !q.dead && q.id === id && !q.dog);
      if (!z) continue;
      // a la vista no hace falta (y así no se tiñen los brazos que tapa su propio cuerpo)
      let l = this.los.get(id);
      if (!l) this.los.set(id, (l = { t: 0, hidden: true }));
      l.t -= dt;
      if (l.t <= 0) {
        l.t = 0.15;
        tmpP.set(z.pos.x, (z.baseY || 0) + (z.crawler ? 0.35 : 1.1), z.pos.z);
        tmpD.subVectors(tmpP, cam);
        const len = tmpD.length();
        l.hidden = len > 0.5 && g.world.raycast(cam, tmpD.divideScalar(len), len - 0.3) !== Infinity;
      }
      if (!l.hidden) continue;
      for (const X of this.meshes) {
        for (let k = 0; k < X.parts.length; k++) {
          const part = X.parts[k];
          X.im.setMatrixAt(n * X.parts.length + k, z.hidden & (1 << part) ? ZERO : z.mats[part]);
        }
      }
      n++;
    }
    if (!on) this.los.clear();
    for (const X of this.meshes) {
      X.im.count = n * X.parts.length;
      X.im.instanceMatrix.needsUpdate = true;
    }
    this.k += ((on ? 1 : 0) - this.k) * Math.min(1, dt * 4);
    this.mat.opacity = 0.5 * this.k;
  }
}
