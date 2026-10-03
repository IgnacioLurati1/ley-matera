// Un recorrido de escena entera repartido en cuadros: cada step visita hasta
// `n` objetos y la próxima vez sigue desde ahí; devuelve true al terminar una
// vuelta (la siguiente arranca de nuevo). Antes PostFX.sweep, Water.cullList y
// Effects.lowFlats recorrían todo de una vez cada tanto: 1-5 ms en un solo
// cuadro (más en una compu lenta). Lo que se agrega o se saca en el medio
// entra en la vuelta siguiente.
export default class SliceWalk {
  constructor() {
    this.stack = [];
    this.busy = false;
  }

  // roots: de dónde arranca cada vuelta; visit(o) por cada objeto
  step(roots, visit, n) {
    const S = this.stack;
    if (!this.busy) {
      this.busy = true;
      S.length = 0;
      for (let i = roots.length - 1; i >= 0; i--) if (roots[i]) S.push(roots[i]);
    }
    for (let k = 0; k < n && S.length; k++) {
      const o = S.pop();
      visit(o);
      const c = o.children;
      for (let i = c.length - 1; i >= 0; i--) S.push(c[i]);
    }
    if (S.length) return false;
    this.busy = false;
    return true;
  }

  reset() {
    this.stack.length = 0;
    this.busy = false;
  }
}
