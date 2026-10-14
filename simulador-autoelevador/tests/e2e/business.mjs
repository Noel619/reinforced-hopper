// Prueba de punta a punta del modo "Mi Almacén": descarga física de un pallet con el piloto
// automático, cobro por almacenaje, pedido completo, cierre del día, guardado, tienda y despacho.
// Uso: node tests/e2e/business.mjs [velocidad]
import { openGame, injectAutopilot, report, OUT } from './browser.mjs';

const speed = Number(process.argv[2] ?? 3);
const { browser, page } = await openGame();
const DIR_SHOTS = OUT;
await page.evaluate(() => localStorage.removeItem('autoelevador.almacen.v1'));
await page.click('text=Mi Almacén');
await page.waitForTimeout(400);
await page.click('text=Empezar');
await page.waitForSelector('text=Comenzar jornada', { timeout: 60000 });
await page.click('text=Comenzar jornada');
await injectAutopilot(page);
const R = {};
const setup = async () => page.evaluate((speed) => {
  const app = window.__app;
  app.debug.noRender = true;
  app.debug.maxSteps = 80;
  const s = app.session;
  s.timeScale = speed;
  // sin peatones para la prueba
  const peds = s.world.peds;
  if (peds) {
    for (const p of peds.list) { s.world.pw.world.removeRigidBody(p.body); p.group.removeFromParent(); }
    peds.list.length = 0;
  }
  AP.install();
}, speed);
await setup();

