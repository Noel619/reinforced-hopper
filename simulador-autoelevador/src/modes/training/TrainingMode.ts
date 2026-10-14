import * as THREE from 'three';
import type { GameMode, Session } from '../../game/Session.ts';
import type { World } from '../../world/World.ts';
import type { GameEvent, ViolationRule } from '../../game/events.ts';
import { getSpec } from '../../sim/specs.ts';
import { buildPracticeCenter } from '../../world/layouts.ts';
import { ArrowMarker, GhostBox } from '../../world/markers.ts';
import { LessonCtx, type Lesson, type LessonRefs } from './kit.ts';
import { el, escapeHtml } from '../../ui/dom.ts';
import { modal } from '../../ui/menus.ts';
import { storageGet, storageSet } from '../../app/settings.ts';

export interface LessonRecord {
  best: number;
  stars: number;
  time: number;
}
const PROGRESS_KEY = 'autoelevador.escuela.v1';

export function loadProgress(): Record<string, LessonRecord> {
  return storageGet<Record<string, LessonRecord>>(PROGRESS_KEY, {});
}

function saveRecord(id: string, rec: LessonRecord) {
  const all = loadProgress();
  const prev = all[id];
  if (!prev || rec.best > prev.best) all[id] = rec;
  storageSet(PROGRESS_KEY, all);
}

export function starsFor(score: number): number {
  return score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0;
}

const VIOLATION_POINTS: Partial<Record<ViolationRule, number>> = {
  mirar_atras: 2,
  cinturon: 8,
  peaton_cerca: 8,
  sobrecarga: 10,
  giro_brusco: 6,
  rampa_carga: 10,
  horquillas_altas: 5,
  velocidad: 4,
};

/** Ejecuta una lección de la escuela sobre el centro de práctica. */
export class TrainingMode implements GameMode {
  readonly id = 'training' as const;
  readonly title: string;
  readonly lesson: Lesson;
  private refs: LessonRefs = { pallets: {}, zones: {}, slots: {}, cones: [], gates: [], data: {} };
  private ctx!: LessonCtx;
  private step = 0;
  private holdTime = 0;
  private score = 100;
  private log: { pts: number; reason: string }[] = [];
  private time = 0;
  private running = false;
  private finished = false;
  private arrow = new ArrowMarker();
  private ghost: GhostBox | null = null;
  private ghostKey = '';
  private panel: HTMLDivElement;
  private onNext: (id: string | null) => void;
  readonly safetyConfig: { speedLimit: number; speedLimitLoaded: number };

  constructor(lesson: Lesson, onNext: (id: string | null) => void) {
    this.lesson = lesson;
    this.title = `Lección ${lesson.num}: ${lesson.title}`;
    this.onNext = onNext;
    this.panel = el('div', 'panel lesson-panel');
    this.safetyConfig = { speedLimit: lesson.speedLimit ?? 12, speedLimitLoaded: 9 };
  }

  build(world: World) {
    const pc = buildPracticeCenter(world, { pedestrians: this.lesson.pedestrians });
    this.refs.cones = pc.cones;
    this.lesson.setup(world, this.refs);
    world.scene.add(this.arrow.group);
    const st = this.lesson.start;
    return { spec: getSpec(this.lesson.spec), position: new THREE.Vector3(st.x, 0.02, st.z), yaw: (st.yawDeg * Math.PI) / 180 };
  }

  respawn() {
    const st = this.lesson.start;
    return { position: new THREE.Vector3(st.x, 0.02, st.z), yaw: (st.yawDeg * Math.PI) / 180 };
  }

  start(s: Session) {
    this.ctx = new LessonCtx(s, this.refs);
    this.ctx.penalize = (pts, reason) => this.deduct(s, pts, reason);
    const c = s.fl.controls;
    if (this.lesson.start.engineOn) {
      s.fl.startEngineImmediately();
      c.seatbelt = true;
    }
    c.parkingBrake = true;
    c.direction = 0;
    s.hud.modePanel.innerHTML = '';
    s.hud.modePanel.append(this.panel);
    // sin infracciones antes de empezar
    s.safety.config.enabled = false;
    this.renderPanel();
    this.showIntro(s);
  }

