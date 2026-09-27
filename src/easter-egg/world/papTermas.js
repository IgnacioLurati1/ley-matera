import * as THREE from 'three';
import { PROPS } from '../config/map';
import { mesh, boxGeo, cylGeo } from './props';

// El Pack-a-Pava del castillo está del otro lado del barranco, en las termas
// del Inca, y se llega por el puente levadizo de la barbacana. Es a mitad de
// partida (nunca de entrada) y va por pasos; decide el anfitrión y los
// invitados le avisan sus tiros ('papq') y giran el torno con F:
//  1. Sin la luz (el fogón del gran salón) no hay calor y el hielo que traba las
//     cadenas del puente no se rompe: los tiros rebotan.
//  2. Con la luz, las tres grampas de hielo brillan: dos donde las cadenas
//     entran a la pared del portón y una que tapa el tambor del torno. A tiros.
//  3. El torno (mantener F): cada vuelta baja un poco el puente, cada cuarto
//     queda trabado y si nadie gira se resbala hasta la última traba. Con un
//     muerto encima no se puede girar. Al final el puente cae de golpe.
//  4. En las termas, las tres pozas tienen el ojo de agua tapado por un tapón
//     de hielo: a tiros; si se tarda mucho entre la primera y la última, el frío
//     vuelve a tapar las que ya estaban rotas.
//  5. El agua caliente llega a la poza de la pava: el hielo se derrite solo
//     mientras haya alguien en las termas (unos 40 s), y los muertos salen de la
//     nieve a pararlo. Derretido, el Pack-a-Pava anda.
// (world/PapQuest.js le pasa todo lo del castillo a esta clase; el puente lo
// arma world/castleBridge.js como la puerta 'puente'.)

const HP = 6;
const REFREEZE = 35;
const CLAMP_HP = 8;
const CRANK_STEP = 1 / 20;
const CRANK_IDLE = 1.8;
const SLIP = 0.05;
// lo que se inclina el puente mientras se gira (el resto lo cae de golpe)
const TILT = 0.2;
const HEAT_T = 40;
const STAGES = ['cold', 'ice', 'crank', 'pools', 'heat', 'done'];
// la barbacana: el torno en la pared oeste (cara x = 50) y los agujeros de las
// cadenas en la pared del portón (cara z = 71), sobre el vano
const WINCH = { x: 50, z: 67.8 };
const HOLES = [50.55, 53.45];
const GATE_Z = 71;
const HOLE_UP = 5.3;
// las termas: la meseta de las pozas (sin el puente)
const TERMAS_Z = 82;
const LINK = 0.2;
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

// Hielo con rajaduras y escarcha en el borde.
let CRACK = null;
function crackTex() {
  if (CRACK) return CRACK;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, '#bfe2f6');
  g.addColorStop(0.75, '#d8eefa');
  g.addColorStop(1, '#f4fbff');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  let seed = 21;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.strokeStyle = 'rgba(90,140,190,0.55)';
  x.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) {
    let px = 128;
    let py = 128;
    const a = (k / 14) * Math.PI * 2 + rnd() * 0.3;
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 7; s++) {
      px += Math.cos(a + (rnd() - 0.5) * 0.9) * 17;
      py += Math.sin(a + (rnd() - 0.5) * 0.9) * 17;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  CRACK = new THREE.CanvasTexture(c);
  CRACK.colorSpace = THREE.SRGBColorSpace;
  return CRACK;
}

