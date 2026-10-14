import type { ForkliftPhysics } from '../sim/forklift.ts';
import { residualCapacity } from '../sim/specs.ts';
import { el } from './dom.ts';

export type ToastKind = 'info' | 'warn' | 'danger' | 'good';

export interface HudOptions {
  showStability: boolean;
  showScale: boolean;
  showHeight: boolean;
  minimal: boolean;
}

/** Interfaz superpuesta: velocidad, marcha, mástil, estabilidad, mensajes. */
export class Hud {
  readonly root: HTMLDivElement;
  private speedEl: HTMLDivElement;
  private dirEl: HTMLDivElement;
  private rpmBar: HTMLDivElement;
  private energyBar: HTMLDivElement;
  private energyLbl: HTMLSpanElement;
  private statusEl: HTMLDivElement;
  private mastEl: HTMLDivElement;
  private stabCanvas: HTMLCanvasElement;
  private stabBox: HTMLDivElement;
  private toasts: HTMLDivElement;
  private camLbl: HTMLDivElement;
  readonly modePanel: HTMLDivElement;
  readonly topRight: HTMLDivElement;
  private center: HTMLDivElement;
  private centerTimer = 0;
  private recent = new Map<string, number>();
  opts: HudOptions = { showStability: true, showScale: true, showHeight: true, minimal: false };

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    // panel de conducción (abajo izquierda)
    const drive = el('div', 'hud-drive panel');
    this.speedEl = el('div', 'hud-speed', '0');
    const unit = el('div', 'hud-unit', 'km/h');
    this.dirEl = el('div', 'hud-dir', 'N');
    const row = el('div', 'hud-row');
    row.append(el('div', 'hud-speedbox', '', [this.speedEl, unit]), this.dirEl);
    this.rpmBar = el('div', 'bar-fill');
    this.energyBar = el('div', 'bar-fill energy');
    this.energyLbl = el('span', 'bar-lbl', 'Combustible');
    drive.append(row, el('div', 'bar', '', [this.rpmBar]), el('div', 'bar', '', [this.energyBar, this.energyLbl]));
    this.statusEl = el('div', 'hud-status');
    drive.append(this.statusEl);
    // mástil (abajo derecha)
    this.mastEl = el('div', 'hud-mast panel');
    // estabilidad (arriba derecha)
    this.topRight = el('div', 'hud-topright');
    this.stabBox = el('div', 'hud-stab panel');
    this.stabCanvas = document.createElement('canvas');
    this.stabCanvas.width = 150;
    this.stabCanvas.height = 190;
    this.stabBox.append(el('div', 'panel-title', 'Estabilidad'), this.stabCanvas);
    this.topRight.append(this.stabBox);
    this.toasts = el('div', 'hud-toasts');
    this.camLbl = el('div', 'hud-cam');
    this.modePanel = el('div', 'hud-mode');
    this.center = el('div', 'hud-center');
    this.root.append(drive, this.mastEl, this.topRight, this.toasts, this.camLbl, this.modePanel, this.center);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  /** Mensaje temporal. Si se repite la misma clave, no se duplica por unos segundos. */
  toast(text: string, kind: ToastKind = 'info', key?: string, seconds = 4) {
    const k = key ?? text;
    const now = performance.now();
    const last = this.recent.get(k);
    if (last && now - last < seconds * 1000) return;
    this.recent.set(k, now);
    const t = el('div', `toast ${kind}`, text);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 5) this.toasts.lastChild?.remove();
    setTimeout(() => t.classList.add('out'), seconds * 1000);
    setTimeout(() => t.remove(), seconds * 1000 + 600);
  }

  /** Texto grande centrado (ej. "¡Lección completada!"). */
  bigMessage(text: string, seconds = 2.5) {
    this.center.textContent = text;
    this.center.classList.add('show');
    this.centerTimer = seconds;
  }

  setCameraLabel(text: string) {
    this.camLbl.textContent = text;
    this.camLbl.classList.add('show');
    setTimeout(() => this.camLbl.classList.remove('show'), 1800);
  }

  update(dt: number, fl: ForkliftPhysics) {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.center.classList.remove('show');
    }
    const t = fl.telemetry;
    const c = fl.controls;
    const spec = fl.spec;
    this.speedEl.textContent = String(Math.round(Math.abs(t.speedKmh)));
    const dir = c.direction === 1 ? 'F' : c.direction === -1 ? 'R' : 'N';
    this.dirEl.textContent = dir;
    this.dirEl.className = `hud-dir dir-${dir}`;
    const isEl = spec.power === 'electrico';
    const rpmFrac = isEl ? t.engineLoad : Math.min(1, t.rpm / spec.maxRpm);
    this.rpmBar.style.width = `${Math.round(rpmFrac * 100)}%`;
    this.energyBar.style.width = `${Math.round(Math.max(0, t.energyFrac) * 100)}%`;
    this.energyBar.classList.toggle('low', t.energyFrac < 0.15);
    this.energyLbl.textContent = isEl ? `Batería ${Math.round(t.energyFrac * 100)}%` : `${spec.power === 'glp' ? 'GLP' : 'Gasoil'} ${Math.round(t.energyFrac * 100)}%`;
    const st: string[] = [];
    st.push(`<span class="${t.engineRunning ? 'ok' : 'off'}">${isEl ? '⚡ Listo' : t.cranking ? '⟳ Arrancando' : t.engineRunning ? '● Motor' : '○ Motor'}</span>`);
    st.push(`<span class="${c.parkingBrake ? 'bad' : 'off'}">(P) Freno</span>`);
    st.push(`<span class="${c.seatbelt ? 'ok' : 'bad'}">${c.seatbelt ? '✓' : '✗'} Cinturón</span>`);
    if (c.lights) st.push('<span class="ok">☀ Luces</span>');
    this.statusEl.innerHTML = st.join('');

    // mástil
    const cap = residualCapacity(spec, t.forkHeight, t.loadCenter > 0.05 ? t.loadCenter : spec.loadCenter);
    const load = t.forkLoadKg;
    const over = load > cap + 20;
    let html = '<div class="panel-title">Mástil</div>';
    if (this.opts.showHeight) html += `<div class="kv"><span>Altura horquillas</span><b>${t.forkHeight.toFixed(2)} m</b></div>`;
    html += `<div class="kv"><span>Inclinación</span><b>${t.tiltDeg >= 0 ? '↶ ' : '↷ '}${Math.abs(t.tiltDeg).toFixed(1)}°</b></div>`;
    if (spec.sideShift) html += `<div class="kv"><span>Desplazador</span><b>${(t.sideShift * 1000).toFixed(0)} mm</b></div>`;
    if (spec.forkPositioner) html += `<div class="kv"><span>Apertura</span><b>${(t.spread * 1000).toFixed(0)} mm</b></div>`;
    if (this.opts.showScale) html += `<div class="kv ${over ? 'bad' : ''}"><span>Carga</span><b>${load > 15 ? Math.round(load) + ' kg' : '—'}</b></div>`;
    html += `<div class="kv small"><span>Capacidad a esta altura</span><b>${cap} kg</b></div>`;
    if (t.reliefActive) html += '<div class="kv bad"><span>Válvula de alivio</span><b>!</b></div>';
    this.mastEl.innerHTML = html;

    this.stabBox.style.display = this.opts.showStability ? '' : 'none';
    if (this.opts.showStability) this.drawStability(fl);
  }

  private drawStability(fl: ForkliftPhysics) {
    const cv = this.stabCanvas;
    const ctx = cv.getContext('2d')!;
    const s = fl.spec;
    const t = fl.telemetry;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // escala: el autoelevador ocupa ~150 px de alto
    const len = s.wheelbase + s.rearOverhang + s.forkFaceOffset + s.forkLength;
    const k = 150 / len;
    const ox = cv.width / 2;
    const oy = 12 + (s.forkFaceOffset + s.forkLength) * k; // eje delantero
    const P = (x: number, z: number): [number, number] => [ox - x * k, oy - z * k];
    // carrocería
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const [bx0, by0] = P(s.bodyWidth / 2, 0.1);
    const [bx1, by1] = P(-s.bodyWidth / 2, -s.wheelbase - s.rearOverhang);
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
    // horquillas
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const sx of [-1, 1]) {
      const [fx0, fy0] = P((sx * t.spread) / 2 + s.forkWidth / 2, s.forkFaceOffset + s.forkLength);
      ctx.fillRect(fx0, fy0, s.forkWidth * k, s.forkLength * k);
    }
    // triángulo de estabilidad
    const A = P(s.frontTrack / 2, 0);
    const B = P(-s.frontTrack / 2, 0);
    const C = P(0, -s.wheelbase);
    ctx.beginPath();
    ctx.moveTo(...A);
    ctx.lineTo(...B);
    ctx.lineTo(...C);
    ctx.closePath();
    const margin = triangleMargin(t.copX, t.copZ, s.frontTrack / 2, s.wheelbase);
    const rel = Math.max(0, Math.min(1, margin / 0.22));
    const col = rel > 0.5 ? '#3ddc84' : rel > 0.2 ? '#ffb020' : '#ff3b30';
    ctx.fillStyle = rel > 0.5 ? 'rgba(61,220,132,0.18)' : rel > 0.2 ? 'rgba(255,176,32,0.22)' : 'rgba(255,59,48,0.3)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    // centro de presión (proyección del centro de gravedad combinado)
    const [cx, cy] = P(t.copX, t.copZ);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // ruedas
    ctx.fillStyle = '#111';
    for (const [x, z, w, h] of [
      [s.frontTrack / 2, 0, s.frontWheelWidth, s.frontWheelRadius * 2],
      [-s.frontTrack / 2, 0, s.frontWheelWidth, s.frontWheelRadius * 2],
      [s.rearTrack / 2, -s.wheelbase, s.rearWheelWidth, s.rearWheelRadius * 2],
      [-s.rearTrack / 2, -s.wheelbase, s.rearWheelWidth, s.rearWheelRadius * 2],
    ]) {
      const [wx, wy] = P(x + w / 2, z + h / 2);
      ctx.fillRect(wx, wy, w * k, h * k);
    }
    ctx.fillStyle = '#c9d6e3';
    ctx.font = '11px sans-serif';
    ctx.fillText(`Eje trasero ${(t.rearLoadFrac * 100).toFixed(0)}%`, 6, cv.height - 6);
  }
}

/** Distancia (m) del punto (x,z) al borde más cercano del triángulo; negativa si está afuera. */
export function triangleMargin(x: number, z: number, halfTrack: number, wheelbase: number): number {
  const pts: [number, number][] = [
    [halfTrack, 0],
    [-halfTrack, 0],
    [0, -wheelbase],
  ];
  let min = Infinity;
  for (let i = 0; i < 3; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % 3];
    // normal hacia adentro (el triángulo está en sentido horario visto con estas coords)
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez);
    let nx = -ez / len;
    let nz = ex / len;
    // asegurar que apunte hacia el centroide
    const gx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3 - ax;
    const gz = (pts[0][1] + pts[1][1] + pts[2][1]) / 3 - az;
    if (nx * gx + nz * gz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const d = (x - ax) * nx + (z - az) * nz;
    min = Math.min(min, d);
  }
  return min;
}
