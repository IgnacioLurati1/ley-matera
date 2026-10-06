import * as THREE from 'three';
import { cineClip, poseCineClip, headProp } from '../net/gauchoSkin';
import { crewIds, personaOf } from './cineCrew';
import { buildShades } from './MolinoCinematic';
import { assetUrl } from '../../lib/assets';

// Cómo queda tirado tu gaucho cuando morís (Game.startEnd: el alma sube mirando
// el cuerpo), según su carácter en la cuadrilla (ui/cineCrew.js), animado en
// Blender (C:/Users/ignac/Tools/mdu-blender muerte_clips.py -> cine-muerte.json):
// el Valiente de espaldas con los brazos abiertos (cayó peleando), el Miedoso
// boca abajo con las manos al lado de la cabeza, el Canchero de espaldas
// tomando sol (las manos en la nuca, los codos abiertos, la cara arriba con los
// anteojos de sol puestos), el Viejo durmiendo la siesta (de espaldas, las
// manos juntas en el pecho y el sombrero tapándole la cara). La escena se ve
// desde arriba (el alma sube): con la cara arriba el ala queda de canto.
// globalThis.__mduBlend = false: el de siempre (el clip 'dead' de net/gauchoSkin).

const CLIP = { valiente: 'deadBrave', miedoso: 'deadProne', canchero: 'deadCool', viejo: 'deadSiesta' };
// (los pies hacia donde arranca el alma: la cámara empieza de ese lado, baja, y
// mira la cara por encima del cuerpo; desde la cabeza se veía la copa del sombrero)
const FEET_FIRST = { canchero: true, viejo: true };
const GLASS = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.25, roughness: 0.35 });
// el corte a negro entre la caída y el alma que sube (Game.updateEnd)
const FALL = 1.55;

let CLIPS = null;
let loading = null;
function prefetch() {
  loading ||= fetch(assetUrl('/assets/sotano/modelos/gaucho/cine-muerte.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((J) => {
      const C = {};
      for (const [k, c] of Object.entries(J.clips)) C[k] = cineClip(c);
      CLIPS = C;
    })
    .catch(() => {
      loading = null;
    });
}
// (son poses quietas, 20 KB: se bajan con el juego, así ya están al morir)
if (typeof fetch === 'function') setTimeout(() => globalThis.__mduBlend !== false && prefetch(), 4000);

// avatars/id/r: el cuerpo (Game.endBody). Devuelve lo que se llama cada cuadro
// después de avatars.update, o null.
export function deathPose(g, avatars, id, r) {
  if (globalThis.__mduBlend === false) return null;
  prefetch();
  const ids = crewIds(g);
  // (globalThis.__mduDeathPersona: para probar los cuatro sin jugar en línea)
  const persona = globalThis.__mduDeathPersona || personaOf(Math.max(0, ids.indexOf(g.net ? g.net.id : 0)));
  // (si todavía no bajaron, queda el de siempre: nunca cambia de pose a la vista)
  if (!CLIPS) return null;
  let t = 0;
  let shades = null;
  return (dt) => {
    t += dt;
    const a = avatars.list.get(id);
    const c = CLIPS[CLIP[persona]];
    if (!a?.gs?.on || !c) return;
    // (la caída es en primera persona, con la vista en el lugar del cuerpo: el
    // cuerpo ya tirado aparece recién con el corte a negro, Game.updateEnd)
    a.group.visible = t >= FALL;
    if (a.gun) a.gun.visible = false;
    a.hand.visible = false;
    if (!poseCineClip(a, c, t, r.pos.x, r.pos.y, r.pos.z, r.yaw + (FEET_FIRST[persona] ? 0 : Math.PI), { loop: true })) return;
    // (los anteojos solo en el penal y la torre: el usuario, 2026-10-04)
    if (persona === 'canchero' && !shades && (g.mapId === 'penal' || g.mapId === 'torre' || globalThis.__mduShadesAll)) {
      shades = headProp(a, buildShades());
      // (los vidrios sin espejo: con el cielo del penal uno se veía blanco, un monóculo)
      shades?.traverse((o) => {
        if (o.isMesh && o.material.metalness === 0.7) o.material = GLASS;
      });
    }
    // el Viejo, dormido: los ojos cerrados y la boca entreabierta (los
    // párpados y la mandíbula de la malla, ui/cineLife)
    if (persona === 'viejo') {
      if (a.gs.lidU) a.gs.lidU.value = 1;
      if (a.gs.jawU) a.gs.jawU.value = 0.06;
    }
  };
}
