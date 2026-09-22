// Teclado + mouse con pointer lock. Guarda qué se apretó en este cuadro
// (pressed) además de lo que está mantenido (down).

export default class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;
    this.sensitivity = 1;
    this.invertY = false;
    this._h = {
      keydown: (e) => {
        if (!this.active) return;
        if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (e.ctrlKey && e.code === 'KeyW') e.preventDefault();
        if (!this.down.has(e.code)) this.pressed.add(e.code);
        this.down.add(e.code);
      },
      keyup: (e) => this.down.delete(e.code),
      mousemove: (e) => {
        if (!this.locked) return;
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      },
      mousedown: (e) => {
        if (!this.locked) return;
        if (e.button === 0) {
          this.mouse.left = true;
          this.mouse.leftPressed = true;
        }
        if (e.button === 2) this.mouse.right = true;
      },
      mouseup: (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      },
      wheel: (e) => {
        if (this.locked) this.mouse.wheel += Math.sign(e.deltaY);
      },
      contextmenu: (e) => e.preventDefault(),
      lockchange: () => {
        this.locked = document.pointerLockElement === this.target;
        if (!this.locked) this.releaseAll();
        this.onLockChange?.(this.locked);
      },
      blur: () => this.releaseAll(),
    };
    this.active = true;
    window.addEventListener('keydown', this._h.keydown);
    window.addEventListener('keyup', this._h.keyup);
    document.addEventListener('mousemove', this._h.mousemove);
    document.addEventListener('mousedown', this._h.mousedown);
    document.addEventListener('mouseup', this._h.mouseup);
    target.addEventListener('wheel', this._h.wheel, { passive: true });
    target.addEventListener('contextmenu', this._h.contextmenu);
    document.addEventListener('pointerlockchange', this._h.lockchange);
    window.addEventListener('blur', this._h.blur);
  }

  lock() {
    if (this.locked) return;
    // unadjustedMovement da movimiento crudo del mouse; si no está, sin opciones
    const plain = () => {
      try {
        this.target.requestPointerLock()?.catch?.(() => {});
      } catch {
        /* necesita un clic del usuario */
      }
    };
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true });
      if (p?.catch) p.catch((err) => err?.name === 'NotSupportedError' && plain());
    } catch {
      plain();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    this.down.clear();
    this.mouse.left = false;
    this.mouse.right = false;
  }

  key(code) {
    return this.down.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  // Al final de cada cuadro.
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    this.mouse.wheel = 0;
  }

  dispose() {
    this.active = false;
    window.removeEventListener('keydown', this._h.keydown);
    window.removeEventListener('keyup', this._h.keyup);
    document.removeEventListener('mousemove', this._h.mousemove);
    document.removeEventListener('mousedown', this._h.mousedown);
    document.removeEventListener('mouseup', this._h.mouseup);
    this.target.removeEventListener('wheel', this._h.wheel);
    this.target.removeEventListener('contextmenu', this._h.contextmenu);
    document.removeEventListener('pointerlockchange', this._h.lockchange);
    window.removeEventListener('blur', this._h.blur);
    this.unlock();
  }
}
