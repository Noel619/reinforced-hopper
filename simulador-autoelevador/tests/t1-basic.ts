import { makeScene, fmt } from './harness.ts';

const s = await makeScene('puma25');
const { fl } = s;
const T = fl.telemetry;
s.step(2);
const g = 9.81;
console.log('--- reposo ---');
console.log('cargas ruedas (kg):', T.wheelLoads.map((f) => fmt(f / g, 0)).join(' '), 'total', fmt(T.wheelLoads.reduce((a, b) => a + b) / g, 0));
console.log('frac trasera', fmt(T.rearLoadFrac), 'altura chasis', fmt(fl.position.y, 4), 'forkH', fmt(T.forkHeight, 3), 'lift', fmt(T.liftPos, 4), 'tilt', fmt(T.tiltDeg, 3));

// arranque
fl.controls.ignition = true;
s.step(1.5);
console.log('--- motor --- running', T.engineRunning, 'rpm', fmt(T.rpm, 0));
fl.controls.parkingBrake = false;
fl.controls.direction = 1;
s.step(3);
console.log('creep 3s: v km/h', fmt(T.speedKmh), 'pos z', fmt(fl.position.z));
fl.controls.throttle = 1;
let t0 = s.time;
let reported = false;
s.step(8, (t) => {
  if (!reported && T.speedKmh > 15) { console.log('0->15 km/h desde creep en', fmt(t - t0), 's'); reported = true; }
});
console.log('full 8s: v km/h', fmt(T.speedKmh), 'rpm', fmt(T.rpm, 0), 'z', fmt(fl.position.z), 'slip', T.wheelsSlipping, 'x', fmt(fl.position.x, 3));
fl.controls.throttle = 0;
fl.controls.brake = 1;
t0 = s.time;
const z0 = fl.position.z;
let stopped = false;
s.step(4, (t) => { if (!stopped && Math.abs(T.speed) < 0.05) { stopped = true; console.log('frenado total en', fmt(t - t0), 's, dist', fmt(fl.position.z - z0), 'm'); } });
console.log('rearFrac al frenar ~', fmt(T.rearLoadFrac));
fl.controls.brake = 0;

// giro máximo a baja velocidad
fl.controls.handwheel = 1;
s.step(1.5);
fl.controls.throttle = 0.25;
const pts: { x: number; z: number }[] = [];
s.step(12, () => { const p = fl.position; pts.push({ x: p.x, z: p.z }); });
// radio: estimar con el centro de la nube de puntos (círculo)
let cx = 0, cz = 0; for (const p of pts) { cx += p.x; cz += p.z; } cx /= pts.length; cz /= pts.length;
let r = 0; for (const p of pts) r += Math.hypot(p.x - cx, p.z - cz); r /= pts.length;
console.log('giro: v', fmt(T.speedKmh), 'km/h, radio punto eje delantero', fmt(r), 'steerDeg', fmt(T.steerDeg), 'yaw', fmt(fl.yaw));
fl.controls.throttle = 0; fl.controls.brake = 1; fl.controls.handwheel = 0;
s.step(3);
fl.controls.brake = 0; fl.controls.direction = 0; fl.controls.parkingBrake = true;

// elevación en ralentí y acelerando
fl.controls.lift = 1;
let h0 = T.forkHeight;
s.step(2);
console.log('elevar 2s ralentí: forkH', fmt(T.forkHeight), 'vel', fmt((T.forkHeight - h0) / 2), 'm/s rpm', fmt(T.rpm, 0));
fl.controls.throttle = 1;
s.step(0.6);
h0 = T.forkHeight;
s.step(1.5);
console.log('elevar acelerando: vel', fmt((T.forkHeight - h0) / 1.5), 'm/s rpm', fmt(T.rpm, 0), 'forkH', fmt(T.forkHeight), 'liftPos', fmt(T.liftPos), 'cmd', fmt(T.liftCmd));
s.step(4);
console.log('tope: forkH', fmt(T.forkHeight), 'relief', T.reliefActive, 'inner', fmt(T.innerMastRise));
fl.controls.lift = -1; fl.controls.throttle = 0;
s.step(8);
console.log('bajar: forkH', fmt(T.forkHeight, 3), 'lift', fmt(T.liftPos, 3));
fl.controls.lift = 0;
fl.controls.tilt = 1; s.step(4);
console.log('incl atrás:', fmt(T.tiltDeg), 'cmd', fmt(fl.tiltCmd));
fl.controls.tilt = -1; s.step(6);
console.log('incl adelante:', fmt(T.tiltDeg), 'cmd', fmt(fl.tiltCmd), 'forkH', fmt(T.forkHeight, 3), 'rearFrac', fmt(T.rearLoadFrac));
fl.controls.tilt = 0;
fl.controls.sideShift = 1; s.step(2);
console.log('desplazador izq:', fmt(T.sideShift, 3));