// ---------------------------------------------------------------- día 1: recepción
const day1 = await page.evaluate(async () => {
  const s = AP.s(); const m = s.mode; const fl = s.fl; const c = fl.controls;
  const log = (...a) => console.log('[AP]', ...a);
  const o = m.orders.find((x) => x.kind === 'recepcion');
  const origEv = m.onEvent.bind(m);
  m.onEvent = (e, ss) => { if (e.type === 'collision' || e.type === 'violation' || e.type === 'palletImpact') log('evento', JSON.stringify(e), 'pos', fl.position.x.toFixed(2), fl.position.z.toFixed(2), 'forkH', fl.telemetry.forkHeight.toFixed(2)); origEv(e, ss); };
  const money0 = m.state.money;
  m.clock = o.arrival - 0.3;
  await AP.until(() => o.status === 'en_bahia', 20, 'llegada');
  const bay = m.wh.bays.find((b) => b.orderId === o.id);
  const t = bay.truck;
  const pals = [...s.world.pallets.values()].filter((e) => m.tracked.get(e.id)?.inboundOrder === o.id);
  log('pedido', o.id, 'bahía', bay.id, 'pallets', pals.length, 'camión', t.center.x, t.center.z);
  // pallet del lado cercano más próximo al portón
  const near = pals.filter((e) => e.curPos.z > t.center.z).sort((a, b) => Math.abs(a.curPos.x - bay.center.x) - Math.abs(b.curPos.x - bay.center.x));
  const P = near[0];
  const px = P.curPos.x, pz = P.curPos.z;
  const face = pz + P.phys.type.length / 2;
  log('pallet', P.id, P.phys.cargo.id, P.phys.totalMass, 'kg en', px.toFixed(2), pz.toFixed(2), 'cara', face.toFixed(2));
  fl.startEngineImmediately(); c.seatbelt = true; c.parkingBrake = false;
  const S = Math.PI;
  AP.lift = 0.15; AP.tilt = 0;
  await AP.goPath([{ x: -15, z: -9.8 }, { x: -11.6, z: -12.5 }, { x: -11, z: -16.5 }, { x: px, z: face + 3.0 }], { speed: 1.0, lookahead: 1.4, arrive: 0.15, timeout: 90 });
  await AP.goPath([{ x: px, z: face + 2.2 }], { speed: 0.5, lookahead: 1.0, arrive: 0.06 });
  await AP.liftTo(t.bedHeight + 0.06, 0.006);
  await AP.goPath([AP.axleFor(px, face - 0.02, S)], { speed: 0.3, arrive: 0.03, lookahead: 1.0 });
  await AP.liftTo(t.bedHeight + 0.2, 0.01);
  await AP.frames(10);
  const carried = fl.carried.has(P.phys.body.handle);
  log('tomado del camión', carried, 'carga', fl.telemetry.forkLoadKg.toFixed(0));
  await AP.goPath([{ x: px, z: face + 2.4 }], { reverse: true, speed: 0.4, arrive: 0.1 });
  await AP.liftTo(0.15, 0.02);
  await AP.tiltTo(3);
  await AP.goPath([{ x: -11, z: -18.5 }, { x: -11, z: -13.5 }, { x: -11, z: -10 }], { reverse: true, speed: 0.8, lookahead: 1.4, arrive: 0.25, timeout: 90 });
  log('adentro', fl.position.x.toFixed(1), fl.position.z.toFixed(1), 'yaw', (fl.yaw * 57.3).toFixed(0));
  const E = Math.PI / 2;
  const drop = { x: 18.4, z: 0.5 };
  await AP.goPath([{ x: -8.5, z: -12.6 }, { x: 0, z: -12.6 }, { x: 10, z: -12.3 }, { x: 13.4, z: -9 }, { x: 13.4, z: -2.5 }, { x: 15.2, z: drop.z }, AP.axleFor(drop.x - 0.6, drop.z, E)], { speed: 1.0, lookahead: 1.5, arrive: 0.08, timeout: 150 });
  await AP.tiltTo(0);
  await AP.liftTo(0.065, 0.012);
  await AP.frames(20);
  await AP.goPath([{ x: 14.8, z: drop.z }], { reverse: true, speed: 0.5, arrive: 0.1 });
  await AP.frames(60);
  const tr = m.tracked.get(P.id);
  log('pallet en piso', P.curPos.x.toFixed(2), P.curPos.z.toFixed(2), 'pagado', tr.inboundPaid, 'dinero', m.state.money);
  const paidPhysical = tr.inboundPaid && m.state.money > money0;
  // el resto del camión: se ubican directamente en la zona de estiba (prueba de la lógica del pedido)
  const z = m.wh.zones.piso;
  let k = 0;
  for (const e of pals) {
    if (e === P) continue;
    const x = z.center.x + 1.4 - (k % 3) * 1.4 + 1.6, zz = z.center.z - 4 + Math.floor(k / 3) * 1.6;
    k++;
    const b = e.phys.body;
    b.setTranslation({ x: Math.min(x, 23), y: 0.003, z: zz }, true);
    b.setRotation({ x: 0, y: Math.sin(E / 2), z: 0, w: Math.cos(E / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  await AP.until(() => o.status === 'completado', 30, 'pedido completo');
  await AP.until(() => !bay.truck, 30, 'camión se va');
  log('pedido', o.id, o.status, 'dinero', m.state.money, 'pallets almacenados', [...m.tracked.values()].filter((x) => x.inboundPaid).length);
  return { paidPhysical, carried, completed: o.status === 'completado', money: m.state.money, money0, n: pals.length };
});
console.log('día 1:', JSON.stringify(day1));
R.unloadPhysical = day1.carried && day1.paidPhysical;
R.orderCompleted = day1.completed;
await page.evaluate(() => { window.__app.debug.noRender = false; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${DIR_SHOTS}/biz-day1.png` });
await page.evaluate(() => { window.__app.debug.noRender = true; });

// ---------------------------------------------------------------- fin del día (desde el menú de pausa)
await page.evaluate(() => { const s = window.__app.session; s.mode.pauseItems(s)[0].action(); });
await page.waitForSelector('text=Resultado del día 1', { timeout: 60000 });
const ledger = await page.evaluate(() => [...document.querySelectorAll('.ledger tr')].map((tr) => tr.textContent.trim()));
console.log('libro diario:', JSON.stringify(ledger));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('autoelevador.almacen.v1')));
console.log('guardado: día', saved.day, 'dinero', saved.money, 'inventario', saved.inventory.length, 'stats', JSON.stringify(saved.stats));
R.dayEnd = saved.day === 2 && saved.inventory.length === day1.n && ledger.some((l) => l.includes('Alquiler'));
await page.screenshot({ path: `${DIR_SHOTS}/biz-dayend.png` });

// ---------------------------------------------------------------- tienda
await page.click('.biz-modal >> text=Tienda');
await page.waitForSelector('.shop', { timeout: 30000 });
await page.click('.shop >> text=Accesorios');
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('autoelevador.almacen.v1')).money);
const card = page.locator('.shop-card', { hasText: 'Indicador de altura' });
await card.locator('button', { hasText: 'Comprar' }).click();
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('autoelevador.almacen.v1')));
console.log('tienda: dinero', before, '→', after.money, 'comprado', JSON.stringify(after.owned));
R.shop = after.owned.includes('altura') && after.money === before - 900;
await page.click('.shop >> text=Listo');
await page.waitForSelector('text=Resultado del día 1', { timeout: 30000 });
await page.click('.biz-modal >> text=Día 2');

// ---------------------------------------------------------------- día 2: despacho
await page.waitForSelector('text=Comenzar jornada', { timeout: 60000 });
const plan2 = await page.evaluate(() => { const m = window.__app.session.mode; return { orders: m.orders.map((o) => `${o.id}:${o.kind}:${o.client}:${o.total}`), inv: window.__app.session.world.pallets.size, height: window.__app.session.hud.opts.showHeight }; });
console.log('día 2:', JSON.stringify(plan2));
R.inventoryRestored = plan2.inv === day1.n;
R.accessoryApplied = plan2.height === true;
await page.click('text=Comenzar jornada');
await injectAutopilot(page);
await setup();
const day2 = await page.evaluate(async () => {
  const s = AP.s(); const m = s.mode;
  const log = (...a) => console.log('[AP]', ...a);
  const o = m.orders.find((x) => x.kind === 'despacho');
  if (!o) return { skipped: true };
  const money0 = m.state.money;
  m.clock = o.arrival - 0.3;
  await AP.until(() => o.status === 'en_bahia', 20, 'llegada despacho');
  const bay = m.wh.bays.find((b) => b.orderId === o.id);
  const t = bay.truck;
  log('despacho', o.id, JSON.stringify(o.request), 'bahía', bay.id);
  // elegir pallets del cliente según el pedido y subirlos a la caja
  const need = new Map(o.request.map((r) => [r.cargo, r.qty]));
  const slots = t.slots.filter((x) => x.id.includes('-D'));
  let k = 0;
  const moved = [];
  for (const e of s.world.pallets.values()) {
    const tr = m.tracked.get(e.id);
    const left = need.get(tr.cargo) ?? 0;
    // sólo del inventario (no de camiones de recepción que estén en otra bahía)
    if (tr.client !== o.client || left <= 0 || !tr.inboundPaid) continue;
    need.set(tr.cargo, left - 1);
    const sl = slots[k++];
    moved.push(e.id);
    const b = e.phys.body;
    b.setTranslation({ x: sl.center.x, y: sl.center.y + 0.003, z: sl.center.z }, true);
    b.setRotation({ x: 0, y: Math.sin(sl.yaw / 2), z: 0, w: Math.cos(sl.yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  await AP.until(() => o.status === 'completado', 30, 'despacho completo');
  await AP.until(() => !bay.truck, 30, 'camión se va');
  log('despacho', o.id, o.status, 'dinero', money0, '→', m.state.money);
  // los pallets despachados se van con el camión
  const gone = moved.every((id) => !s.world.pallets.has(id));
  return { completed: o.status === 'completado', paid: m.state.money > money0, gone, moved: moved.length, total: o.total };
});
console.log('día 2 despacho:', JSON.stringify(day2));
R.dispatch = day2.skipped ? 'sin despacho hoy' : day2.completed && day2.paid && day2.gone && day2.moved === day2.total;
await browser.close();
report(R);
