import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
const p = addPallet(s, 0, 0.0, 2.6, 'cajas', 1000);
s.step(1);
fl.controls.ignition = true; s.step(1.2);
fl.controls.parkingBrake = false; fl.controls.direction = 1;
s.step(20, () => {
  const faceZ = fl.position.z + 0.48;
  if (faceZ > 1.98) { fl.controls.brake = 1; } else { fl.controls.brake = T.speed > (faceZ > 1.5 ? 0.25 : 0.6) ? 0.12 : 0; }
});
console.log('tras acercarse yaw', fmt(fl.yaw * 57.3, 3));
fl.controls.direction = 0; fl.controls.brake = 0; fl.controls.parkingBrake = true;
fl.controls.lift = 1; fl.controls.throttle = 0.6;
s.step(4, () => { if (T.forkHeight > 0.2) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0; s.step(1);
console.log('tras elevar yaw', fmt(fl.yaw * 57.3, 3), 'carga', fmt(T.forkLoadKg, 0));
fl.controls.tilt = 1; fl.controls.throttle = 0.5; s.step(2.5); fl.controls.tilt = 0; fl.controls.throttle = 0;
s.step(0.5);
console.log('tras inclinar yaw', fmt(fl.yaw * 57.3, 3), 'carga', fmt(T.forkLoadKg, 0), 'tilt', fmt(T.tiltDeg));
fl.controls.parkingBrake = false; fl.controls.direction = -1; fl.controls.throttle = 0.4;
for (let i = 0; i < 12; i++) {
  s.step(0.25);
  const w = fl.wheels.map((w) => `${w.def.name}:${fmt(w.normalForce / 9.81, 0)}${w.slipping ? '*' : ''}`).join(' ');
  const av = fl.chassis.angvel();
  console.log(`t=${fmt(s.time)} v=${fmt(T.speedKmh)} yaw=${fmt(fl.yaw * 57.3, 2)} wy=${fmt(av.y, 3)} carga=${fmt(T.forkLoadKg, 0)} ${w} rearAx=${fmt(T.rearAxleDeg, 2)} shift=${fmt(T.sideShift, 3)} roll=${fmt(T.rollDeg, 2)}`);
}
