import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
fl.controls.ignition = true; s.step(1.2);
fl.controls.lift = 1; fl.controls.throttle = 1;
s.step(3, () => { if (T.forkHeight > 0.3) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0; s.step(0.3);
const qf = fl.rot(fl.forks, new THREE.Quaternion());
const pf = fl.pos(fl.forks, new THREE.Vector3());
const place = new THREE.Vector3(0, 0.0, 0.62).applyQuaternion(qf).add(pf);
const p = addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'cajas', 1000);
s.step(1);
function dump(label: string) {
  const w = s.pw.world;
  console.log(label, 'carga', fmt(T.forkLoadKg, 0));
  for (const fc of (fl as any).loadSensingColliders) {
    w.contactPairsWith(fc, (o: any) => {
      w.contactPair(fc, o, (m: any, flipped: boolean) => {
        const n = m.normal();
        let imp = 0; for (let i = 0; i < m.numContacts(); i++) imp += m.contactImpulse(i);
        if (imp > 1e-6) console.log(`  fc ${fc.handle} -> ${o.handle} flipped=${flipped} n=(${fmt(n.x,2)},${fmt(n.y,2)},${fmt(n.z,2)}) imp/dt/g=${fmt(imp / s.pw.dt / 9.81, 1)} contacts=${m.numContacts()} solver=${m.numSolverContacts()}`);
      });
    });
  }
}
dump('antes');
fl.controls.sideShift = 1; s.step(1.5); fl.controls.sideShift = 0; s.step(1);
dump('después');
const pp = new THREE.Vector3().copy(p.body.translation() as any);
console.log('pallet rel x', fmt(pp.sub(fl.pos(fl.forks, new THREE.Vector3())).applyQuaternion(fl.rot(fl.forks, new THREE.Quaternion()).invert()).x, 3), 'shift', fmt(T.sideShift, 3));
