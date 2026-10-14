import { Input, PAD } from './Input.ts';
import type { ForkliftPhysics } from '../sim/forklift.ts';

export interface ControlSettings {
  /** realista: palanca de marcha F/N/R + acelerador. simple: W/R2 avanza, S/L2 frena y luego retrocede. */
  drivingMode: 'realista' | 'simple';
  /** El volante vuelve solo al centro al soltar A/D (ayuda). */
  autoCenter: boolean;
  /** Invertir el eje X del stick derecho (inclinación). */
  invertTilt: boolean;
  /** Sensibilidad del volante con teclado (vueltas normalizadas por segundo). */
  steerRate: number;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  drivingMode: 'realista',
  autoCenter: false,
  invertTilt: false,
  steerRate: 0.8,
};

export type LeverId = 'lift' | 'tilt' | 'shift' | 'spread';

/** Acciones de interfaz detectadas en el cuadro. */
export interface UiActions {
  cameraNext: boolean;
  pause: boolean;
  help: boolean;
  lookBack: boolean;
  lookLeft: boolean;
  resetView: boolean;
  forkCam: boolean;
  map: boolean;
  spawnMenu: boolean;
  resetForklift: boolean;
}

const approach = (v: number, target: number, rate: number, dt: number) => {
  const d = target - v;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
};

/** Traduce el estado de teclado/gamepad a los mandos del autoelevador. */
export class ControlMapper {
  settings: ControlSettings = { ...DEFAULT_CONTROL_SETTINGS };
  private kThrottle = 0;
  private kBrake = 0;
  private kInch = 0;
  private kLever: Record<LeverId, number> = { lift: 0, tilt: 0, shift: 0, spread: 0 };
  /** Valores impuestos por el ratón al arrastrar palancas en la cabina. */
  mouseLever: Partial<Record<LeverId, number>> = {};
  /** Posición del volante impuesta por el ratón (arrastrando el pomo). */
  mouseHandwheel: number | null = null;
  mouseHorn = false;
  /** Bloquea los mandos de conducción (menús abiertos, etc.). */
  locked = false;
  /** Los mandos los maneja un programa externo (pruebas automáticas). */
  external = false;

