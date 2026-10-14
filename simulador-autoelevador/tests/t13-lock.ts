import { makeScene, fmt } from './harness.ts';
for (const [hw, thr, inch] of [[-1, 0.4, 0.35], [-1, 0.4, 0], [-0.9, 0.4, 0.35], [1, 0.4, 0.35], [0, 0.4, 0.35]]) {
  const s = await makeScene('puma25');
  const { fl } = s; const T = fl.telemetry;
  fl.controls.ignition = true; s.step(1.2);
  fl.controls.handwheel = hw; s.step(1.5);
  fl.controls.parkingBrake = false; fl.controls.direction = 1; fl.controls.throttle = thr; fl.controls.inching = inch;
  const y0 = fl.yaw;
  s.step(3);
  console.log(`hw=${hw} thr=${thr} inch=${inch}: v=${fmt(T.speedKmh)} dyaw=${fmt((fl.yaw - y0) * 57.3, 1)}° drive=${fmt(T.driveForce, 0)} steer=${fmt(T.steerDeg, 0)} slip=${fl.wheels.map(w=>w.slipping?1:0).join('')} anchors=${fl.wheels.map(w=>w.anchorSet?1:0).join('')}`);
}
