const ctx = AP.s().mode.ctx;
c.parkingBrake = false; c.direction = 1;
AP.lift = 0.15;
const pts = [];
for (let i = 0; i < 7; i++) {
  const gz = i % 2 ? -53.2 : -50.8;
  pts.push({ x: -42 + i * 4.5 + 0.825, z: gz });
}
pts.push({ x: -10.5, z: -51.0 }, { x: 0.5, z: -51.0 });
await AP.goPath(pts, { speed: 1.4, arrive: 0.3, lookahead: 1.6 });
log('slalom', JSON.stringify(AP.lessonState()), 'gate', refs.data.gate);
const arc = [];
for (let k = 0; k <= 8; k++) { const th = (k / 8) * Math.PI / 2; arc.push({ x: -2 - 4 * Math.sin(th), z: -55 + 4 * Math.cos(th) }); }
await AP.goPath([{ x: -2, z: -51.0 }, ...arc, { x: -6, z: -55.375 }], { reverse: true, speed: 0.8, arrive: 0.12, lookahead: 1.4 });
log('estacionado', JSON.stringify(AP.lessonState()), 'yaw', (AP.fl().yaw * 57.3).toFixed(1), 'full', ctx.forkliftFullyIn(refs.zones.box));
AP.lift = 0.06;
c.direction = 0; c.parkingBrake = true;
await AP.frames(90);