  private showIntro(s: Session) {
    const L = this.lesson;
    s.setPaused(true);
    const html = `
      <p>${escapeHtml(L.summary)}</p>
      <ul class="tips">${L.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
      <p class="note">Seguí las instrucciones del panel (arriba a la izquierda) y las flechas verdes. Tiempo de referencia: ${Math.round(L.par / 60)} min.
      ${L.strict ? '<br><b>Examen:</b> las infracciones restan 10 puntos y un choque fuerte, un vuelco o una carga caída desaprueban.' : ''}
      <br>F1 = controles · Esc = pausa · Retroceso = reubicar el autoelevador.</p>`;
    const m = modal(`Lección ${L.num}: ${L.title}`, html, [
      { label: 'Volver', action: () => s.app.exitToMenu() },
      {
        label: '▶ Comenzar',
        cls: 'primary',
        action: () => {
          s.app.popScreen(m);
          s.setPaused(false);
          s.safety.config.enabled = true;
          this.running = true;
          s.app.audio.chime(true);
        },
      },
    ]);
    s.app.pushScreen(m);
  }

  private deduct(s: Session, pts: number, reason: string) {
    if (!this.running || this.finished || pts <= 0) return;
    this.score = Math.max(0, this.score - pts);
    this.log.push({ pts, reason });
    s.hud.toast(`−${pts} · ${reason}`, 'warn', `ded:${reason}`, 2.5);
    this.renderPanel();
  }

  onEvent(e: GameEvent, s: Session) {
    if (!this.running || this.finished) return;
    const strict = !!this.lesson.strict;
    switch (e.type) {
      case 'collision': {
        const names: Record<string, string> = { rack: 'estantería', wall: 'pared/estructura', truck: 'camión', pallet: 'pallet', prop: 'objeto', other: 'obstáculo' };
        if (e.severity > 0.3 && strict) return this.fail(s, `Choque fuerte contra ${names[e.what]}`);
        this.deduct(s, e.severity > 0.3 ? 15 : 5, `Golpe contra ${names[e.what]}`);
        break;
      }
      case 'palletImpact':
        if (e.severity > 0.12) this.deduct(s, e.severity > 0.4 ? 10 : 5, 'Golpe a la carga');
        break;
      case 'palletDropped':
        if (strict) return this.fail(s, 'Se cayó la carga');
        this.deduct(s, 30, 'Carga caída');
        break;
      case 'tipover':
        return this.fail(s, 'Vuelco del autoelevador');
      case 'pedestrianHit':
        return this.fail(s, 'Atropello de un peatón');
      case 'coneHit':
        this.deduct(s, 5, 'Cono derribado');
        break;
      case 'violation':
        this.deduct(s, strict ? 10 : (VIOLATION_POINTS[e.rule] ?? 5), e.message.replace(/\.$/, ''));
        break;
      default:
        break;
    }
  }

  update(dt: number, s: Session) {
    this.arrow.update(dt);
    this.ghost?.update(dt);
    if (!this.running || this.finished) {
      this.updateMarkers();
      return;
    }
    this.time += dt;
    this.ctx.stepTime += dt;
    this.lesson.monitor?.(this.ctx, dt);
    const st = this.lesson.steps[this.step];
    if (st) {
      let ok = false;
      try {
        ok = st.check(this.ctx);
      } catch {
        ok = false;
      }
      if (ok) {
        this.holdTime += dt;
        if (this.holdTime >= (st.hold ?? 0)) {
          this.step++;
          this.holdTime = 0;
          this.ctx.stepTime = 0;
          s.app.audio.chime(true);
          if (this.step >= this.lesson.steps.length) {
            this.complete(s);
            return;
          }
          s.hud.toast(`✓ ${st.text}`, 'good', `step:${this.step}`, 3);
        }
      } else this.holdTime = 0;
    }
    this.updateMarkers();
    this.panelTimer -= dt;
    if (this.panelTimer <= 0) {
      this.panelTimer = 0.25;
      this.renderPanel();
    }
  }
  private panelTimer = 0;

  private updateMarkers() {
    const st = this.lesson.steps[this.step];
    const pos = st?.marker && this.ctx ? safe(() => st.marker!(this.ctx)) : null;
    this.arrow.group.visible = !!pos && !this.finished;
    if (pos) this.arrow.group.position.copy(pos);
    const g = st?.ghost && this.ctx ? safe(() => st.ghost!(this.ctx)) : null;
    const key = g ? `${g.pos.x.toFixed(2)},${g.pos.y.toFixed(2)},${g.pos.z.toFixed(2)},${g.size.join(',')}` : '';
    if (key !== this.ghostKey) {
      if (this.ghost) this.ghost.group.removeFromParent();
      this.ghost = null;
      if (g && this.ctx) {
        this.ghost = new GhostBox(g.size[0], g.size[1], g.size[2]);
        this.ghost.group.position.copy(g.pos);
        this.ghost.group.rotation.y = g.yaw;
        this.ctx.world.scene.add(this.ghost.group);
      }
      this.ghostKey = key;
    }
  }

