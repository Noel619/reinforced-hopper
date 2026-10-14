import * as THREE from 'three';
import { makeScene, addPallet, fmt } from './harness.ts';
const withLoad = process.argv[2] === 'load';
const s = await makeScene('puma25');
const { fl } = s; const T = fl.telemetry;
fl.controls.ignition = true; s.step(1.2);
if (withLoad) {
  fl.controls.lift = 1; fl.controls.throttle = 1;
  s.step(3, () => { if (T.forkHeight > 0.3) fl.controls.lift = 0; });
  fl.controls.lift = 0; fl.controls.throttle = 0; s.step(0.3);
  const qf = fl.rot(fl.forks, new THREE.Quaternion());
  const pf = fl.pos(fl.forks, new THREE.Vector3());
  const place = new THREE.Vector3(0, 0.0, 0.62).applyQuaternion(qf).add(pf);
  addPallet(s, place.x, pf.y - 0.1 + 0.003, place.z, 'cajas', 1000);
  s.step(1);
}
const log = (lbl: string) => {
  const av = fl.chassis.angvel();
  console.log(`${lbl} t=${fmt(s.time)} yaw=${fmt(fl.yaw * 57.3, 3)} wy=${fmt(av.y, 4)} lift=${fmt(T.liftPos, 3)} tilt=${fmt(T.tiltDeg, 2)} carga=${fmt(T.forkLoadKg, 0)} slip=${fl.wheels.map(w=>w.slipping?1:0).join('')} pos=(${fmt(fl.position.x,3)},${fmt(fl.position.z,3)})`);
};
log('inicio');
fl.controls.lift = 1; fl.controls.throttle = 0.6; s.step(1); log('elevando'); s.step(1); log('elevando');
fl.controls.lift = 0; s.step(1); log('quieto');
fl.controls.tilt = 1; s.step(1); log('incl atrás'); s.step(1); log('incl atrás');
fl.controls.tilt = -1; s.step(2); log('incl adelante');
fl.controls.tilt = 0; fl.controls.sideShift = 1; s.step(1.5); log('desplazador');
fl.controls.sideShift = -1; s.step(3); log('desplazador');
fl.controls.sideShift = 0; s.step(2); log('quieto');
