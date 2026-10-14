const ctx = AP.s().mode.ctx;
const S = Math.PI;
c.parkingBrake = false; c.direction = 1;
const px0 = [refs.pallets.p0.curPos.x, refs.pallets.p1.curPos.x, refs.pallets.p2.curPos.x];
for (let i = 0; i < 3; i++) {
  const P = refs.pallets[`p${i}`];
  const slot = refs.slots[`t${i}`];
  const px = px0[i];
  AP.lift = 0.06; AP.tilt = 0;
  await AP.goPath([{ x: px, z: -7.6 }, AP.axleFor(px, -12.02, S)], { speed: 0.8, arrive: 0.03, lookahead: 1.0 });
  await AP.liftTo(0.2); await AP.tiltTo(3);
  log(`p${i} tomado`, JSON.stringify(AP.lessonState()), ctx.carried(P));
  await AP.goPath([{ x: px, z: -7.4 }], { reverse: true, speed: 0.7, arrive: 0.1 });
  // rodear la fila por el este y salir por el portón
  await AP.goPath([{ x: -9.0, z: -9.6 }, { x: -9.0, z: -15.0 }, { x: -14, z: -17.8 }, { x: -14, z: -20.8 }, { x: slot.center.x, z: -25.6 }], { speed: 1.0, arrive: 0.1, lookahead: 1.4 });
  await AP.liftTo(1.52, 0.01);
  await AP.goPath([AP.axleFor(slot.center.x, slot.center.z + 0.6, S)], { speed: 0.35, arrive: 0.03, lookahead: 1.0 });
  await AP.tiltTo(0);
  await AP.liftTo(1.3 + 0.065, 0.006);
  await AP.frames(30);
  log(`p${i} apoyado`, JSON.stringify(AP.lessonState()), 'y', P.curPos.y.toFixed(3), 'carried', ctx.carried(P));
  await AP.goPath([{ x: slot.center.x, z: -25.8 }], { reverse: true, speed: 0.4, arrive: 0.08 });
  await AP.liftTo(0.2, 0.03);
  if (i < 2) {
    await AP.goPath([{ x: -14, z: -20.8 }, { x: -14, z: -17.8 }, { x: -9.0, z: -15.0 }, { x: -9.0, z: -8.0 }, { x: -9.5, z: -5.2 }], { reverse: true, speed: 0.9, arrive: 0.2, lookahead: 1.4 });
  }
}
await AP.goPath([{ x: -14, z: -22 }], { reverse: true, speed: 0.8, arrive: 0.2 });
c.parkingBrake = true;
await AP.frames(60);
