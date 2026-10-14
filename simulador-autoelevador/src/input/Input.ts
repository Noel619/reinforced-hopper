/**
 * Estado crudo de teclado, ratón y gamepad. Se consulta una vez por cuadro.
 * Mapeo "standard" de la Gamepad API (DualShock/DualSense, Xbox):
 *  0 ✕/A  1 ○/B  2 □/X  3 △/Y  4 L1  5 R1  6 L2  7 R2  8 Share  9 Options
 * 10 L3  11 R3  12 ↑  13 ↓  14 ←  15 →  16 PS
 * Ejes: 0 LX, 1 LY, 2 RX, 3 RY
 */
export const PAD = {
  CROSS: 0,
  CIRCLE: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SHARE: 8,
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  PS: 16,
} as const;

export class Input {
  private down = new Set<string>();
  private pressedNow = new Set<string>();
  private releasedNow = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  mouseButtons = 0;
  private mousePressed = 0;
  private mouseReleased = 0;
  /** Último dispositivo usado: para mostrar la ayuda adecuada. */
  lastDevice: 'teclado' | 'gamepad' = 'teclado';

  padConnected = false;
  padId = '';
  padAxes = [0, 0, 0, 0];
  padButtons: number[] = new Array(18).fill(0);
  private padPrev: number[] = new Array(18).fill(0);
  private padPressed = new Set<number>();
  private padReleased = new Set<number>();
  enabled = true;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (!this.down.has(e.code)) this.pressedNow.add(e.code);
      this.down.add(e.code);
      this.lastDevice = 'teclado';
      // evitar desplazamiento de página con flechas/espacio
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedNow.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseButtons = 0;
    });
    element.addEventListener('pointermove', (e) => {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      const r = element.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    // un clic en los menús (overlay) también indica que se usa el ratón
    window.addEventListener('pointerdown', () => (this.lastDevice = 'teclado'), true);
    element.addEventListener('pointerdown', (e) => {
      const bit = 1 << e.button;
      this.mouseButtons |= bit;
      this.mousePressed |= bit;
      element.setPointerCapture?.(e.pointerId);
      const r = element.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    element.addEventListener('pointerup', (e) => {
      const bit = 1 << e.button;
      this.mouseButtons &= ~bit;
      this.mouseReleased |= bit;
    });
    element.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => (this.lastDevice = 'gamepad'));
  }

  /** Lee el gamepad (llamar al principio de cada cuadro). */
  poll() {
    // dentro de un iframe sin permiso de gamepad, getGamepads() lanza un error: seguir sin joystick
    let pads: (Gamepad | null)[] = [];
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      pads = [];
    }
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    this.padConnected = !!pad;
    this.padPressed.clear();
    this.padReleased.clear();
    if (!pad) return;
    this.padId = pad.id;
    for (let i = 0; i < 4; i++) this.padAxes[i] = pad.axes[i] ?? 0;
    for (let i = 0; i < this.padButtons.length; i++) {
      const b = pad.buttons[i];
      const v = b ? (typeof b === 'object' ? b.value || (b.pressed ? 1 : 0) : Number(b)) : 0;
      this.padButtons[i] = v;
      const was = this.padPrev[i] > 0.5;
      const is = v > 0.5;
      if (is && !was) this.padPressed.add(i);
      if (!is && was) this.padReleased.add(i);
      this.padPrev[i] = v;
    }
    const active = this.padAxes.some((a) => Math.abs(a) > 0.3) || this.padButtons.some((b) => b > 0.3);
    if (active) this.lastDevice = 'gamepad';
  }

  /** Limpia los eventos de flanco (llamar al final de cada cuadro). */
  endFrame() {
    this.pressedNow.clear();
    this.releasedNow.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.mousePressed = 0;
    this.mouseReleased = 0;
  }

  key(code: string) {
    return this.enabled && this.down.has(code);
  }
  keyPressed(code: string) {
    return this.enabled && this.pressedNow.has(code);
  }
  keyReleased(code: string) {
    return this.releasedNow.has(code);
  }
  mouseDown(button = 0) {
    return (this.mouseButtons & (1 << button)) !== 0;
  }
  mouseClicked(button = 0) {
    return (this.mousePressed & (1 << button)) !== 0;
  }
  mouseUp(button = 0) {
    return (this.mouseReleased & (1 << button)) !== 0;
  }
  pad(i: number) {
    return this.enabled ? this.padButtons[i] : 0;
  }
  padPressedNow(i: number) {
    return this.enabled && this.padPressed.has(i);
  }
  padReleasedNow(i: number) {
    return this.padReleased.has(i);
  }
  axis(i: number, dead = 0.12) {
    if (!this.enabled) return 0;
    const v = this.padAxes[i];
    if (Math.abs(v) < dead) return 0;
    return (v - Math.sign(v) * dead) / (1 - dead);
  }

  /** Vibración del gamepad (si el navegador la soporta). */
  rumble(strong: number, weak: number, ms: number) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      const act = (p as Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } })?.vibrationActuator;
      if (act?.playEffect) {
        act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
      }
    }
  }

  get canvas() {
    return this.element;
  }
}
