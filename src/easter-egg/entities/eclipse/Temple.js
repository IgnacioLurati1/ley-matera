import * as THREE from 'three';
import { LIGHTS, ZONES } from '../../config/maps/eclipse';
import { QStep, Marker, HoldZone, glowOrb, players, playerAt, dist2, myId } from './common';
import { ART, buildBrasero, buildStuck, buildSpiritFlame } from './stepArt';
import { unlock as unlockLogro } from '../../core/logros';

// "El Temple de los Cuatro Filos": la mejora del Desgarrador (obligatoria para
// el easter egg). Seis etapas, en orden, sobre las cuatro naturalezas:
//  1. El despertar: matar con la guadaña (N por jugador).
//  2. Fuego (castillo): encender el brasero y, antes de que se apague, matar
//     con la embestida una racha de muertos.
//  3. Viento (de la torre al claro): llevar la llama del desgarro desde la
//     cima hasta el algarrobo sin cortar; si te pegan, vuelve a la cima.
//  4. Rayo (penal): en el patio caen rayos sobre marcas; rematar el combo en
//     la marca justo cuando cae, cinco seguidas.
//  5. Hielo (molino): clavar la guadaña en la muela y aguantar el encierro en
//     el galpón sin ella.
//  6. El temple (El Desgarro, con el eclipse total): clavarla en el nudo y
//     defender la forja. Nace el Desgarrador del Eclipse (la Furia Cósmica).
// Después, los demás mejoran la suya en el nudo pagando.
// Lo decide el anfitrión; viaja por 'pee' (k 'eq', s 'temple').

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KILLS_EACH = 40;
// (qa-flujo, v5: a 32,5 caía sobre la escalera del gran salón, enterrado y sin
// modelo; ahora en el piso del patio, a la derecha de la escalera)
const BRASERO = V(161.5, 56, 35.5);
const FUEGO_SECS = 70;
const FUEGO_N = 12;
const LLAMA_FROM = V(275.5, 52, 76.5);
const ALGARROBO = V(162.5, 33, 150.5);
// (el tronco ocupa 3 x 3 m: se llega tocándolo de cualquier lado)
const ALGARROBO_R = 3.2;
// (qa-flujo, v5: las dos de abajo estaban en 321,5, afuera de las rejas del
// patio, y las de arriba a 1 m de la boca del portal 3: yendo de una a la otra
// el portal te mandaba al claro. Ahora todas a más de 2,9 m de las tres bocas
// del patio: 3 (166,5; 312,5), 5 (162,5; 317,5) y 6 (172,5; 316,5))
const MARCAS = [V(163, 4, 310), V(170, 4, 310), V(166.5, 4, 316.8), V(165.5, 4, 319.2), V(169, 4, 319)];
// el rayo arranca con alguien en el patio de recreo (no en todo el penal)
const RAYO_ZONE = 'pH';
const RAYO_WAIT = 2.6;
// (0,45 era imposible: el bot de qa-flujo llegó a 4 de 5; 0,6 hasta que el usuario diga)
const RAYO_WIN = 0.6;
const MUELA = V(29.5, 38, 95.5);
const HIELO_SECS = 75;
// (el nudo: la luz 'nudo' de La Disformidad, en el medio de la zona U; layout v5)
const _LN = LIGHTS.find((l) => l.tag === 'nudo');
const NUDO = _LN ? V(_LN.pos[0], ZONES.U.y, _LN.pos[2]) : V(152.5, 68, 104.5);
const TEMPLE_SECS = 80;
const UPGRADE_COST = 5000;
const NAMES = ['', 'El despertar', 'El filo del que ataca primero', 'El filo del que tiene miedo', 'El filo del que espera', 'El filo del que aguanta', 'El temple'];

