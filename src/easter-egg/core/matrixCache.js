import * as THREE from 'three';

// three recompone en cada cuadro la matriz de cada objeto (posición, giro y
// escala → matriz, y después la del mundo) aunque no se haya movido: en el
// penal son ~3200 objetos y en un rato se mueven ~60. Acá solo se recompone
// lo que cambió (la posición, el giro, la escala, el padre o la matriz tocada
// a mano);
// lo demás conserva su matriz y, si el padre tampoco cambió, la del mundo.
// Mismo resultado que el updateMatrixWorld de three (r186), menos cuentas.
// (El padre de la última vez se anota por su número, no el objeto: una luz
// sacada de la escena —las del pool de fx/Epic— dejaba viva la escena del
// mapa anterior entera, ~70 MB.)
// enable(false) vuelve al de three (para comparar).
// La matriz escrita a mano (matrixAutoUpdate = false) también se vigila entera:
// si cambió, se rehace su mundo y el de sus hijos aunque nadie la marque.
// Ojo: un matrixWorld escrito a mano sin tocar .matrix no se ve.
// Grupos congelados: con obj.mcFrozen = true, three igual recorre todo el
// subárbol en cada cuadro (r186 baja a los hijos siempre); acá se corta ahí si
// la raíz no se movió y nadie la marcó. Para mover algo de adentro después de
// congelado: root.matrixWorldNeedsUpdate = true (rehace todo el subárbol una
// vez) o root.updateMatrixWorld(true).
// Dormidos mientras están escondidos: con obj.mcSleep = true y visible = false
// no se recorre nada de ese subárbol (jefes, cuervo, mates colgados que se ven
// a ratos y se animan por dentro); queda marcado y al volver a verse se rehace
// entero una vez. Ojo con lo que lea matrixWorld de algo escondido sin
// getWorldPosition / updateWorldMatrix (raycast a escondidos, pasadas propias).
// Lo escondido sin mcSleep (piezas que esperan aparecer: el altar, los
// fantasmas, la estación de mejoras... ~600 objetos en el penal, ~1/4 de la
// escena) se recorre uno de cada HIDDEN_N cuadros, cada uno en su turno: no se
// dibuja, y lo que cambió mientras tanto se ve igual al recorrerlo (se compara
// con lo guardado); si el padre se movió, queda marcado. Al volver a verse se
// recorre en ese mismo cuadro. Una llamada directa a su updateMatrixWorld lo
// recorre siempre (solo se saltea desde el padre).
// globalThis.__mduNoHiddenSkip: todo en cada cuadro, como antes.
const HIDDEN_N = 8;

const P = THREE.Object3D.prototype;
const original = P.updateMatrixWorld;

// la matriz entera contra la última vista (c[10..25])
function touched(e, c) {
  for (let i = 0; i < 16; i++) if (c[10 + i] !== e[i]) return true;
  return false;
}

function keep(e, c) {
  for (let i = 0; i < 16; i++) c[10 + i] = e[i];
}

function cached(force) {
  if (this.mcSleep === true && this.visible === false) {
    this.matrixWorldNeedsUpdate = true;
    return;
  }
  const e = this.matrix.elements;
  let c = this._mc;
  if (this.matrixAutoUpdate) {
    const p = this.position;
    const q = this.quaternion;
    const s = this.scale;
    if (
      this.pivot !== null ||
      this._mp !== (this.parent ? this.parent.id : -1) ||
      c === undefined ||
      c[0] !== p.x ||
      c[1] !== p.y ||
      c[2] !== p.z ||
      c[3] !== q._x ||
      c[4] !== q._y ||
      c[5] !== q._z ||
      c[6] !== q._w ||
      c[7] !== s.x ||
      c[8] !== s.y ||
      c[9] !== s.z ||
      touched(e, c)
    ) {
      this.updateMatrix();
      // (pasado a otro padre sin moverse: el mundo cambia igual)
      this._mp = this.parent ? this.parent.id : -1;
      if (c === undefined) c = this._mc = new Float64Array(26);
      c[0] = p.x;
      c[1] = p.y;
      c[2] = p.z;
      c[3] = q._x;
      c[4] = q._y;
      c[5] = q._z;
      c[6] = q._w;
      c[7] = s.x;
      c[8] = s.y;
      c[9] = s.z;
      keep(e, c);
    }
  } else if (this._mp !== (this.parent ? this.parent.id : -1) || c === undefined || touched(e, c)) {
    // matriz escrita a mano: si cambió desde el cuadro anterior se rehace su
    // mundo y el de sus hijos aunque nadie la haya marcado (con three los
    // forzaba el padre en cada cuadro; p. ej. el escudo del caballero: su
    // pieza recibe la matriz y un updateWorldMatrix que no baja a los hijos)
    this._mp = this.parent ? this.parent.id : -1;
    if (c === undefined) c = this._mc = new Float64Array(26);
    keep(e, c);
    this.matrixWorldNeedsUpdate = true;
  }
  // (la raíz movida ya quedó marcada arriba por updateMatrix)
  if (this.mcFrozen === true && !force && !this.matrixWorldNeedsUpdate) return;
  if (this.matrixWorldNeedsUpdate || force) {
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    this.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const children = this.children;
  const skip = globalThis.__mduNoHiddenSkip !== true;
  for (let i = 0, l = children.length; i < l; i++) {
    const ch = children[i];
    if (skip && ch.visible === false && ch.mcSleep !== true) {
      const n = (ch._mcSkip ?? ch.id % HIDDEN_N) + 1;
      if (n < HIDDEN_N) {
        ch._mcSkip = n;
        if (force) ch.matrixWorldNeedsUpdate = true;
        continue;
      }
      ch._mcSkip = 0;
    }
    ch.updateMatrixWorld(force);
  }
}

export function enable(on = true) {
  P.updateMatrixWorld = on ? cached : original;
}

enable(true);