export default class PapTermas {
  constructor(q) {
    this.q = q;
    const g = (this.g = q.g);
    this.stage = 'cold';
    this.hintT = -99;
    this.plugMat = new THREE.MeshStandardMaterial({ color: 0xa8dcff, roughness: 0.1, metalness: 0.1, emissive: 0x2a88ff, emissiveIntensity: 0.9 });
    const shardMat = (this.shardMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.08, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }));
    this.pools = PROPS.filter((p) => p.type === 'terma').map((p, i) => {
      const [x, z] = p.pos;
      const r = p.r || 1.8;
      const y = g.world.floorAt(x, z);
      const grp = new THREE.Group();
      grp.position.set(x, y, z);
      // la capa de hielo sobre el agua
      const sheet = new THREE.Mesh(
        new THREE.CircleGeometry(r * 1.03, 28),
        new THREE.MeshStandardMaterial({ map: crackTex(), roughness: 0.22, metalness: 0.05, emissive: 0x0a2a44, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, depthWrite: false }),
      );
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.y = 0.145;
      sheet.renderOrder = 2;
      grp.add(sheet);
      // el tapón del ojo de agua: una cúpula que brilla, con agujas alrededor
      const plug = new THREE.Group();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.plugMat);
      dome.scale.set(1, 1.15, 1);
      plug.add(dome);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const h = 0.35 + (k % 3) * 0.14;
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 5), shardMat);
        s.position.set(Math.cos(a) * 0.36, h / 2, Math.sin(a) * 0.36);
        s.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
        plug.add(s);
      }
      plug.position.y = 0.14;
      grp.add(plug);
      q.root.add(grp);
      return { i, x, y, z, r, grp, sheet, plug, hp: HP, broken: false, melt: 0, flash: 0, gey: 0, center: new THREE.Vector3(x, y + 0.4, z) };
    });
    // la pava del Pack-a-Pava, metida en un bloque de hielo, y la poza helada
    const pap = q.pap;
    this.ice = new THREE.Group();
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.75, 2.1),
      new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.06, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.3, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    block.position.set(0, 2.08, 0.12);
    block.rotation.y = 0.12;
    this.ice.add(block);
    this.block = block;
    const lid = new THREE.Mesh(new THREE.CircleGeometry(0.86, 20), new THREE.MeshStandardMaterial({ map: crackTex(), roughness: 0.22, transparent: true, opacity: 0.92, depthWrite: false }));
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 1.235;
    this.ice.add(lid);
    pap?.group.add(this.ice);
    this.iceMelt = 0;
    this.timer = -1;
    // las pozas heladas no echan vapor
    for (const s of g.world.castleSteam || []) s.frozen = true;
    // el calor del final y su termómetro, al lado de la pava
    this.heat = 0;
    this.heatShown = 0;
    this.heatNetT = 0;
    this.spawnT = 3;
    this.spawned = 0;
    this.buildGauge();
    // la barbacana: el puente, las cadenas, las grampas y el torno
    this.door = g.interact.list.find((it) => it.kind === 'door' && it.door?.def.kind === 'puente')?.door || null;
    this.bridge = this.door?.pieces.find((p) => p.fall) || null;
    this.prog = 0;
    this.lock = 0;
    this.shown = 0;
    this.lastCrank = -99;
    this.slipNetT = 0;
    this.buildBarbican();
  }

  get stageIdx() {
    return STAGES.indexOf(this.stage);
  }

  // ---------------- la barbacana ----------------
  buildBarbican() {
    const g = this.g;
    const q = this.q;
    const M = q.M;
    const iron = M.iron;
    const wood = M.woodDark || M.wood;
    const fyW = g.world.floorAt(WINCH.x + 0.6, WINCH.z);
    const fyG = g.world.floorAt(52, GATE_Z - 0.3);
    this.fyW = fyW;
    const axis = new THREE.Vector3(WINCH.x + 0.48, fyW + 1.25, WINCH.z);
    this.axis = axis;
    // el torno: dos soportes de hierro en la pared, el tambor con la cadena
    // enrollada, la rueda de rayos para girarlo y la rueda dentada con su traba
    const winch = new THREE.Group();
    for (const dz of [-0.78, 0.78]) {
      winch.add(mesh(boxGeo(0.5, 1.0, 0.1), iron, WINCH.x + 0.25, fyW + 1.15, WINCH.z + dz));
      winch.add(mesh(boxGeo(0.12, 0.12, 0.3), iron, WINCH.x + 0.06, fyW + 0.7, WINCH.z + dz));
    }
    const drum = new THREE.Group();
    drum.position.copy(axis);
    drum.add(mesh(cylGeo(0.24, 0.24, 1.4, 16), wood, 0, 0, 0, Math.PI / 2, 0, 0));
    for (const z of [-0.62, 0.62]) drum.add(mesh(cylGeo(0.3, 0.3, 0.08, 16), iron, 0, 0, z, Math.PI / 2, 0, 0));
    // la cadena enrollada
    const coil = new THREE.TorusGeometry(0.255, 0.03, 5, 18);
    for (let k = 0; k < 9; k++) drum.add(mesh(coil, iron, 0, 0, -0.5 + k * 0.125));
    winch.add(drum);
    const wheel = new THREE.Group();
    wheel.position.set(axis.x, axis.y, WINCH.z - 0.95);
    wheel.add(mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 24), wood));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      wheel.add(mesh(boxGeo(0.05, 0.55, 0.05), wood, Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0, 0, 0, a - Math.PI / 2));
      // las manijas, para agarrarla
      wheel.add(mesh(cylGeo(0.035, 0.035, 0.22, 6), wood, Math.cos(a) * 0.6, Math.sin(a) * 0.6, -0.1, Math.PI / 2, 0, 0));
    }
    wheel.add(mesh(cylGeo(0.09, 0.09, 0.2, 10), iron, 0, 0, 0, Math.PI / 2, 0, 0));
    winch.add(wheel);
    const gear = new THREE.Group();
    gear.position.set(axis.x, axis.y, WINCH.z + 0.92);
    gear.add(mesh(cylGeo(0.34, 0.34, 0.06, 20), iron, 0, 0, 0, Math.PI / 2, 0, 0));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      gear.add(mesh(boxGeo(0.07, 0.09, 0.06), iron, Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0, 0, 0, a));
    }
    winch.add(gear);
    // la traba (un diente que cae sobre la rueda)
    winch.add(mesh(boxGeo(0.06, 0.34, 0.06), iron, axis.x + 0.12, axis.y + 0.46, WINCH.z + 0.92, 0, 0, 0.5));
    for (const o of winch.children) o.castShadow = true;
    q.root.add(winch);
    this.drum = drum;
    this.wheel = wheel;
    this.gear = gear;
    // las cadenas de adentro: de los agujeros del portón a una roldana en el
    // techo, de ahí a otra arriba del torno y abajo al tambor
    const holeY = fyG + HOLE_UP;
    const P1 = new THREE.Vector3(52, holeY + 2.1, GATE_Z - 0.45);
    const P2 = new THREE.Vector3(axis.x, holeY + 2.1, WINCH.z);
    const holes = HOLES.map((x) => new THREE.Vector3(x, holeY, GATE_Z - 0.02));
    const runs = [
      [holes[0], P1],
      [holes[1], P1],
      [P1, P2],
      [P2, new THREE.Vector3(axis.x, axis.y + 0.24, WINCH.z)],
    ];
    const mats = [];
    for (const [a, b] of runs) chainLine(mats, a, b);
    const link = new THREE.TorusGeometry(0.07, 0.022, 4, 10).scale(1, 1.55, 1);
    const chains = new THREE.InstancedMesh(link, iron, mats.length);
    mats.forEach((m, i) => chains.setMatrixAt(i, m));
    chains.castShadow = true;
    q.root.add(chains);
    // las roldanas y las chapas de los agujeros
    for (const P of [P1, P2]) {
      q.root.add(mesh(cylGeo(0.2, 0.2, 0.1, 14), iron, P.x, P.y, P.z, 0, 0, Math.PI / 2));
      q.root.add(mesh(boxGeo(0.08, 0.5, 0.08), iron, P.x, P.y + 0.3, P.z));
    }
    for (const h of holes) q.root.add(mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 14), iron, h.x, h.y, h.z + 0.01));
    // las tres grampas de hielo: los dos agujeros y el tambor
    const spots = [
      { at: holes[0].clone().setZ(GATE_Z - 0.18), r: 0.5, big: false },
      { at: holes[1].clone().setZ(GATE_Z - 0.18), r: 0.5, big: false },
      { at: axis.clone(), r: 0.72, big: true },
    ];
    this.clamps = spots.map((s, i) => this.makeClamp(i, s));
    // el torno se gira desde el pasillo
    this.winchIt = g.interact.add({
      kind: 'papq',
      pos: new THREE.Vector3(axis.x + 0.5, fyW + 1.1, WINCH.z),
      radius: 2.1,
      wide: true,
      holdTime: 0.5,
      prompt: () => this.winchPrompt(),
      cost: () => 0,
      use: () => this.crank(),
    });
  }

  // Una grampa: hielo apelotonado con puntas, que brilla cuando se puede romper.
  makeClamp(i, s) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.08, metalness: 0.1, emissive: 0x2a88ff, emissiveIntensity: 0.12, transparent: true, opacity: 0.86 });
    const grp = new THREE.Group();
    grp.position.copy(s.at);
    let seed = 7 + i * 31;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (s.big) {
      // el tambor adentro de un bloque de hielo
      grp.add(mesh(boxGeo(0.8, 0.78, 1.55), mat, 0.02, 0, 0, 0.05, 0, 0.04));
      // pedazos amontonados encima y a los costados (que no sea una caja lisa)
      for (let k = 0; k < 8; k++) grp.add(mesh(new THREE.IcosahedronGeometry(0.18 + r() * 0.16, 0), mat, 0.1 + (r() - 0.3) * 0.5, 0.3 + r() * 0.2, (r() - 0.5) * 1.5, r() * 3, r() * 3, 0));
      for (let k = 0; k < 9; k++) grp.add(mesh(new THREE.ConeGeometry(0.08 + r() * 0.06, 0.3 + r() * 0.35, 5), mat, (r() - 0.5) * 0.7, -0.38 - r() * 0.1, (r() - 0.5) * 1.3, Math.PI, 0, (r() - 0.5) * 0.4));
    } else {
      for (let k = 0; k < 6; k++) grp.add(mesh(new THREE.IcosahedronGeometry(0.16 + r() * 0.14, 0), mat, (r() - 0.5) * 0.45, (r() - 0.5) * 0.5, (r() - 0.3) * 0.25, r() * 3, r() * 3, 0));
      // los carámbanos que cuelgan
      for (let k = 0; k < 5; k++) grp.add(mesh(new THREE.ConeGeometry(0.05 + r() * 0.04, 0.3 + r() * 0.4, 5), mat, (r() - 0.5) * 0.5, -0.35 - r() * 0.15, r() * 0.15, Math.PI, 0, 0));
    }
    this.q.root.add(grp);
    return { i, grp, mat, r: s.r, center: s.at.clone(), hp: CLAMP_HP, broken: false, flash: 0 };
  }

  winchPrompt() {
    const st = this.stage;
    const info = (text) => ({ text, noCost: true, info: true });
    if (st === 'cold') return info('El puente levadizo está trabado por el hielo. Sin calor en el castillo no se derrite: prendé el fogón del Gran Salón');
    if (st === 'ice') return info(`Las cadenas del puente se congelaron: rompé el hielo a tiros (${this.clamps.filter((c) => c.broken).length}/3)`);
    if (st !== 'crank') return null;
    if (this.jammed()) return info('¡Sacate los muertos de encima para girar el torno!');
    return { text: `bajar el puente con el torno (${Math.round(this.prog * 100)}%)`, hold: true, noCost: true };
  }

  // ¿Hay un muerto encima del torno? (no deja girar)
  jammed() {
    const Z = this.g.zombies;
    if (!Z) return false;
    const a = this.axis;
    for (const z of Z.pool) if (z.active && !z.dead && Math.hypot(z.pos.x - a.x, z.pos.z - a.z) < 2.2 && Math.abs(z.pos.y - this.fyW) < 2) return true;
    return false;
  }

  // (anfitrión; el invitado llega acá por Interactables → 'use')
  crank() {
    const g = this.g;
    if (this.stage !== 'crank' || g.net?.guest) return false;
    if (this.jammed()) return false;
    this.prog = Math.min(1, this.prog + CRANK_STEP);
    this.lastCrank = g.time;
    // la traba: cada cuarto ya no vuelve para atrás
    const q = Math.floor(this.prog * 4 + 1e-6) / 4;
    if (q > this.lock) {
      this.lock = q;
      this.ratchet(true);
    }
    if (this.prog >= 1) this.release();
    else g.net?.event('papq', { w: +this.prog.toFixed(3) });
    return true;
  }

  // el torno suelta la última traba y el puente cae (lo avisa la puerta)
  release() {
    const g = this.g;
    this.prog = 1;
    this.lock = 1;
    this.setStage('pools');
    if (this.door && !this.door.open) g.interact.openDoor(this.door);
  }

  ratchet(big) {
    const a = this.g.audio;
    if (!a?.ctx) return;
    const o = a.out({ pos: this.axis, gain: big ? 0.9 : 0.4, reverb: 0.3 });
    a.noise(o, { dur: 0.05, type: 'bandpass', freq: big ? 1200 : 2200, q: 4, gain: 0.5 });
    if (big) a.tone(o, { dur: 0.16, type: 'square', freq: 150, freqEnd: 95, gain: 0.09 });
  }

  // ---------------- las etapas ----------------
  setStage(s, quiet = false) {
    if (s === this.stage || STAGES.indexOf(s) < this.stageIdx) return;
    const g = this.g;
    this.stage = s;
    if (!g.net?.guest) g.net?.event('papq', { st: STAGES.indexOf(s) });
    if (STAGES.indexOf(s) >= STAGES.indexOf('crank')) for (const c of this.clamps) this.breakClamp(c.i, true);
    if (STAGES.indexOf(s) >= STAGES.indexOf('pools')) {
      this.prog = Math.max(this.prog, 1);
      this.timer = -1;
    }
    if (quiet) return;
    const say = (t, d = 4.5) => g.hud?.subtitle?.(t, d);
    if (s === 'ice') say('El calor del fogón llegó a la barbacana: el hielo de las cadenas del puente ya se puede romper.');
    else if (s === 'crank') say('¡Las cadenas quedaron libres! Girá el torno de la barbacana para bajar el puente.');
    else if (s === 'pools') say('¡El puente bajó! En las termas, destapá las tres pozas.');
    else if (s === 'heat') {
      say('¡El agua caliente llegó a la poza de la pava! Quedate en las termas hasta que se derrita el hielo.', 5);
      g.audio?.kettle?.(this.gaugePos(), 3);
    }
  }

  // ---------------- los tiros ----------------
  onShot(origin, dir, maxT) {
    for (const c of this.clamps) {
      if (c.broken) continue;
      if (rayHits(origin, dir, maxT, c.center, c.r)) this.hitClamp(c, 1);
    }
    for (const p of this.pools) {
      if (p.broken) continue;
      if (rayHits(origin, dir, maxT, p.center, 0.5)) this.hit(p, 1);
    }
  }

  onExplosion(pos, radius) {
    for (const c of this.clamps) if (!c.broken && pos.distanceTo(c.center) < radius * 0.8 + c.r) this.hitClamp(c, 3);
    for (const p of this.pools) if (!p.broken && pos.distanceTo(p.center) < radius * 0.8 + 0.5) this.hit(p, 3);
  }

  // (sin calor el tiro rebota; con calor se cuenta)
  hitClamp(c, n) {
    const g = this.g;
    if (this.stage === 'cold') {
      g.fx.sparkle?.(c.center, [0.8, 0.9, 1], 2, 0.3);
      g.audio?.iceShot?.(c.center);
      this.hint('El hielo de las cadenas es durísimo: sin calor no se rompe. Primero prendé el fogón del Gran Salón.');
      return;
    }
    if (this.stage !== 'ice') return;
    c.flash = 1;
    g.fx.sparkle?.(c.center, [0.7, 0.9, 1], 4, 0.4);
    g.audio?.iceShot?.(c.center);
    if (g.net?.guest) {
      g.net.net.send({ t: 'papq', clh: c.i, n });
      return;
    }
    this.damageClamp(c.i, n);
  }

  // (anfitrión)
  damageClamp(i, n) {
    const c = this.clamps[i];
    if (!c || c.broken || this.stage !== 'ice') return;
    c.hp = Math.max(0, c.hp - n);
    const g = this.g;
    if (c.hp > 0) {
      g.net?.event('papq', { chp: this.clamps.map((k) => k.hp) });
      return;
    }
    g.net?.event('papq', { cb: i });
    this.breakClamp(i);
    if (this.clamps.every((k) => k.broken)) this.setStage('crank');
  }

  breakClamp(i, quiet = false) {
    const c = this.clamps[i];
    if (!c || c.broken) return;
    c.broken = true;
    c.hp = 0;
    c.grp.visible = false;
    if (quiet) return;
    const g = this.g;
    g.audio?.shatter?.(c.center);
    g.audio?.chain?.(c.center);
    g.fx.sparkle?.(c.center, [0.75, 0.92, 1], 18, 0.7);
    g.fx.dust?.(c.center, UP, [0.85, 0.92, 1], 12);
  }

  hint(text) {
    const g = this.g;
    if (g.time - this.hintT < 6) return;
    this.hintT = g.time;
    g.hud?.subtitle?.(text, 3.5);
  }

  prompt() {
    const info = (text) => ({ text, noCost: true, info: true });
    if (this.stage === 'heat') return info(`El agua caliente derrite el hielo de la pava (${Math.round(this.heat * 100)}%). Quedate en las termas`);
    if (this.stage !== 'pools') return info('La poza del Pack-a-Pava se heló. El agua caliente viene de la montaña: primero hay que bajar el puente');
    const n = this.pools.filter((p) => p.broken).length;
    const t = this.timer > 0 && n ? ` · el frío las vuelve a tapar en ${Math.ceil(this.timer)} s` : '';
    return info(`La poza del Pack-a-Pava se heló. Hay que destapar las tres pozas de las termas (${n}/3)${t}`);
  }

  use() {
    return false;
  }

  hit(p, n) {
    const g = this.g;
    p.flash = 1;
    g.fx.sparkle?.(p.center, [0.7, 0.9, 1], 4, 0.4);
    g.audio?.iceShot?.(p.center);
    if (this.stage !== 'pools') return;
    if (g.net?.guest) {
      g.net.net.send({ t: 'papq', ice: p.i, n });
      return;
    }
    this.damage(p.i, n);
  }

  // (anfitrión) cuenta los golpes y rompe
  damage(i, n) {
    const p = this.pools[i];
    if (!p || p.broken || this.q.done || this.stage !== 'pools') return;
    p.hp = Math.max(0, p.hp - n);
    const g = this.g;
    if (p.hp > 0) {
      g.net?.event('papq', { ih: this.pools.map((q) => q.hp) });
      return;
    }
    if (this.timer < 0) this.timer = REFREEZE;
    g.net?.event('papq', { ib: i, it: +this.timer.toFixed(1) });
    this.breakPlug(i);
    if (this.pools.every((q) => q.broken)) {
      this.timer = -1;
      g.later(1.4, () => this.setStage('heat'));
    }
  }

  breakPlug(i, quiet = false) {
    const p = this.pools[i];
    if (!p || p.broken) return;
    const g = this.g;
    p.broken = true;
    p.hp = 0;
    p.plug.visible = false;
    const s = g.world.castleSteam?.[i];
    if (s) s.frozen = false;
    if (quiet) {
      p.sheet.visible = false;
      p.melt = 1;
      return;
    }
    p.melt = 0.001;
    p.gey = 2.4;
    g.audio?.shatter?.(p.center);
    g.audio?.kettle?.(p.center, 2.4);
    g.fx.steam?.(p.center, 20, 0.6);
  }

  // (el anfitrión lo decide y lo avisa) las rotas se vuelven a tapar
  refreeze(quiet = false) {
    const g = this.g;
    if (!g.net?.guest) g.net?.event('papq', { ir: 1 });
    this.timer = -1;
    for (const p of this.pools) {
      if (!p.broken) continue;
      p.broken = false;
      p.hp = HP;
      p.plug.visible = true;
      p.sheet.visible = true;
      p.sheet.material.opacity = 0.92;
      p.melt = 0;
      p.gey = 0;
      const s = g.world.castleSteam?.[p.i];
      if (s) s.frozen = true;
    }
    if (!quiet) g.hud.subtitle('El frío volvió a tapar las pozas. Rompé las tres seguidas.', 4);
  }

  // listo: todo lo que quedaba (el atajo de prueba también pasa por acá)
  complete(quiet = false) {
    const g = this.g;
    for (const c of this.clamps) this.breakClamp(c.i, true);
    this.prog = 1;
    this.lock = 1;
    if (this.door && !this.door.open && !g.net?.guest) g.interact.openDoor(this.door);
    for (const p of this.pools) if (!p.broken) this.breakPlug(p.i, true);
    this.timer = -1;
    this.heat = 1;
    this.stage = 'done';
    if (quiet) {
      this.ice.visible = false;
      this.iceMelt = 1;
    } else this.iceMelt = 0.001;
  }

  // ---------------- el calor del final ----------------
  buildGauge() {
    const pap = this.q.pap;
    if (!pap) return;
    const M = this.q.M;
    const gauge = new THREE.Group();
    gauge.position.set(1.55, 0, 0.35);
    // el poste de bronce con el tubo de vidrio y la columna colorada
    gauge.add(mesh(boxGeo(0.34, 0.12, 0.34), M.iron, 0, 0.06, 0));
    gauge.add(mesh(cylGeo(0.05, 0.05, 0.4, 8), M.brass || M.iron, 0, 0.3, 0));
    gauge.add(mesh(cylGeo(0.11, 0.11, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0xdfefff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }), 0, 1.25, 0));
    gauge.add(mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc0200e, emissive: 0xff2a0a, emissiveIntensity: 0.8, roughness: 0.3 }), 0, 0.52, 0));
    const colMat = new THREE.MeshStandardMaterial({ color: 0xd22a10, emissive: 0xff3a10, emissiveIntensity: 0.9, roughness: 0.3 });
    const col = mesh(cylGeo(0.06, 0.06, 1, 8).translate(0, 0.5, 0), colMat, 0, 0.6, 0);
    col.scale.y = 0.04;
    gauge.add(col);
    for (let k = 0; k <= 4; k++) gauge.add(mesh(boxGeo(0.16, 0.02, 0.02), M.brass || M.iron, 0.12, 0.62 + k * 0.32, 0.04));
    gauge.add(mesh(cylGeo(0.13, 0.13, 0.08, 12), M.brass || M.iron, 0, 2.02, 0));
    pap.group.add(gauge);
    this.gauge = gauge;
    this.col = col;
  }

  gaugePos() {
    if (!this.gauge) return this.pools[0]?.center || new THREE.Vector3();
    const v = this.gauge.getWorldPosition(new THREE.Vector3());
    v.y += 1.2;
    return v;
  }

  // ¿Hay alguien en las termas? (el anfitrión: él y los invitados)
  someoneIn() {
    const g = this.g;
    const inside = (p) => p && p.z >= TERMAS_Z && g.world.zoneAt(p.x, p.z, p.y) === 'M';
    if (g.player?.alive && !g.player.downed && inside(g.player.pos)) return true;
    for (const r of g.net?.remote?.values?.() || []) if (!r.dead && inside(r.pos)) return true;
    return false;
  }

  // los muertos salen de la nieve alrededor de las pozas
  riser() {
    const g = this.g;
    const Z = g.zombies;
    if (!Z || this.spawned >= 16 || Z.pool.filter((z) => z.active && !z.dead).length >= 24) return;
    const p = this.pools[Math.floor(Math.random() * this.pools.length)];
    if (!p) return;
    for (let t = 0; t < 6; t++) {
      const a = Math.random() * Math.PI * 2;
      const d = p.r + 1.4 + Math.random() * 1.8;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const y = g.world.floorAt(x, z, p.y);
      if (Math.abs(y - p.y) > 0.6 || g.nav?.blocked?.(Math.floor(x), Math.floor(z), y)) continue;
      if (Z.spawn(g.rounds?.round || 5, g.rounds?.health || 400, new THREE.Vector3(x, y, z))) this.spawned++;
      return;
    }
  }

  // ---------------- cada cuadro ----------------
  update(dt) {
    const g = this.g;
    const host = !g.net?.guest;
    // la luz calienta la barbacana
    if (host && this.stage === 'cold' && g.world.power) this.setStage('ice');
    // las grampas: brillan (y titilan) cuando se pueden romper
    const t = g.time || 0;
    for (const c of this.clamps) {
      if (c.broken) continue;
      c.flash = Math.max(0, c.flash - dt * 5);
      const glow = this.stage === 'ice' ? 0.7 + 0.35 * Math.sin(t * 3 + c.i * 2) : 0.12;
      c.mat.emissiveIntensity = glow + c.flash * 1.5;
      if (this.stage === 'ice' && Math.random() < dt * 1.5) g.fx.sparkle?.(c.center, [0.6, 0.85, 1], 1, c.r * 0.6);
    }
    // el torno: se resbala si nadie gira (lo decide el anfitrión)
    if (this.stage === 'crank' && host && this.prog > this.lock && t - this.lastCrank > CRANK_IDLE) {
      this.prog = Math.max(this.lock, this.prog - SLIP * dt);
      this.slipNetT -= dt;
      if (this.slipNetT <= 0) {
        this.slipNetT = 0.3;
        g.net?.event('papq', { w: +this.prog.toFixed(3) });
      }
    }
    const before = this.shown;
    this.shown += (this.prog - this.shown) * Math.min(1, dt * 6);
    this.wheel.rotation.z = -this.shown * 40;
    this.drum.rotation.z = -this.shown * 40;
    this.gear.rotation.z = -this.shown * 40;
    if (this.stage === 'crank' && Math.floor(before * 40) !== Math.floor(this.shown * 40)) this.ratchet(false);
    // mientras se gira, el puente se va inclinando (la caída la hace la puerta)
    if (this.bridge && this.door && !this.door.open && this.stage === 'crank') this.bridge.pose(this.shown * TILT);
    this.updatePools(dt);
    this.updateHeat(dt, host);
    if (this.iceMelt > 0 && this.iceMelt < 1) {
      this.iceMelt = Math.min(1, this.iceMelt + dt / 2.2);
      for (const m of this.ice.children) m.material.opacity = (m.material.map ? 0.92 : 0.5) * (1 - this.iceMelt);
      if (this.iceMelt >= 1) this.ice.visible = false;
    }
  }

  updatePools(dt) {
    const g = this.g;
    for (const p of this.pools) {
      if (!p.broken) {
        p.flash = Math.max(0, p.flash - dt * 5);
        const s = 0.55 + 0.45 * (p.hp / HP);
        p.plug.scale.setScalar(s * (1 + p.flash * 0.2));
        // un brillito, para que se encuentren (cuando ya se puede)
        if (this.stage === 'pools' && Math.random() < dt * 1.2) g.fx.sparkle?.(p.center, [0.6, 0.85, 1], 1, 0.3);
      }
      if (p.melt > 0 && p.melt < 1) {
        p.melt = Math.min(1, p.melt + dt / 1.8);
        p.sheet.material.opacity = 0.92 * (1 - p.melt);
        if (p.melt >= 1) p.sheet.visible = false;
      }
      if (p.gey > 0) {
        // el géiser: una columna de vapor y agua caliente
        p.gey -= dt;
        for (let k = 0; k < 3; k++) {
          g.fx.alpha?.spawn(p.x + (Math.random() - 0.5) * 0.35, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.8, 6 + Math.random() * 4, (Math.random() - 0.5) * 0.8, {
            color: [0.9, 0.94, 0.98],
            size: 0.35,
            size1: 2.2,
            life: 1.4 + Math.random() * 0.6,
            alpha: 0.32,
            drag: 0.8,
          });
        }
      }
    }
    // el frío vuelve (lo decide el anfitrión)
    if (this.timer > 0 && !this.q.done && this.stage === 'pools') {
      this.timer -= dt;
      if (this.timer <= 0 && !g.net?.guest) this.refreeze();
    }
  }

  updateHeat(dt, host) {
    const g = this.g;
    if (this.stage === 'heat' && host) {
      if (this.someoneIn()) {
        this.heat = Math.min(1, this.heat + dt / HEAT_T);
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.spawnT = 2.2 + Math.random() * 1.2;
          this.riser();
        }
      }
      this.heatNetT -= dt;
      if (this.heatNetT <= 0) {
        this.heatNetT = 0.3;
        g.net?.event('papq', { ht: +this.heat.toFixed(3) });
      }
      if (this.heat >= 1) this.q.finish();
    }
    const was = this.heatShown;
    this.heatShown += (this.heat - this.heatShown) * Math.min(1, dt * 3);
    const h = this.heatShown;
    if (this.col) this.col.scale.y = 0.04 + 1.36 * h;
    // la mitad: un aviso
    if (this.stage === 'heat' && was < 0.5 && h >= 0.5) g.hud?.toast?.('El hielo de la pava ya está por la mitad');
    // el bloque se va achicando y echa vapor
    if (this.stage === 'heat' && this.ice.visible) {
      this.block.scale.set(1 - h * 0.12, 1 - h * 0.3, 1 - h * 0.12);
      this.block.position.y = 2.08 - h * 0.26;
      const cam = g.camera?.position;
      if (cam && Math.random() < dt * (3 + h * 14) && this.q.pap && Math.abs(cam.x - this.q.pap.group.position.x) + Math.abs(cam.z - this.q.pap.group.position.z) < 60) {
        const c = this.block.getWorldPosition(tmpV);
        g.fx.alpha?.spawn(c.x + (Math.random() - 0.5) * 1.6, c.y + 0.6, c.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, { color: [0.9, 0.94, 0.98], size: 0.4, size1: 2, life: 2 + Math.random(), alpha: 0.18 + h * 0.12, drag: 0.4 });
      }
    }
  }

  // ---------------- red ----------------
  state() {
    return { st: this.stageIdx, chp: this.clamps.map((c) => c.hp), w: +this.prog.toFixed(3), ht: +this.heat.toFixed(3), ibs: this.pools.map((p) => (p.broken ? 1 : 0)), ih: this.pools.map((p) => p.hp), it: +this.timer.toFixed(1) };
  }

  apply(m, quiet = false) {
    if (m.st != null && STAGES[m.st]) this.setStage(STAGES[m.st], quiet);
    if (m.chp) m.chp.forEach((h, i) => (h <= 0 ? this.breakClamp(i, true) : this.clamps[i] && (this.clamps[i].hp = h)));
    if (m.cb != null) this.breakClamp(m.cb | 0, quiet);
    if (m.w != null) this.prog = +m.w || 0;
    if (m.ht != null) this.heat = +m.ht || 0;
    if (m.ibs) m.ibs.forEach((b, i) => b && this.breakPlug(i, true));
    if (m.ih) m.ih.forEach((h, i) => this.pools[i] && !this.pools[i].broken && (this.pools[i].hp = h));
    if (m.ib != null) this.breakPlug(m.ib | 0, quiet);
    if (m.it != null) this.timer = m.it;
    if (m.ir) this.refreeze(quiet);
  }

  onGuest(m) {
    const n = Math.max(1, Math.min(3, m.n | 0));
    if (m.clh != null) this.damageClamp(m.clh | 0, n);
    if (m.ice != null) this.damage(m.ice | 0, n);
  }
}

// ¿El tiro (origen, dirección, alcance) pasa a menos de r del centro?
function rayHits(origin, dir, maxT, center, r) {
  const t = tmpV.subVectors(center, origin).dot(dir);
  if (t < 0 || t > maxT + r) return false;
  return tmpV2.copy(origin).addScaledVector(dir, t).distanceTo(center) < r;
}

// Los eslabones de una cadena recta de a hasta b (matrices para una malla de instancias).
function chainLine(out, a, b) {
  tmpD.subVectors(b, a);
  const len = tmpD.length();
  tmpD.divideScalar(len || 1);
  const n = Math.max(1, Math.round(len / LINK));
  tmpQ.setFromUnitVectors(UP, tmpD);
  for (let i = 0; i < n; i++) {
    tmpQ2.setFromAxisAngle(tmpD, (i % 2) * (Math.PI / 2)).multiply(tmpQ);
    out.push(new THREE.Matrix4().compose(tmpV.copy(a).addScaledVector(tmpD, (len * (i + 0.5)) / n), tmpQ2, ONE));
  }
}
