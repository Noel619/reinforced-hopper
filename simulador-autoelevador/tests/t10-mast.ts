import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
const mass = Number(process.argv[2] ?? 2500);
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
fl.controls.ignition = true; s.step(1.2);
fl.controls.lift = 1; fl.controls.throttle = 1;
s.step(3, () => { if (T.forkHeight > 0.25) fl.controls.lift = 0; });
fl.controls.lift = 0; fl.controls.throttle = 0; s.step(0.3);
const qf = fl.rot(fl.forks, new THREE.Quaternion());
const pf = fl.pos(fl.forks, new THREE.Vector3());
const place = new THREE.Vector3(0, 0, 0.6).applyQuaternion(qf).add(pf);
const p = addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'bobina', mass);
s.step(1);
const report = (lbl: string) => {
  const qc = fl.rot(fl.chassis, new THREE.Quaternion()); const pc = fl.pos(fl.chassis, new THREE.Vector3());
  const inv = qc.clone().invert();
  const loc = (b: any) => fl.pos(b, new THREE.Vector3()).sub(pc).applyQuaternion(inv);
  const pl = new THREE.Vector3().copy(p.body.worldCom() as any).sub(pc).applyQuaternion(inv);
  const car = loc(fl.carriage); const mast = loc(fl.mast);
  const qm = fl.rot(fl.mast, new THREE.Quaternion()); const qcar = fl.rot(fl.carriage, new THREE.Quaternion());
  const relCar = qm.clone().invert().multiply(qcar);
  console.log(`${lbl}: forkH ${fmt(T.forkHeight)} tilt ${fmt(T.tiltDeg,2)} (cmd ${fmt(fl.tiltCmd,2)}) carro-vs-mástil rotX ${fmt(2*Math.atan2(relCar.x, relCar.w)*57.3,2)}° carro z ${fmt(car.z,3)} mast z ${fmt(mast.z,3)} loadCOM z ${fmt(pl.z,3)} y ${fmt(pl.y,2)} rearFrac ${fmt(T.rearLoadFrac,3)} pitch ${fmt(T.pitchDeg,2)} carga ${fmt(T.forkLoadKg,0)}`);
};
report('0.25 m');
fl.controls.lift = 1; fl.controls.throttle = 1;
for (const h of [1, 2, 3]) {
  s.step(8, () => { if (T.forkHeight > h) fl.controls.lift = 0; });
  report(`${h} m`);
  fl.controls.lift = 1;
}