  update(dt: number, input: Input, fl: ForkliftPhysics): UiActions {
    const c = fl.controls;
    const ui: UiActions = {
      cameraNext: input.keyPressed('KeyC') || input.padPressedNow(PAD.TRIANGLE),
      pause: input.keyPressed('Escape') || input.keyPressed('KeyP') || input.padPressedNow(PAD.OPTIONS),
      help: input.keyPressed('F1') || input.padPressedNow(PAD.SHARE),
      lookBack: input.key('KeyV') || input.pad(PAD.RIGHT) > 0.5 || input.pad(PAD.R3) > 0.5,
      lookLeft: false,
      resetView: input.keyPressed('Home'),
      forkCam: input.keyPressed('KeyG'),
      map: input.keyPressed('KeyM'),
      spawnMenu: input.keyPressed('KeyN'),
      resetForklift: input.keyPressed('Backspace'),
    };
    if (this.external) return ui;
    if (this.locked) {
      c.throttle = 0;
      c.lift = c.tilt = c.sideShift = c.spread = 0;
      c.horn = false;
      return ui;
    }
    const fine = input.key('ControlLeft') || input.key('ControlRight');
    const kMax = fine ? 0.35 : 1;

    // ---------------- pedales ----------------
    this.kThrottle = approach(this.kThrottle, input.key('KeyW') ? kMax : 0, input.key('KeyW') ? 2.2 : 5, dt);
    this.kBrake = approach(this.kBrake, input.key('KeyS') ? 1 : 0, input.key('KeyS') ? 3.5 : 6, dt);
    const shift = input.key('ShiftLeft') || input.key('ShiftRight');
    this.kInch = approach(this.kInch, shift ? 0.45 : 0, 3, dt);
    const padThrottle = input.pad(PAD.R2);
    const padL2 = input.pad(PAD.L2);

    let throttle = Math.max(this.kThrottle, padThrottle);
    let brake = this.kBrake;
    let inching = this.kInch;
    if (fl.isElectric) brake = Math.max(brake, padL2);
    else {
      // L2 = pedal de avance lento: primera mitad desembraga, segunda mitad frena
      inching = Math.max(inching, padL2);
    }

    // Modo simple: dirección automática según el pedal
    if (this.settings.drivingMode === 'simple') {
      const v = fl.forwardSpeed();
      const wantFwd = input.key('KeyW') || padThrottle > 0.05;
      const wantBack = input.key('KeyS') || padL2 > 0.05;
      const backAmt = Math.max(this.kBrake, padL2);
      throttle = 0;
      brake = 0;
      inching = 0;
      if (wantFwd) {
        if (c.direction !== 1 && v < -0.3) brake = 1;
        else {
          c.direction = 1;
          throttle = Math.max(this.kThrottle, padThrottle);
        }
      } else if (wantBack) {
        if (v > 0.3) brake = backAmt;
        else {
          c.direction = -1;
          throttle = backAmt * (fine ? 0.35 : 0.8);
        }
      } else if (Math.abs(v) < 0.15) {
        // sin pedales y detenido: neutral para no avanzar con el ralentí
        c.direction = 0;
      } else {
        brake = 0.08;
      }
    }
    c.throttle = Math.min(1, throttle);
    c.brake = Math.min(1, brake);
    c.inching = Math.min(1, inching);

    // ---------------- volante ----------------
    const steerKey = (input.key('KeyA') ? 1 : 0) - (input.key('KeyD') ? 1 : 0);
    const padX = input.axis(0, 0.1);
    if (this.mouseHandwheel !== null) {
      c.handwheel = this.mouseHandwheel;
    } else if (steerKey !== 0) {
      c.handwheel = Math.max(-1, Math.min(1, c.handwheel + steerKey * this.settings.steerRate * dt));
    } else if (input.padConnected && input.lastDevice === 'gamepad') {
      // stick: posición proporcional (curva suave) con velocidad máxima de giro del volante
      const target = -(padX * 0.65 + padX * Math.abs(padX) * 0.35);
      c.handwheel = approach(c.handwheel, target, 2.4, dt);
    } else if (this.settings.autoCenter) {
      c.handwheel = approach(c.handwheel, 0, 1.1, dt);
    }

    // ---------------- palancas hidráulicas ----------------
    const keyLever = (id: LeverId, plus: boolean, minus: boolean) => {
      const target = (plus ? kMax : 0) - (minus ? kMax : 0);
      const rate = target !== 0 ? 3.2 : 9;
      this.kLever[id] = approach(this.kLever[id], target, rate, dt);
      return this.kLever[id];
    };
    const kLift = keyLever('lift', input.key('ArrowUp'), input.key('ArrowDown'));
    const kTilt = keyLever('tilt', input.key('KeyR'), input.key('KeyF'));
    const kShift = keyLever('shift', input.key('ArrowLeft'), input.key('ArrowRight'));
    const kSpread = keyLever('spread', input.key('KeyX'), input.key('KeyZ'));
    const pLift = -input.axis(3, 0.15);
    const pTilt = (this.settings.invertTilt ? 1 : -1) * input.axis(2, 0.2);
    const pShift = input.pad(PAD.L1) - input.pad(PAD.R1);
    const pSpread = fl.spec.forkPositioner ? -input.axis(1, 0.5) : 0;
    const pick = (id: LeverId, k: number, p: number) => {
      const m = this.mouseLever[id];
      if (m !== undefined) return m;
      return Math.abs(p) > Math.abs(k) ? p : k;
    };
    c.lift = pick('lift', kLift, pLift);
    c.tilt = pick('tilt', kTilt, pTilt);
    c.sideShift = pick('shift', kShift, pShift);
    c.spread = pick('spread', kSpread, pSpread);

    // ---------------- palanca de marcha ----------------
    if (this.settings.drivingMode === 'realista') {
      if (input.keyPressed('KeyE') || input.padPressedNow(PAD.UP)) c.direction = Math.min(1, c.direction + 1) as -1 | 0 | 1;
      if (input.keyPressed('KeyQ') || input.padPressedNow(PAD.DOWN)) c.direction = Math.max(-1, c.direction - 1) as -1 | 0 | 1;
    }

    // ---------------- interruptores ----------------
    if (input.keyPressed('Space') || input.padPressedNow(PAD.CIRCLE)) c.parkingBrake = !c.parkingBrake;
    if (input.keyPressed('KeyK') || input.padPressedNow(PAD.CROSS)) c.ignition = !c.ignition;
    if (input.keyPressed('KeyB') || input.padPressedNow(PAD.L3)) c.seatbelt = !c.seatbelt;
    if (input.keyPressed('KeyL') || input.padPressedNow(PAD.LEFT)) c.lights = !c.lights;
    if (input.keyPressed('KeyJ')) c.beacon = !c.beacon;
    c.horn = input.key('KeyH') || input.pad(PAD.SQUARE) > 0.5 || this.mouseHorn;
    return ui;
  }

  /** Suelta todo (al pausar). */
  release(fl: ForkliftPhysics) {
    const c = fl.controls;
    c.throttle = 0;
    c.brake = 0;
    c.inching = 0;
    c.lift = c.tilt = c.sideShift = c.spread = 0;
    c.horn = false;
    this.kThrottle = this.kBrake = this.kInch = 0;
    this.kLever = { lift: 0, tilt: 0, shift: 0, spread: 0 };
    this.mouseLever = {};
    this.mouseHandwheel = null;
    this.mouseHorn = false;
  }
}
