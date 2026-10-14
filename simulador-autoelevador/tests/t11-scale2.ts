import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
fl.controls.ignition = true; s.step(1.2);
fl.controls.lift = 1; fl.controls.throttle = 1;
s.step(3, () => { if (T.forkHeight > 0.25) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0; s.step(0.3);
const qf = fl.rot(fl.forks, new THREE.Quaternion());
const pf = fl.pos(fl.forks, new THREE.Vector3());
const place = new THREE.Vector3(0, 0, 0.6).applyQuaternion(qf).add(pf);
addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'bobina', 2500);
s.step(1);
fl.controls.lift = 1; fl.controls.throttle = 1;
s.step(8, () => { if (T.forkHeight > 1) fl.controls.lift = 0; });
const w = s.pw.world;
for (let k = 0; k < 5; k++) {
  s.step(0.05);
  let line = `t=${fmt(s.time)} carga=${fmt(T.forkLoadKg,0)} |`;
  for (const fc of (fl as any).loadSensingColliders) {
    w.contactPairsWith(fc, (o: any) => {
      w.contactPair(fc, o, (m: any, flipped: boolean) => {
        const n = m.normal();
        const imps: string[] = [];
        let imp = 0; for (let i = 0; i < m.numContacts(); i++) { imp += m.contactImpulse(i); imps.push(fmt(m.contactImpulse(i)/s.pw.dt/9.81,0)); }
        if (imp > 1e-6) line += ` n=(${fmt(n.x,2)},${fmt(n.y,2)},${fmt(n.z,2)})${flipped?'F':''} [${imps.join(',')}] dist=${fmt(m.contactDist(0),4)}`;
      });
    });
  }
  console.log(line);
}