export default class Temple extends QStep {
  constructor(ee) {
    super(ee, 'temple');
    const g = this.g;
    // stage: 1..6 en curso; done cuando el 6 terminó. Cada etapa su campo.
    this.st = { on: 0, done: 0, stage: 0, kills: 0, fuego: 0, fkills: 0, carrier: -1, rayo: 0, hielo: 0, hielen: -1, forja: 0 };
    this.mB = new Marker(g, BRASERO, 0xff7030, 0.7);
    this.mL = new Marker(g, LLAMA_FROM, 0xa0ffd0, 0.6);
    // (el anillo alrededor del tronco, no adentro)
    this.mAl = new Marker(g, ALGARROBO, 0xa0ffd0, 2.3);
    this.mR = MARCAS.map((p) => new Marker(g, p, 0xffe060, 0.75));
    // (la pileta de la muela mide 4 m: el anillo alrededor, no abajo de la piedra)
    this.mM = new Marker(g, MUELA, 0x80c0ff, 2.7);
    this.mN = new Marker(g, NUDO, 0xd080ff, 1.1);
    this.marks.push(this.mB, this.mL, this.mAl, ...this.mR, this.mM, this.mN);
    this.hF = new HoldZone(g, BRASERO, 1e9, FUEGO_SECS);
    this.hH = new HoldZone(g, MUELA, 14, HIELO_SECS);
    this.hT = new HoldZone(g, NUDO, 9, TEMPLE_SECS);
    // (stepArt) la llama del desgarro: fría, verde agua, con su estela; y la
    // misma esperando arriba de la marca de la cima hasta que alguien la toma
    this.flame = ART ? buildSpiritFlame(g) : glowOrb(0xa0ffd0, 0.14);
    this.flame.visible = false;
    g.scene.add(this.flame);
    if (ART) {
      this.flameSrc = buildSpiritFlame(g);
      this.flameSrc.position.copy(LLAMA_FROM).add(V(0, 1.3, 0));
      this.flameSrc.visible = false;
      g.scene.add(this.flameSrc);
    }
    // (stepArt) la guadaña clavada de punta en la muela, con la escarcha
    this.stuck = ART ? buildStuck(g) : glowOrb(0x80c0ff, 0.12);
    this.stuck.visible = false;
    this.stuck.position.copy(MUELA).add(V(0, ART ? 0 : 1.2, 0));
    g.scene.add(this.stuck);
    // (qa-flujo) el brasero de la fragua: el patio de armas no trae uno propio
    // (sin w.eclipseArt.braseroFire). Pie, taza de fierro y brasas que se
    // prenden con el fuego de la etapa 2 (sin luz nueva: fx.fire, como la Llama)
    if (!g.world.eclipseArt?.braseroFire && ART) {
      // (stepArt) trípode de patas curvas, taza remachada y brasas de verdad
      const B = buildBrasero(g);
      this.coalM = B.coalM;
      B.root.position.copy(BRASERO);
      g.scene.add(B.root);
      this.braseroObj = B.root;
      this.braseroFireT = 0;
    } else if (!g.world.eclipseArt?.braseroFire) {
      const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6, metalness: 0.7 });
      this.coalM = new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.9, emissive: 0xff5a18, emissiveIntensity: 0 });
      const grp = new THREE.Group();
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 14), iron);
      foot.position.y = 0.04;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.78, 8), iron);
      leg.position.y = 0.47;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.24, 0.3, 16, 1, true), iron);
      bowl.material.side = THREE.DoubleSide;
      bowl.position.y = 0.98;
      const coals = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16).rotateX(-Math.PI / 2), this.coalM);
      coals.position.y = 1.06;
      grp.add(foot, leg, bowl, coals);
      grp.position.copy(BRASERO);
      g.scene.add(grp);
      this.braseroObj = grp;
      this.braseroFireT = 0;
    }
    this.rayoT = 0;
    this.rayoI = -1;
    this.hp0 = null;
    this.kSent = 0;
    const has = () => !!g.weapons.cosmic?.held?.();
    const holding = () => g.weapons.slot?.id === 'desgarrador';
    this.its = [
      g.interact.add({
        kind: 'eclipse-brasero',
        pos: BRASERO.clone().add(V(0, 1, 0)),
        radius: 2.2,
        prompt: () => (this.st.stage === 2 && !this.st.fuego ? (has() ? { text: 'encender el brasero', noCost: true, hold: true } : { text: 'Necesita el Desgarrador', noCost: true, info: true }) : null),
        cost: () => 0,
        holdTime: 2,
        use: () => (this.st.stage === 2 && !this.st.fuego && has() ? (this.send({ a: 'fuego' }), true) : false),
      }),
      g.interact.add({
        kind: 'eclipse-llama',
        pos: LLAMA_FROM.clone().add(V(0, 1, 0)),
        radius: 2,
        prompt: () => (this.st.stage === 3 && this.st.carrier < 0 ? (has() ? { text: 'tomar la llama del desgarro', noCost: true } : { text: 'Necesita el Desgarrador', noCost: true, info: true }) : null),
        cost: () => 0,
        use: () => (this.st.stage === 3 && this.st.carrier < 0 && has() ? (this.send({ a: 'llama', id: myId(g) }), true) : false),
      }),
      g.interact.add({
        kind: 'eclipse-muela',
        pos: MUELA.clone().add(V(0, 1, 0)),
        // (qa-flujo: con 2,2 no se llegaba; la pileta tiene caja de 4,2 x 4 m)
        radius: 3.3,
        prompt: () => {
          if (this.st.stage !== 5) return null;
          if (!this.st.hielo) return holding() ? { text: 'clavar la guadaña en la muela', noCost: true, hold: true } : { text: 'Necesita el Desgarrador en la mano', noCost: true, info: true };
          if (this.st.hielo === 2 && this.st.hielen === myId(g)) return { text: 'sacar la guadaña', noCost: true };
          return null;
        },
        cost: () => 0,
        holdTime: 2,
        use: () => {
          if (this.st.stage !== 5) return false;
          if (!this.st.hielo && holding()) {
            this.send({ a: 'clavar', id: myId(g) });
            return true;
          }
          if (this.st.hielo === 2 && this.st.hielen === myId(g)) {
            this.send({ a: 'sacar', id: myId(g) });
            return true;
          }
          return false;
        },
      }),
      g.interact.add({
        kind: 'eclipse-nudo',
        pos: NUDO.clone().add(V(0, 1, 0)),
        radius: 2.4,
        prompt: () => {
          if (this.st.stage === 6 && !this.st.forja) {
            if (!this.ee.totality) return { text: 'Necesita el eclipse total', noCost: true, info: true };
            return holding() ? { text: 'clavar la guadaña en el nudo', noCost: true, hold: true } : { text: 'Necesita el Desgarrador en la mano', noCost: true, info: true };
          }
          if (this.st.done && has() && !g.weapons.cosmic?.up && !this.upMine) return { text: 'templar el Desgarrador', hold: true };
          return null;
        },
        cost: () => (this.st.done ? UPGRADE_COST : 0),
        holdTime: 2.5,
        use: () => {
          if (this.st.stage === 6 && !this.st.forja && this.ee.totality && holding()) {
            this.send({ a: 'forja', id: myId(g) });
            return true;
          }
          if (this.st.done && has() && !this.upMine) {
            this.upMine = !!g.weapons.cosmic?.upgrade();
            return this.upMine;
          }
          return false;
        },
      }),
    ];
  }

  get stage() {
    return this.st.stage;
  }

  // el easter egg lo arranca cuando se armó la guadaña
  start() {
    if (this.host && !this.st.stage) this.send({ a: 'stage', n: 1 });
  }

  // ---------------- lo que escucha de la guadaña (cada compu, lo suyo) ----------------
  onScythe(ev) {
    const g = this.g;
    const s = this.st.stage;
    if (ev.type === 'kill') {
      if (s === 1) this.send({ a: 'k' });
      else if (s === 2 && this.st.fuego === 1 && ev.how === 'embestida') this.send({ a: 'fk' });
    } else if (ev.type === 'cut') {
      if (s === 3 && this.st.carrier === myId(g)) this.send({ a: 'drop', why: 'corte' });
      else if (s === 4 && ev.how === 'remate' && this.rayoI >= 0) {
        const m = MARCAS[this.rayoI];
        const near = dist2(ev.o, m) < 2.6;
        const onTime = Math.abs(this.rayoT - RAYO_WAIT) < RAYO_WIN;
        this.send({ a: 'rayo', ok: near && onTime ? 1 : 0 });
      }
    }
  }

  apply(m) {
    const g = this.g;
    const S = this.st;
    switch (m.a) {
      case 'stage':
        S.stage = m.n;
        S.on = 1;
        if (m.n <= 6) {
          g.hud.toast(`Temple: ${NAMES[m.n]}`);
          g.hud.subtitle(this.hint(m.n), 5);
        }
        this.refresh();
        break;
      case 'k':
        S.kills++;
        if (this.host && S.kills >= KILLS_EACH * players(g).length) this.send({ a: 'stage', n: 2 });
        break;
      case 'fuego':
        S.fuego = 1;
        S.fkills = 0;
        this.hF.k = 0;
        this.mB.pulse();
        if (g.world.eclipseArt?.braseroFire) g.world.eclipseArt.braseroFire.visible = true;
        g.hud.subtitle(`El brasero arde ${FUEGO_SECS} s. ${FUEGO_N} muertos con la embestida (V).`, 4.5);
        this.ee.horde?.(FUEGO_SECS);
        break;
      case 'fk':
        S.fkills++;
        this.mB.pulse();
        if (this.host && S.fkills >= FUEGO_N) {
          if (g.world.eclipseArt?.braseroFire) g.world.eclipseArt.braseroFire.visible = false;
          this.send({ a: 'stage', n: 3 });
        }
        break;
      case 'apaga':
        S.fuego = 0;
        if (g.world.eclipseArt?.braseroFire) g.world.eclipseArt.braseroFire.visible = false;
        g.hud.subtitle('El brasero se apagó. Otra vez.', 3);
        break;
      case 'llama':
        S.carrier = m.id;
        this.mL.set(false);
        this.mAl.set(true);
        if (m.id === myId(g)) {
          this.hp0 = g.player.health;
          g.hud.subtitle('Llevala al algarrobo del claro. Sin cortar, sin que te peguen.', 4.5);
        }
        break;
      case 'drop':
        S.carrier = -1;
        this.mL.set(true);
        this.mAl.set(false);
        this.flame.visible = false;
        g.hud.subtitle(m.why === 'corte' ? 'Cortaste: la llama vuelve a la cima.' : 'Te pegaron: la llama vuelve a la cima.', 3.5);
        break;
      case 'rayo':
        m.had = S.rayo > 0;
        S.rayo = m.ok ? S.rayo + 1 : 0;
        if (m.ok) {
          g.fx.sparkle(MARCAS[this.rayoI >= 0 ? this.rayoI : 0].clone().add(V(0, 1, 0)), [1, 0.95, 0.5], 16, 0.8);
          g.hud.subtitle(`${S.rayo} de 5.`, 1.5);
        } else if (!m.miss) g.hud.subtitle('A destiempo. De nuevo.', 2);
        else if (S.rayo === 0 && m.had) g.hud.subtitle('Se pasó el rayo. De nuevo.', 2);
        this.rayoI = -1;
        this.rayoT = 0;
        if (this.host && S.rayo >= 5) this.send({ a: 'stage', n: 5 });
        break;
      case 'clavar':
        S.hielo = 1;
        S.hielen = m.id;
        this.hH.k = 0;
        this.stuck.visible = true;
        if (m.id === myId(g)) {
          // (la guadaña queda clavada: se la saca de las manos y vuelve igual, mejorada o no)
          this.stuckUp = g.weapons.slots.find((x) => x.id === 'desgarrador')?.up || 0;
          g.weapons.drop('desgarrador');
          g.hud.subtitle(`Sin la guadaña, ${HIELO_SECS} s adentro del galpón.`, 4);
        }
        this.ee.horde?.(HIELO_SECS);
        break;
      case 'suelta':
        S.hielo = 0;
        this.stuck.visible = false;
        if (S.hielen === myId(g)) {
          g.weapons.cosmic?.give(this.stuckUp || 0);
          g.hud.subtitle('Saliste del galpón: la guadaña vuelve. Otra vez.', 3.5);
        }
        S.hielen = -1;
        break;
      case 'aguantado':
        S.hielo = 2;
        g.hud.subtitle('Aguantaste. Sacá la guadaña de la muela.', 3.5);
        break;
      case 'sacar':
        this.stuck.visible = false;
        if (S.hielen === myId(g)) g.weapons.cosmic?.give(this.stuckUp || 0);
        S.hielo = 3;
        if (this.host) this.send({ a: 'stage', n: 6 });
        break;
      case 'forja':
        S.forja = 1;
        S.hielen = m.id;
        this.hT.k = 0;
        this.mN.pulse();
        g.hud.subtitle(`La forja: defendé el nudo ${TEMPLE_SECS} s.`, 4);
        this.ee.horde?.(TEMPLE_SECS);
        g.world.eclipse?.pulse?.();
        break;
      case 'templado':
        S.forja = 2;
        S.done = 1;
        S.stage = 7;
        this.mN.set(false);
        g.world.eclipse?.pulse?.();
        g.fx.addShake?.(0.4);
        g.fx.sparkle(NUDO.clone().add(V(0, 1.5, 0)), [0.8, 0.4, 1], 40, 1.4);
        if (S.hielen === myId(g)) {
          this.upMine = !!g.weapons.cosmic?.upgrade();
          g.hud.toast('Desgarrador del Eclipse');
          // el logro (core/logros.js 'temple'), si no se hizo trampa
          if (!g.cheated) g.logros?.got?.(unlockLogro('temple'));
        }
        g.hud.subtitle('Nace el Desgarrador del Eclipse. La Furia Cósmica (H) abre lo que nada abre.', 5);
        this.ee.got('temple', m.id);
        break;
      default:
        break;
    }
  }

  hint(n) {
    return [
      '',
      `Matá ${KILLS_EACH} muertos por jugador con el Desgarrador.`,
      'Castillo, patio de armas: encendé el brasero.',
      'Cima de la Torre: llevá la llama del desgarro al algarrobo del claro.',
      'Penal, patio de recreo: rematá el combo donde cae el rayo.',
      'Molino, galpón: clavá la guadaña en la muela.',
      this.ee.totality ? 'El Nudo: clavá la guadaña al pie del cristal grande.' : 'Falta el eclipse total: el cañón de la cima de la Torre.',
    ][n];
  }

  refresh() {
    const S = this.st;
    this.mB.set(S.stage === 2);
    this.mL.set(S.stage === 3 && S.carrier < 0);
    this.mAl.set(S.stage === 3 && S.carrier >= 0);
    for (const m of this.mR) m.set(false);
    this.mM.set(S.stage === 5 && S.hielo !== 1);
    this.mN.set(S.stage === 6 && !S.done);
    this.stuck.visible = S.stage === 5 && S.hielo === 1;
  }

  update(dt, t) {
    super.update(dt, t);
    const g = this.g;
    const S = this.st;
    const me = myId(g);
    // 2. el brasero se apaga
    if (S.stage === 2 && S.fuego === 1) {
      if (this.hF.update(dt) && this.host) this.send({ a: 'apaga' });
      // (el fuego del brasero propio, mientras arde)
      if (this.braseroObj && (this.braseroFireT -= dt) <= 0) {
        this.braseroFireT = 0.12;
        g.fx.fire?.(BRASERO.clone().add(V(0, ART ? 1.15 : 1.1, 0)), 0.45, 1);
      }
    }
    if (ART) {
      if (this.flame.visible) this.flame.userData.tick?.(dt, t);
      if (this.stuck.visible) this.stuck.userData.tick?.(dt, t);
      this.flameSrc.visible = S.stage === 3 && S.carrier < 0;
      if (this.flameSrc.visible) this.flameSrc.userData.tick?.(dt, t);
    }
    if (this.coalM) this.coalM.emissiveIntensity = S.stage === 2 && S.fuego === 1 ? 1.4 + 0.4 * Math.sin(t * 7) : 0;
    // 3. la llama en la mano del que la lleva
    if (S.stage === 3 && S.carrier >= 0) {
      const p = playerAt(g, S.carrier);
      if (p) {
        this.flame.visible = true;
        this.flame.position.set(p.x, p.y + 1.9, p.z);
      }
      if (S.carrier === me) {
        if (g.player.health < (this.hp0 ?? 0) - 0.5 || g.player.downed) this.send({ a: 'drop', why: 'golpe' });
        else this.hp0 = g.player.health;
      }
      if (this.host && p && dist2(p, ALGARROBO) < ALGARROBO_R && Math.abs(p.y - ALGARROBO.y) < 3) {
        this.flame.visible = false;
        this.send({ a: 'stage', n: 4 });
      }
    }
    // 4. los rayos (cada compu el mismo reloj; el anfitrión elige la marca)
    if (S.stage === 4) {
      if (this.rayoI < 0) {
        if (this.host && players(g).some((p) => !p.downed && g.world.zoneAt(p.pos.x, p.pos.z, p.pos.y) === RAYO_ZONE)) {
          this.rayoI = Math.floor(Math.random() * MARCAS.length);
          this.rayoT = 0;
          g.net?.event('pee', { k: 'eq', s: 'temple', a: 'marca', i: this.rayoI });
          this.mR[this.rayoI].set(true);
        }
      } else {
        this.rayoT += dt;
        if (this.rayoT > RAYO_WAIT - 0.05 && this.rayoT - dt <= RAYO_WAIT - 0.05) {
          const m = MARCAS[this.rayoI];
          g.fx.flash?.(m.clone().add(V(0, 2, 0)), [1, 1, 0.7], 8, 0.25, 25);
          g.audio?.thunder?.(m, false);
          this.mR[this.rayoI].pulse();
        }
        if (this.rayoT > RAYO_WAIT + RAYO_WIN + 0.3) {
          this.mR[this.rayoI].set(false);
          this.rayoI = -1;
          // (nadie tajeó: se pierde la racha, sin el "a destiempo" si no había)
          if (this.host) this.send({ a: 'rayo', ok: 0, miss: 1 });
        }
      }
    }
    // 5. el encierro del galpón
    if (S.stage === 5 && S.hielo === 1) {
      const hit = this.hH.update(dt);
      const p = playerAt(g, S.hielen);
      if (this.host && p && (dist2(p, MUELA) > 14 || Math.abs(p.y - MUELA.y) > 3)) this.send({ a: 'suelta' });
      else if (this.host && hit) this.send({ a: 'aguantado' });
      if (S.hielen === me && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) g.hud.setHint?.(`Aguantá: ${Math.ceil((1 - this.hH.k) * HIELO_SECS)} s`);
    }
    // 6. la forja
    if (S.stage === 6 && S.forja === 1) {
      const hit = this.hT.update(dt);
      if (this.hT.inside && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) g.hud.setHint?.(`La forja: ${Math.ceil((1 - this.hT.k) * TEMPLE_SECS)} s`);
      if (Math.floor(t / 6) !== Math.floor((t - dt) / 6)) g.world.eclipse?.pulse?.();
      if (this.host && hit) this.send({ a: 'templado', id: S.hielen });
    }
  }

  // (la marca del rayo que eligió el anfitrión)
  onGuest(m) {
    this.apply(m);
  }

  applyRemoteExtra(m) {
    if (m.a === 'marca') {
      this.rayoI = m.i;
      this.rayoT = 0;
      this.mR[m.i].set(true);
      return true;
    }
    return false;
  }

  dispose() {
    super.dispose();
    this.flame.removeFromParent();
    this.flameSrc?.removeFromParent();
    this.stuck.removeFromParent();
    this.braseroObj?.removeFromParent();
  }
}
