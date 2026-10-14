import { makeScene, fmt } from './harness.ts';
for (const dir of [1, -1] as const) {
  const s = await makeScene('puma25');
  const { fl } = s; const T = fl.telemetry;
  fl.controls.ignition = true; s.step(1.2);
  fl.controls.parkingBrake = false; fl.controls.direction = dir; fl.controls.throttle = 0.5;
  for (let k = 0; k < 6; k++) {
    s.step(1);
    console.log(`dir ${dir} t=${fmt(s.time,1)} v=${fmt(T.speedKmh)} yaw=${fmt(fl.yaw*57.3,3)}° x=${fmt(fl.position.x,3)} steer=${fmt(T.steerDeg,3)} rearAxle=${fmt(T.rearAxleDeg,3)} loads=${T.wheelLoads.map(f=>fmt(f/9.81,0)).join(',')}`);
  }
}
