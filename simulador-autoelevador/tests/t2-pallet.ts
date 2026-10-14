import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
function rel(s: any, p: any) {
  const fl = s.fl;
  const pp = new THREE.Vector3().copy(p.body.translation());
  const loc = pp.sub(fl.pos(fl.forks, new THREE.Vector3())).applyQuaternion(fl.rot(fl.forks, new THREE.Quaternion()).invert());
  const q = new THREE.Quaternion().copy(p.body.rotation());
  const up = new THREE.Vector3(0,1,0).applyQuaternion(q);
  return `rel(x=${fmt(loc.x,3)} y=${fmt(loc.y,3)} z=${fmt(loc.z,3)} upY=${fmt(up.y,3)})`;
}

const mass = Number(process.argv[2] ?? 1000);
const s = await makeScene('puma25');
const { fl } = s;
const T = fl.telemetry;
const p = addPallet(s, 0, 0.0, 2.6, 'cajas', mass);
s.step(1.5);
console.log('pallet y', fmt(p.body.translation().y, 4), 'masa', p.totalMass);
fl.controls.ignition = true; s.step(1.2);
fl.controls.parkingBrake = false; fl.controls.direction = 1;
// acercarse con creep y freno parcial
s.step(20, () => {
  const faceZ = fl.position.z + 0.48;
  if (faceZ > 1.98) { fl.controls.brake = 1; } else { fl.controls.brake = T.speed > (faceZ > 1.5 ? 0.25 : 0.6) ? 0.12 : 0; }
});
console.log('posición', fmt(fl.position.z, 3), 'v', fmt(T.speedKmh), 'pallet z', fmt(p.body.translation().z, 3), 'carga medida', fmt(T.forkLoadKg, 0));
fl.controls.direction = 0; fl.controls.brake = 0; fl.controls.parkingBrake = true;
// elevar 15 cm
fl.controls.lift = 1; fl.controls.throttle = 0.6;
s.step(4, () => { if (T.forkHeight > 0.2) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0;
s.step(1);
const pp = p.body.translation();
console.log(rel(s,p)); console.log('tras elevar: forkH', fmt(T.forkHeight, 3), 'pallet y', fmt(pp.y, 3), 'carga medida', fmt(T.forkLoadKg, 0), 'kg (real', p.totalMass, ') centro carga', fmt(T.loadCenter, 3), 'rearFrac', fmt(T.rearLoadFrac));
fl.controls.tilt = 1; fl.controls.throttle = 0.5; s.step(2.5); fl.controls.tilt = 0; fl.controls.throttle = 0;
console.log('incl', fmt(T.tiltDeg), 'carga', fmt(T.forkLoadKg, 0), 'rearFrac', fmt(T.rearLoadFrac));
// marcha atrás y giro
fl.controls.parkingBrake = false; fl.controls.direction = -1; fl.controls.throttle = 0.4;
s.step(3);
console.log(rel(s,p), 'yaw', fmt(fl.yaw*57.3)); console.log('reversa: v', fmt(T.speedKmh), 'pallet rel z', fmt(p.body.translation().z - fl.position.z, 3), 'carga', fmt(T.forkLoadKg, 0));
fl.controls.handwheel = -1; s.step(4);
console.log('giro en reversa: yaw', fmt(fl.yaw), 'carga', fmt(T.forkLoadKg, 0), 'latBal', fmt(T.lateralBalance));
fl.controls.handwheel = 0; fl.controls.throttle = 0; fl.controls.brake = 1; s.step(2); fl.controls.brake = 0;
// adelante con carga a 10 km/h y frenada fuerte
fl.controls.direction = 1; fl.controls.throttle = 1; s.step(3);
console.log('adelante: v', fmt(T.speedKmh), 'carga', fmt(T.forkLoadKg, 0));
fl.controls.throttle = 0; fl.controls.brake = 1;
let minRear = 1;
s.step(2, () => { minRear = Math.min(minRear, T.rearLoadFrac); });
const pr = p.body.translation();
const fpos = fl.position;
console.log(rel(s,p)); console.log('frenada: min rearFrac', fmt(minRear), 'pallet rel', fmt(Math.hypot(pr.x - fpos.x, pr.z - fpos.z), 3), 'carga', fmt(T.forkLoadKg, 0), 'pitch', fmt(T.pitchDeg));
// bajar y depositar
fl.controls.brake = 0; fl.controls.direction = 0; fl.controls.parkingBrake = true;
fl.controls.tilt = -1; fl.controls.throttle = 0.5; s.step(1.5); fl.controls.tilt = 0;
fl.controls.lift = -1; s.step(2); fl.controls.lift = 0;
console.log('depositado: forkH', fmt(T.forkHeight, 3), 'pallet y', fmt(p.body.translation().y, 3), 'carga', fmt(T.forkLoadKg, 0));
