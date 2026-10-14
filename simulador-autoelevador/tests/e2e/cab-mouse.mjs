// Mandos de cabina con el ratón: cinturón, llave, luces, freno de mano, palanca de marcha,
// palanca de elevación (proporcional, vuelve al centro) y volante.
// Uso: node tests/e2e/cab-mouse.mjs
import { openGame, report, OUT } from './browser.mjs';

const { browser, page } = await openGame({ viewport: { width: 1000, height: 620 } });
await page.click('text=Modo libre');
await page.waitForFunction(() => !!window.__app.session, null, { timeout: 60000 });
await page.evaluate(() => { const s = window.__app.session; s.rig.setMode('cabina'); });
const frame = async (n = 1) => { for (let i = 0; i < n; i++) { const t0 = await page.evaluate(() => window.__app.session.elapsed); await page.waitForFunction((t0) => window.__app.session.elapsed > t0, t0, { timeout: 60000, polling: 20 }); } };
const aim = async (id, idx = 0) => {
  await page.evaluate(({ id, idx }) => {
    const s = window.__app.session;
    const ctl = s.model.controls.find((c) => c.id === id);
    const obj = ctl.targets[idx];
    const V = obj.position.constructor;
    const local = s.model.chassis.worldToLocal(obj.getWorldPosition(new V()));
    let yaw = 0, pitch = 0;
    for (let i = 0; i < 5; i++) {
      const lean = Math.sin(yaw) * 0.13, back = (1 - Math.cos(yaw)) * 0.06;
      const d = local.clone().sub(s.model.eye.clone().add(new V(lean, -back * 0.3, -back)));
      yaw = Math.atan2(d.x, d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    }
    s.rig.headYaw = yaw; s.rig.headPitch = Math.max(-1.35, pitch);
  }, { id, idx });
  await frame(2);
  return page.evaluate(({ id, idx }) => {
    const s = window.__app.session;
    const obj = s.model.controls.find((c) => c.id === id).targets[idx];
    const p = obj.getWorldPosition(new obj.position.constructor());
    p.project(s.rig.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }, { id, idx });
};
const state = () => page.evaluate(() => { const fl = window.__app.session.fl; const c = fl.controls; return { ign: c.ignition, run: fl.telemetry.engineRunning, pb: c.parkingBrake, belt: c.seatbelt, dir: c.direction, lift: +c.lift.toFixed(2), forkH: +fl.telemetry.forkHeight.toFixed(3), hw: +c.handwheel.toFixed(2), lights: c.lights, hover: window.__app.session.cab.hover }; });
const results = {};
const click = async (id, check) => {
  const p = await aim(id);
  await page.mouse.move(p.x, p.y); await frame(2);
  const hov = await page.evaluate(() => window.__app.session.cab.hover);
  await page.mouse.down(); await frame(1); await page.mouse.up(); await frame(2);
  const st = await state();
  results[id] = { hover: hov, ok: check(st) };
  console.log(`clic ${id} hover=${hov} →`, JSON.stringify(st));
};
await click('belt', (s) => s.belt === true);
await click('key', (s) => s.ign === true);
await page.waitForFunction(() => window.__app.session.fl.telemetry.engineRunning, null, { timeout: 60000 });
await click('lights', (s) => s.lights === true);
await click('parking', (s) => s.pb === false);
// palanca de marcha: arrastrar hacia arriba = F
let p = await aim('direction');
await page.mouse.move(p.x, p.y); await frame(2); await page.mouse.down(); await frame(1);
for (let i = 1; i <= 6; i++) { await page.mouse.move(p.x, p.y - i * 8); await frame(1); }
await page.mouse.up(); await frame(2);
let st = await state(); results.direction = { ok: st.dir === 1 }; console.log('marcha F:', JSON.stringify(st));
// volver a N (para no moverse) arrastrando hacia abajo un poco
p = await aim('direction');
await page.mouse.move(p.x, p.y); await frame(2); await page.mouse.down(); await frame(1);
for (let i = 1; i <= 3; i++) { await page.mouse.move(p.x, p.y + i * 8); await frame(1); }
await page.mouse.up(); await frame(2);
st = await state(); results.directionN = { ok: st.dir === 0 }; console.log('marcha N:', JSON.stringify(st));
await click('parking', (s) => s.pb === true);
// palanca de elevación: tirar (arrastrar hacia abajo) = subir
p = await aim('lift');
const h0 = (await state()).forkH;
await page.mouse.move(p.x, p.y); await frame(2); await page.mouse.down(); await frame(1);
for (let i = 1; i <= 8; i++) { await page.mouse.move(p.x, p.y + i * 10); await frame(1); }
const tHold = await page.evaluate(() => window.__app.session.elapsed);
await page.waitForFunction((t) => window.__app.session.elapsed > t + 2.5, tHold, { timeout: 120000, polling: 50 });
st = await state(); console.log('elevando:', JSON.stringify(st));
const hUp = st.forkH;
await page.mouse.up(); await frame(3);
st = await state(); console.log('suelta:', JSON.stringify(st));
results.lift = { ok: hUp > h0 + 0.1 && st.lift === 0 };
// volante: agarrar el pomo y girar
const knob = await aim('wheel', 1);
const ctr = await page.evaluate(() => { const s = window.__app.session; const ctl = s.model.controls.find((c) => c.id === 'wheel'); const p = ctl.pivot.getWorldPosition(new ctl.pivot.position.constructor()); p.project(s.rig.camera); return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight }; });
await page.mouse.move(knob.x, knob.y); await frame(2);
const hk = await page.evaluate(() => window.__app.session.cab.hover);
await page.mouse.down(); await frame(1);
const r0 = Math.hypot(knob.x - ctr.x, knob.y - ctr.y);
const a0 = Math.atan2(-(knob.y - ctr.y), knob.x - ctr.x);
for (let i = 1; i <= 16; i++) { const a = a0 + i * 0.25; await page.mouse.move(ctr.x + Math.cos(a) * r0, ctr.y - Math.sin(a) * r0); await frame(1); }
await page.mouse.up(); await frame(2);
st = await state(); console.log(`volante (hover ${hk}):`, JSON.stringify(st));
results.wheel = { hover: hk, ok: Math.abs(st.hw) > 0.2 };
await page.evaluate(() => { const s = window.__app.session; s.rig.headYaw = 0; s.rig.headPitch = -0.26; });
await frame(2);
await page.screenshot({ path: `${OUT}/cabina.png` });
await browser.close();
report(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.ok])));
