import type { ForkliftTelemetry, ForkliftControls } from '../sim/forklift.ts';
import type { ForkliftSpec } from '../sim/specs.ts';

export interface DashExtras {
  scale: boolean;
  heightIndicator: boolean;
  overload: boolean;
}

/** Dibuja la pantalla del tablero de la cabina en un canvas. */
export function drawDashboard(canvas: HTMLCanvasElement, t: ForkliftTelemetry, c: ForkliftControls, spec: ForkliftSpec, extras: DashExtras, time: number) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#26313d';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  const on = c.ignition;
  if (!on) {
    ctx.fillStyle = '#1b222b';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('— APAGADO —', W / 2, H / 2 + 10);
    return;
  }
  ctx.textAlign = 'left';
  // velocidad
  ctx.fillStyle = '#e8f1ff';
  ctx.font = 'bold 92px monospace';
  ctx.fillText(String(Math.round(Math.abs(t.speedKmh))).padStart(2, ' '), 20, 110);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#7f93a8';
  ctx.fillText('km/h', 140, 108);
  // marcha
  const dir = c.direction === 1 ? 'F' : c.direction === -1 ? 'R' : 'N';
  ctx.fillStyle = dir === 'F' ? '#3ddc84' : dir === 'R' ? '#ffb020' : '#7f93a8';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText(dir, 210, 108);

  // rpm / potencia
  const isEl = spec.power === 'electrico';
  const frac = isEl ? Math.min(1, t.engineLoad) : Math.min(1, t.rpm / spec.maxRpm);
  ctx.fillStyle = '#1b2531';
  ctx.fillRect(300, 30, 190, 22);
  ctx.fillStyle = frac > 0.85 ? '#ff5050' : '#4aa3ff';
  ctx.fillRect(300, 30, 190 * frac, 22);
  ctx.fillStyle = '#c9d6e3';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(isEl ? `MOTOR ${Math.round(frac * 100)}%` : `${Math.round(t.rpm)} rpm`, 300, 74);
  // combustible / batería
  ctx.fillStyle = '#1b2531';
  ctx.fillRect(300, 86, 190, 16);
  const ef = Math.max(0, t.energyFrac);
  ctx.fillStyle = ef < 0.15 ? (Math.floor(time * 2) % 2 ? '#ff3030' : '#661010') : '#3ddc84';
  ctx.fillRect(300, 86, 190 * ef, 16);
  ctx.fillStyle = '#c9d6e3';
  ctx.font = '16px sans-serif';
  ctx.fillText(isEl ? `Batería ${Math.round(ef * 100)}%` : `Comb. ${Math.round(ef * 100)}%`, 300, 122);
  ctx.fillText(`${t.hourMeter.toFixed(1)} h`, 420, 122);

  // fila inferior: altura / carga
  ctx.font = 'bold 26px monospace';
  ctx.fillStyle = '#e8f1ff';
  if (extras.heightIndicator) ctx.fillText(`↕ ${t.forkHeight.toFixed(2)} m`, 20, 170);
  ctx.fillText(`∠ ${t.tiltDeg >= 0 ? '+' : ''}${t.tiltDeg.toFixed(1)}°`, 210, 170);
  if (extras.scale) {
    ctx.fillStyle = extras.overload ? '#ff4040' : '#e8f1ff';
    ctx.fillText(`${Math.round(t.forkLoadKg)} kg`, 360, 170);
  }

  // testigos
  const icons: { txt: string; on: boolean; color: string }[] = [
    { txt: 'P', on: c.parkingBrake, color: '#ff3b30' },
    { txt: 'CINT', on: !c.seatbelt, color: '#ff3b30' },
    { txt: 'MOTOR', on: !t.engineRunning && !isEl, color: '#ffb020' },
    { txt: 'SOBRECARGA', on: extras.overload, color: '#ff3b30' },
    { txt: 'LUZ', on: c.lights, color: '#3ddc84' },
  ];
  let x = 20;
  ctx.font = 'bold 20px sans-serif';
  for (const ic of icons) {
    const w = ctx.measureText(ic.txt).width + 18;
    ctx.fillStyle = ic.on ? ic.color : '#1b2531';
    ctx.fillRect(x, 196, w, 34);
    ctx.fillStyle = ic.on ? '#0b0f14' : '#35414e';
    ctx.fillText(ic.txt, x + 9, 220);
    x += w + 8;
  }
}
