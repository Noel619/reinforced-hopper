import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';

const s = await makeScene('puma25');
const { fl } = s;
const T = fl.telemetry;
// calibración: impulso de contacto de un pallet apoyado en el piso
const p0 = addPallet(s, 5, 0.0, 5, 'cajas', 1000);
s.step(1);
let sum = 0;
s.pw.world.contactPairsWith(p0.colliders[1], () => {});
for (const c of p0.colliders) {
  s.pw.world.forEachCollider((o) => {
    if (o.parent() === null) {
      s.pw.world.contactPair(c, o, (m, flipped) => {
        const n = m.normal();
        let imp = 0; for (let i = 0; i < m.numContacts(); i++) imp += m.contactImpulse(i);
        sum += imp * (flipped ? -n.y : n.y);
      });
    }
  });
}
console.log('calibración piso: impulso*n.y/dt/g =', fmt(sum / s.pw.dt / 9.81, 1), 'kg (real', p0.totalMass, ')');

// pallet colocado directamente sobre las horquillas (elevadas 0.3 m)
fl.controls.ignition = true; s.step(1.2);
fl.controls.lift = 1; fl.controls.throttle = 1;
s.step(3, () => { if (T.forkHeight > 0.5) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0;
s.step(0.5);
const qf = fl.rot(fl.forks, new THREE.Quaternion());
const pf = fl.pos(fl.forks, new THREE.Vector3());
const place = new THREE.Vector3(0, 0.0, 0.62).applyQuaternion(qf).add(pf); // centro del pallet 0.62 m por delante de la cara
// la base de los tacos queda 0.1 por debajo del tablero; las horquillas entran en los huecos
const p = addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'cajas', 1000);
for (let k = 0; k < 6; k++) {
  s.step(0.5);
  const pp = new THREE.Vector3().copy(p.body.translation() as THREE.Vector3);
  const loc = pp.sub(fl.pos(fl.forks, new THREE.Vector3())).applyQuaternion(fl.rot(fl.forks, new THREE.Quaternion()).invert());
  console.log(`t=${fmt(s.time)} carga ${fmt(T.forkLoadKg, 0)} kg; pallet en marco horquillas x=${fmt(loc.x, 3)} y=${fmt(loc.y, 3)} z=${fmt(loc.z, 3)} centro=${fmt(T.loadCenter, 3)}`);
}
