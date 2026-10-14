const P = refs.pallets.p;
const W = -Math.PI / 2, S = Math.PI;
const ctx = AP.s().mode.ctx;
c.parkingBrake = false; c.direction = 1;
AP.lift = 0.05;
// aproximación recta al pallet (eje delantero)
const ins = AP.axleFor(-7.63, 8.5, W);
await AP.goPath([{ x: -3.0, z: 8.5 }, { x: ins.x + 1.6, z: 8.5 }, ins], { speed: 1.0, arrive: 0.03 });
log('insertado', JSON.stringify(AP.lessonState()), 'gap', ctx.insertionGap(P).toFixed(3), 'touch', ctx.touching(P));
await AP.liftTo(0.2);
await AP.tiltTo(4);
log('elevado', JSON.stringify(AP.lessonState()), 'carried', ctx.carried(P), 'load', T.forkLoadKg.toFixed(0));
// retroceder recto
await AP.goPath([{ x: -2.4, z: 8.5 }], { reverse: true, speed: 0.9, arrive: 0.2 });
// girar a la derecha hacia el sur y bajar hasta el destino
const dst = AP.axleFor(-3.4, 4.3, S);
await AP.goPath([{ x: -3.6, z: 8.2 }, { x: -3.4, z: 6.8 }, dst], { speed: 0.8, arrive: 0.06, lookahead: 1.0 });
log('en destino', JSON.stringify(AP.lessonState()), 'pallet', P.curPos.x.toFixed(2), P.curPos.z.toFixed(2));
await AP.tiltTo(0);
await AP.liftTo(0.06, 0.012);
await AP.frames(30);
log('apoyado', JSON.stringify(AP.lessonState()), 'carried', ctx.carried(P));
await AP.goPath([{ x: -3.4, z: 6.8 }], { reverse: true, speed: 0.5, arrive: 0.15 });
c.parkingBrake = true; await AP.frames(40);
