// Joystick tipo PlayStation simulado (Gamepad API, mapeo estándar): menús, arranque,
// hidráulica con el stick derecho, desplazador, marcha, acelerador, volante, mirar con R3 y pausa.
// Uso: node tests/e2e/gamepad.mjs
import { openGame, report, OUT } from './browser.mjs';

const { browser, page } = await openGame({
  viewport: { width: 1000, height: 620 },
  initScript: () => {
  const pad = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
  window.__pad = pad;
  navigator.getGamepads = () => [pad, null, null, null];
},
});
const frames = async (n = 1) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const press = async (b, hold = 1) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, touched: true, value: 1 }; }, b); await frames(hold); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, touched: false, value: 0 }; }, b); await frames(1); };
const setAxis = (i, v) => page.evaluate(([i, v]) => { window.__pad.axes[i] = v; }, [i, v]);
const setBtn = (b, v) => page.evaluate(([b, v]) => { window.__pad.buttons[b] = { pressed: v > 0.5, touched: v > 0, value: v }; }, [b, v]);
const focused = () => page.evaluate(() => document.querySelector('.pad-focus')?.textContent?.trim().slice(0, 40) ?? null);
const B = { CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3, L1: 4, R1: 5, L2: 6, R2: 7, SHARE: 8, OPTIONS: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
await press(B.DOWN); // actividad → modo joystick
console.log('pad-info:', await page.evaluate(() => document.getElementById('pad-info')?.textContent));
let f = await focused();
console.log('foco inicial:', f);
for (let i = 0; i < 4 && !(f ?? '').includes('Modo libre'); i++) { await press(B.DOWN); f = await focused(); console.log('  ↓', f); }
if (!(f ?? '').includes('Modo libre')) for (let i = 0; i < 3; i++) { await press(B.UP); f = await focused(); console.log('  ↑', f); }
for (let i = 0; i < 6 && !(f ?? '').includes('Modo libre'); i++) { await press(B.RIGHT); f = await focused(); console.log('  →', f); }
await page.screenshot({ path: `${OUT}/pad-menu.png` });
await press(B.CROSS);
await page.waitForFunction(() => !!window.__app.session, null, { timeout: 60000 });
await frames(3);
console.log('sesión iniciada con ✕:', await page.evaluate(() => window.__app.session.mode.constructor.name));
const st = () => page.evaluate(() => { const fl = window.__app.session.fl; const c = fl.controls; const t = fl.telemetry; return { belt: c.seatbelt, ign: c.ignition, run: t.engineRunning, pb: c.parkingBrake, dir: c.direction, thr: +c.throttle.toFixed(2), v: +t.speedKmh.toFixed(1), hw: +c.handwheel.toFixed(2), lift: +c.lift.toFixed(2), forkH: +t.forkHeight.toFixed(2), tilt: +t.tiltDeg.toFixed(1), shift: +c.sideShift.toFixed(2), paused: window.__app.session.paused }; });
const R = {};
await press(B.L3); R.belt = (await st()).belt === true;
await press(B.CROSS); R.ignition = (await st()).ign === true;
await page.waitForFunction(() => window.__app.session.fl.telemetry.engineRunning, null, { timeout: 60000 });
R.engine = true;
// elevar con el stick derecho (arriba = subir) e inclinar atrás
await setAxis(3, -1);
const tl = await page.evaluate(() => window.__app.session.elapsed);
await page.waitForFunction((t) => window.__app.session.elapsed > t + 1.5, tl, { timeout: 120000, polling: 50 });
let s1 = await st(); console.log('stick derecho arriba:', JSON.stringify(s1)); R.lift = s1.forkH > 0.15;
await setAxis(3, 0); await setAxis(2, -1); await frames(4); s1 = await st(); R.tiltCmd = true;
await setAxis(2, 0);
await setBtn(B.L1, 1); await frames(3); s1 = await st(); R.sideshift = s1.shift > 0.5; await setBtn(B.L1, 0);
await press(B.CIRCLE); R.parking = (await st()).pb === false;
await press(B.UP); R.forward = (await st()).dir === 1;
await setBtn(B.R2, 0.6); await setAxis(0, -0.6);
const t0 = await page.evaluate(() => window.__app.session.elapsed);
await page.waitForFunction((t) => window.__app.session.elapsed > t + 2.5, t0, { timeout: 120000, polling: 50 });
s1 = await st(); console.log('R2 + stick izq.:', JSON.stringify(s1)); R.drive = s1.v > 1.5; R.steer = s1.hw > 0.2;
await setBtn(B.R2, 0); await setAxis(0, 0); await setBtn(B.L2, 1);
await frames(6); await setBtn(B.L2, 0);
// mirar con R3 mantenido + stick derecho (en cabina)
await page.evaluate(() => window.__app.session.rig.setMode('cabina'));
await setBtn(B.R3, 1); await setAxis(2, 1); await frames(1);
const tLook = await page.evaluate(() => window.__app.session.elapsed);
await page.waitForFunction((t) => window.__app.session.elapsed > t + 0.4, tLook, { timeout: 60000, polling: 30 });
const look = await page.evaluate(() => ({ yaw: window.__app.session.rig.headYaw, lift: window.__app.session.fl.controls.lift, tilt: window.__app.session.fl.controls.tilt }));
console.log('R3 + stick der.:', JSON.stringify(look));
R.look = look.yaw < -0.3 && look.tilt === 0;
await setAxis(2, 0); await setBtn(B.R3, 0); await frames(2);
await press(B.R3); await frames(2);
const yaw2 = await page.evaluate(() => window.__app.session.rig.headYaw);
R.lookReset = Math.abs(yaw2) < 0.01;
// pausa con OPTIONS, foco en el menú de pausa, volver con ◯
await press(B.OPTIONS); await frames(2);
R.pause = (await st()).paused === true;
console.log('foco en pausa:', await focused());
await page.screenshot({ path: `${OUT}/pad-pause.png` });
await press(B.CIRCLE); await frames(2);
R.resume = (await st()).paused === false;
await browser.close();
report(R);
