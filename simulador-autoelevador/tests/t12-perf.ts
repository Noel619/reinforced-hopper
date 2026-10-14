import { makeScene, addPallet, fmt } from './harness.ts';
import { addStaticBox } from '../src/sim/physics.ts';
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
// 120 pallets en racks (estáticos de rack simplificados)
for (let r = 0; r < 4; r++) {
  for (let bay = 0; bay < 10; bay++) {
    for (let lvl = 0; lvl < 3; lvl++) {
      const x = -20 + bay * 2.8, z = 10 + r * 4, y = lvl * 1.6;
      if (lvl > 0) { addStaticBox(s.pw, x, y - 0.06, z - 0.45, 1.4, 0.06, 0.03); addStaticBox(s.pw, x, y - 0.06, z + 0.45, 1.4, 0.06, 0.03); }
      addPallet(s, x - 0.6, y + 0.001, z, 'cajas', 400, Math.PI / 2);
      addPallet(s, x + 0.6, y + 0.001, z, 'cajas', 400, Math.PI / 2);
    }
  }
}
console.log('pallets', s.pallets.length);
let t0 = performance.now();
s.step(2);
console.log('asentamiento 2s:', fmt((performance.now() - t0) / 240, 3), 'ms/tick');
fl.controls.ignition = true; s.step(1.2);
fl.controls.parkingBrake = false; fl.controls.direction = 1; fl.controls.throttle = 0.5;
t0 = performance.now();
s.step(3);
console.log('conduciendo 3s:', fmt((performance.now() - t0) / 360, 3), 'ms/tick', 'v', fmt(T.speedKmh));
let awake = 0; s.pw.world.forEachActiveRigidBody(() => awake++);
console.log('cuerpos activos', awake);
