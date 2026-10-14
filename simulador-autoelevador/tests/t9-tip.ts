import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';

async function loaded(mass: number, zOffset: number, height: number) {
  const s = await makeScene('puma25');
  const { fl } = s; const T = fl.telemetry;
  fl.controls.ignition = true; s.step(1.2);
  fl.controls.lift = 1; fl.controls.throttle = 1;
  s.step(3, () => { if (T.forkHeight > 0.25) fl.controls.lift = 0; });
  fl.controls.lift = 0; fl.controls.throttle = 0; s.step(0.3);
  const qf = fl.rot(fl.forks, new THREE.Quaternion());
  const pf = fl.pos(fl.forks, new THREE.Vector3());
  const place = new THREE.Vector3(0, 0, zOffset).applyQuaternion(qf).add(pf);
  const p = addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'bobina', mass);
  s.step(1);
  console.log(`  carga ${fmt(T.forkLoadKg,0)} kg centro ${fmt(T.loadCenter,2)} rearFrac ${fmt(T.rearLoadFrac)}`);
  fl.controls.lift = 1; fl.controls.throttle = 1;
  let minRear = 1;
  s.step(10, () => { minRear = Math.min(minRear, T.rearLoadFrac); if (T.forkHeight > height) fl.controls.lift = 0; });
  fl.controls.lift = 0; fl.controls.throttle = 0;
  return { s, fl, T, p, minRear };
}

console.log('A) 2500 kg con CDG en la punta (1.0 m) elevando a 1 m');
{
  const { T, minRear, fl } = await loaded(2500, 1.0, 1.0);
  console.log(`  forkH ${fmt(T.forkHeight)} minRearFrac ${fmt(minRear)} pitch ${fmt(T.pitchDeg)} volcado ${T.tippedOver} relief ${T.reliefActive} cmd ${fmt(fl.liftCmd,2)}`);
}
console.log('B) 2500 kg centrado (0.6 m) elevando a 3 m');
{
  const { T, minRear } = await loaded(2500, 0.6, 3.0);
  console.log(`  forkH ${fmt(T.forkHeight)} minRearFrac ${fmt(minRear)} pitch ${fmt(T.pitchDeg)} volcado ${T.tippedOver}`);
}
console.log('C) 3400 kg centrado: válvula de alivio');
{
  const { T, minRear } = await loaded(3400, 0.6, 1.0);
  console.log(`  forkH ${fmt(T.forkHeight)} minRearFrac ${fmt(minRear)} relief ${T.reliefActive}`);
}
console.log('D) 1000 kg a 3 m, avanzar a ~9 km/h y girar fuerte');
{
  const { s, fl, T, p } = await loaded(1000, 0.6, 3.0);
  fl.controls.parkingBrake = false; fl.controls.direction = 1; fl.controls.throttle = 1;
  s.step(6, () => { if (T.speedKmh > 9) fl.controls.throttle = 0.3; });
  console.log(`  v ${fmt(T.speedKmh)} forkH ${fmt(T.forkHeight)}`);
  fl.controls.handwheel = 1;
  let maxRoll = 0; let minLat = 1;
  s.step(4, () => { maxRoll = Math.max(maxRoll, Math.abs(T.rollDeg)); minLat = Math.min(minLat, 1 - Math.abs(T.lateralBalance)); });
  const pq = p.body.rotation();
  console.log(`  maxRoll ${fmt(maxRoll)}° volcado ${T.tippedOver} latMargin min ${fmt(minLat)} rearAxle ${fmt(T.rearAxleDeg)} palletUp ${fmt(new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(pq.x,pq.y,pq.z,pq.w)).y)}`);
}
console.log('E) 1000 kg a 0.2 m, mismo giro a ~9 km/h');
{
  const { s, fl, T } = await loaded(1000, 0.6, 0.2);
  fl.controls.parkingBrake = false; fl.controls.direction = 1; fl.controls.throttle = 1;
  s.step(6, () => { if (T.speedKmh > 9) fl.controls.throttle = 0.3; });
  fl.controls.handwheel = 1;
  let maxRoll = 0;
  s.step(4, () => { maxRoll = Math.max(maxRoll, Math.abs(T.rollDeg)); });
  console.log(`  v ${fmt(T.speedKmh)} maxRoll ${fmt(maxRoll)}° volcado ${T.tippedOver} carga ${fmt(T.forkLoadKg,0)}`);
}
