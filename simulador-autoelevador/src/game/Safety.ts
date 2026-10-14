import type { ForkliftPhysics } from '../sim/forklift.ts';
import { residualCapacity } from '../sim/specs.ts';
import type { GameEvent, ViolationRule } from './events.ts';

export interface SafetyConfig {
  /** Velocidad máxima permitida (km/h) */
  speedLimit: number;
  /** Velocidad máxima con carga (km/h) */
  speedLimitLoaded: number;
  /** Exigir mirar hacia atrás en reversa (vista cabina) */
  requireLookBack: boolean;
  enabled: boolean;
}

export const DEFAULT_SAFETY: SafetyConfig = { speedLimit: 12, speedLimitLoaded: 9, requireLookBack: true, enabled: true };

const MESSAGES: Record<ViolationRule, string> = {
  cinturon: 'Abrochate el cinturón de seguridad antes de circular.',
  horquillas_altas: 'Circulá con las horquillas bajas (15–20 cm del piso).',
  velocidad: 'Exceso de velocidad.',
  giro_brusco: 'Giro demasiado brusco: riesgo de vuelco lateral.',
  inclinacion_adelante: 'No circules con el mástil inclinado hacia adelante y carga.',
  sobrecarga: 'Sobrecarga: la carga supera la capacidad a esta altura.',
  inversion_marcha: 'No cambies de marcha con el autoelevador en movimiento.',
  mirar_atras: 'Mirá hacia atrás cuando vas en reversa (V / cruceta →).',
  freno_mano: 'Estás acelerando con el freno de mano puesto.',
  rampa_carga: 'En rampas, la carga debe ir del lado de arriba.',
  rampa_giro: 'No gires sobre una rampa.',
  peaton_cerca: 'Peatón cerca: reducí la velocidad y tocá bocina.',
  frenada_brusca: 'Frenada brusca con carga: la carga puede deslizarse.',
  elevar_en_marcha: 'No elevés la carga mientras circulás.',
  carga_alta_quieto: 'Bajá la carga antes de dejar el autoelevador.',
};

/** Vigila las reglas de operación segura y emite infracciones (con enfriamiento). */
export class SafetyMonitor {
  config: SafetyConfig = { ...DEFAULT_SAFETY };
  private cooldown = new Map<ViolationRule, number>();
  private timers = new Map<ViolationRule, number>();
  private emit: (e: GameEvent) => void;
  lookingBack: () => boolean = () => true;
  pedestrianDistance: () => number = () => Infinity;
  /** Contador de infracciones por regla (sesión). */
  readonly counts = new Map<ViolationRule, number>();

  constructor(emit: (e: GameEvent) => void) {
    this.emit = emit;
  }

  reset() {
    this.cooldown.clear();
    this.timers.clear();
    this.counts.clear();
  }

  /** Condición sostenida durante `hold` segundos ⇒ infracción. */
  private check(rule: ViolationRule, cond: boolean, dt: number, hold = 0.6, severity = 0.5, cool = 7) {
    let t = this.timers.get(rule) ?? 0;
    t = cond ? t + dt : 0;
    this.timers.set(rule, t);
    const cd = this.cooldown.get(rule) ?? 0;
    if (cd > 0) this.cooldown.set(rule, cd - dt);
    if (cond && t >= hold && cd <= 0) {
      this.cooldown.set(rule, cool);
      this.counts.set(rule, (this.counts.get(rule) ?? 0) + 1);
      this.emit({ type: 'violation', rule, message: MESSAGES[rule], severity });
    }
  }

  /** Infracción instantánea (eventos). */
  trigger(rule: ViolationRule, severity = 0.5) {
    const cd = this.cooldown.get(rule) ?? 0;
    if (cd > 0) return;
    this.cooldown.set(rule, 5);
    this.counts.set(rule, (this.counts.get(rule) ?? 0) + 1);
    this.emit({ type: 'violation', rule, message: MESSAGES[rule], severity });
  }

  update(dt: number, fl: ForkliftPhysics) {
    if (!this.config.enabled) return;
    const t = fl.telemetry;
    const c = fl.controls;
    const s = fl.spec;
    const speed = Math.abs(t.speedKmh);
    const loaded = t.forkLoadKg > 60;
    const moving = speed > 1.5;
    this.check('cinturon', moving && !c.seatbelt, dt, 1.0, 0.4, 15);
    const forkLimit = loaded ? 0.45 : 0.6;
    this.check('horquillas_altas', speed > 3 && t.forkHeight > forkLimit, dt, 1.2, 0.5, 8);
    const limit = loaded ? this.config.speedLimitLoaded : this.config.speedLimit;
    this.check('velocidad', speed > limit + 0.5, dt, 1.2, 0.4, 8);
    const latLimit = 2.6 - Math.min(1.6, t.forkHeight * (loaded ? 0.6 : 0.3));
    this.check('giro_brusco', moving && Math.abs(t.accelLat) > latLimit, dt, 0.25, 0.6, 6);
    this.check('inclinacion_adelante', loaded && moving && t.tiltDeg < -0.8, dt, 1.0, 0.5, 8);
    const cap = residualCapacity(s, t.forkHeight, t.loadCenter > 0.05 ? t.loadCenter : s.loadCenter);
    this.check('sobrecarga', t.forkLoadKg > cap * 1.03 && t.forkHeight > 0.08, dt, 0.4, 0.8, 8);
    this.check('freno_mano', c.parkingBrake && c.direction !== 0 && c.throttle > 0.5 && t.engineRunning, dt, 1.5, 0.2, 10);
    this.check('frenada_brusca', loaded && t.accelLong * Math.sign(t.speed || 1) < -3.2 && speed > 3, dt, 0.1, 0.4, 6);
    this.check('elevar_en_marcha', speed > 2.5 && c.lift > 0.2 && t.forkHeight > 0.4, dt, 0.5, 0.4, 8);
    if (this.config.requireLookBack) {
      this.check('mirar_atras', c.direction === -1 && t.speedKmh < -2 && !this.lookingBack(), dt, 2.0, 0.2, 12);
    }
    // rampas: con carga, las horquillas deben quedar del lado de arriba
    const onRamp = Math.abs(t.pitchDeg) > 3.5;
    this.check('rampa_carga', onRamp && loaded && t.pitchDeg < -3.5, dt, 0.8, 0.6, 8);
    this.check('rampa_giro', onRamp && Math.abs(t.steerDeg) > 15 && moving, dt, 0.6, 0.4, 8);
    const pd = this.pedestrianDistance();
    this.check('peaton_cerca', pd < 2.5 && speed > 4, dt, 0.2, 0.5, 6);
  }
}
