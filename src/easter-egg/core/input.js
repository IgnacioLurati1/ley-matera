// Teclado + mouse con pointer lock. Guarda qué se apretó en este cuadro
// (pressed) además de lo que está mantenido (down).

export default class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;
    this.sensitivity = 1;
    this.invertY = false;
    // teclas cambiadas por el jugador: física -> la de fábrica (core/controls)
    this.remap = new Map();
    // eligiendo una tecla en el menú de controles: la próxima va para ahí
    this.capture = null;
    // opciones "tocar" en vez de "mantener": correr, agacharse (teclas de
    // fábrica) y apuntar (clic derecho) se prenden y apagan con un toque
    this.toggles = new Set();
    this.latched = new Set();
    this.adsToggle = false;
    this.adsOn = false;
    // sensibilidad apuntando (la multiplica Player)
    this.adsSens = 1;
    this._h = {
      keydown: (e) => {
        if (!this.active) return;
        if (this.capture) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.capture(e.code);
          return;
        }
        if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (e.ctrlKey && e.code === 'KeyW') e.preventDefault();
        this.press(this.mapCode(e.code));
      },
      keyup: (e) => {
        const code = this.mapCode(e.code);
        if (code) this.down.delete(code);
      },
      mousemove: (e) => {
        if (!this.locked) return;
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      },
      mousedown: (e) => {
        // rueda y botones laterales se pueden asignar a una acción
        if (this.capture && e.button !== 0 && e.button !== 2) {
          e.preventDefault();
          this.capture(`Mouse${e.button}`);
          return;
        }
        if (!this.locked) return;
        if (e.button !== 0 && e.button !== 2) {
          e.preventDefault();
          this.press(this.mapCode(`Mouse${e.button}`));
        }
        if (e.button === 0) {
          this.mouse.left = true;
          this.mouse.leftPressed = true;
        }
        if (e.button === 2) {
          if (this.adsToggle) this.adsOn = !this.adsOn;
          this.mouse.right = this.adsToggle ? this.adsOn : true;
          this.mouse.rightPressed = true;
        }
      },
      mouseup: (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2 && !this.adsToggle) this.mouse.right = false;
        if (e.button !== 0 && e.button !== 2) {
          // los laterales no tienen que hacer "atrás" en el navegador
          if (this.locked) e.preventDefault();
          const code = this.mapCode(`Mouse${e.button}`);
          if (code) this.down.delete(code);
        }
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
    this.latched.clear();
    this.adsOn = false;
    this.mouse.left = false;
    this.mouse.right = false;
  }

  // Opciones: { adsMode, crouchMode, sprintMode } = 'hold' | 'toggle'.
  setModes({ adsMode, crouchMode, sprintMode }) {
    this.toggles.clear();
    if (crouchMode === 'toggle') this.toggles.add('KeyC');
    if (sprintMode === 'toggle') this.toggles.add('ShiftLeft');
    this.adsToggle = adsMode === 'toggle';
    this.releaseAll();
  }

  // La tecla de fábrica que corresponde a una física ('' = no hace nada).
  mapCode(code) {
    return this.remap.has(code) ? this.remap.get(code) : code;
  }

  press(code) {
    if (!code) return;
    if (!this.down.has(code)) {
      this.pressed.add(code);
      if (this.toggles.has(code) && !this.latched.delete(code)) this.latched.add(code);
      // correr o saltar te levanta; agacharte corta la corrida
      if (code === 'ShiftLeft' || code === 'Space') this.latched.delete('KeyC');
      if (code === 'KeyC') this.latched.delete('ShiftLeft');
    }
    this.down.add(code);
  }

  setRemap(map) {
    this.remap = map;
    this.releaseAll();
  }

  key(code) {
    if (!this.toggles.has(code)) return this.down.has(code);
    // correr con un toque: se corta al dejar de ir para adelante
    if (code === 'ShiftLeft' && !this.down.has('KeyW')) this.latched.delete(code);
    return this.latched.has(code);
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
    this.mouse.rightPressed = false;
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