  private renderPanel() {
    const L = this.lesson;
    const st = L.steps[this.step];
    const mm = Math.floor(this.time / 60);
    const ss = Math.floor(this.time % 60);
    const prog = st?.progress && this.ctx ? safe(() => st.progress!(this.ctx)) : '';
    const steps = L.steps
      .map((x, i) => `<div class="lstep ${i < this.step ? 'done' : i === this.step ? 'cur' : ''}">${i < this.step ? '✓' : i + 1}</div>`)
      .join('');
    this.panel.innerHTML = `
      <div class="lp-head"><b>Lección ${L.num}: ${escapeHtml(L.title)}</b><span class="lp-time">${mm}:${String(ss).padStart(2, '0')}</span></div>
      <div class="lp-steps">${steps}</div>
      <div class="lp-text">${st ? escapeHtml(st.text) : '¡Completada!'}</div>
      ${prog ? `<div class="lp-prog">${escapeHtml(prog)}</div>` : ''}
      ${st?.hint ? `<div class="lp-hint">💡 ${escapeHtml(st.hint)}</div>` : ''}
      <div class="lp-score">Puntaje <b>${this.score}</b>${this.log.length ? ` · ${this.log.length} descuento${this.log.length > 1 ? 's' : ''}` : ''}</div>`;
  }

  private complete(s: Session) {
    this.finished = true;
    this.running = false;
    const over = Math.max(0, this.time - this.lesson.par);
    const timePen = Math.min(20, Math.floor(over / 10));
    if (timePen > 0) this.log.push({ pts: timePen, reason: `Tiempo excedido (${Math.round(over)} s)` });
    const score = Math.max(0, this.score - timePen);
    const stars = starsFor(score);
    if (stars > 0) saveRecord(this.lesson.id, { best: score, stars, time: this.time });
    s.hud.bigMessage(stars > 0 ? '¡Lección aprobada!' : 'No aprobada', 3);
    this.renderPanel();
    setTimeout(() => this.showResults(s, score, stars, null), 1500);
  }

  private fail(s: Session, reason: string) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    s.hud.bigMessage('Lección no aprobada', 3);
    s.app.audio.chime(false);
    setTimeout(() => this.showResults(s, 0, 0, reason), 1800);
  }

  private showResults(s: Session, score: number, stars: number, failReason: string | null) {
    if (s.app.session !== s) return;
    s.setPaused(true);
    const mm = Math.floor(this.time / 60);
    const ss = Math.floor(this.time % 60);
    const starsHtml = `<div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>`;
    const ded = this.log.length
      ? `<ul class="deductions">${this.log.map((d) => `<li><b>−${d.pts}</b> ${escapeHtml(d.reason)}</li>`).join('')}</ul>`
      : '<p class="good">Sin descuentos. ¡Excelente trabajo!</p>';
    const html = failReason
      ? `<p class="bad"><b>Motivo:</b> ${escapeHtml(failReason)}</p><p>Repetí la lección. Recordá las reglas de seguridad del panel de ayuda (F1).</p>`
      : `${starsHtml}<p class="score-line">Puntaje <b>${score}</b>/100 · Tiempo ${mm}:${String(ss).padStart(2, '0')}</p>${ded}`;
    const next = nextLessonId(this.lesson.id);
    const buttons = [
      { label: 'Menú de lecciones', action: () => this.onNext(null) },
      { label: '⟲ Repetir', action: () => this.onNext(this.lesson.id) },
    ];
    if (!failReason && stars > 0 && next) buttons.push({ label: 'Siguiente lección ▶', action: () => this.onNext(next), cls: 'primary' } as never);
    const m = modal(failReason ? 'Lección no aprobada' : stars > 0 ? '¡Lección aprobada!' : 'Puntaje insuficiente', html, buttons);
    s.app.pushScreen(m);
  }

  pauseItems() {
    return [{ label: '⟲ Reiniciar lección', action: () => this.onNext(this.lesson.id) }];
  }

  hasAccessory() {
    return true;
  }
}

let lessonOrder: string[] = [];
export function setLessonOrder(ids: string[]) {
  lessonOrder = ids;
}
function nextLessonId(id: string): string | null {
  const i = lessonOrder.indexOf(id);
  return i >= 0 && i + 1 < lessonOrder.length ? lessonOrder[i + 1] : null;
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
