// Recorre lecciones de la escuela con el piloto automático y verifica que se aprueben.
// Uso: node tests/e2e/lesson.mjs [n|all] [velocidad]     (n = 1..8, por defecto all)
import fs from 'fs';
import path from 'path';
import { openGame, injectAutopilot, report, HERE, OUT } from './browser.mjs';

const which = process.argv[2] ?? 'all';
const speed = Number(process.argv[3] ?? 3);
const lessons = which === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8] : which.split(',').map(Number);
const results = {};

for (const n of lessons) {
  const { browser, page } = await openGame();
  try {
    await page.click('text=Escuela de manejo');
    await page.locator('.lesson-card').nth(n - 1).click();
    await page.locator('button', { hasText: 'Comenzar' }).first().click({ timeout: 60000 });
    await page.waitForFunction(() => !!window.__app.session, null, { timeout: 60000 });
    await injectAutopilot(page);
    await page.evaluate((speed) => {
      const app = window.__app;
      app.debug.noRender = true;
      app.debug.maxSteps = 80;
      const s = app.session;
      s.timeScale = speed;
      s.rig.setMode('tercera');
      window.AP.install();
    }, speed);
    const script = fs.readFileSync(path.join(HERE, 'lessons', `l${n}.js`), 'utf8');
    const t0 = Date.now();
    let state;
    try {
      state = await page.evaluate(`(async () => { const AP = window.AP; const fl = AP.fl(); const c = fl.controls; const T = fl.telemetry; const m = AP.s().mode; const refs = m.refs; const log = (...a) => console.log('[AP]', ...a);\n${script}\n; await AP.frames(30); return AP.lessonState(); })()`);
    } catch (e) {
      state = { error: String(e).slice(0, 400), ...(await page.evaluate(() => window.AP.lessonState())) };
    }
    console.log(`lección ${n}:`, JSON.stringify(state), `(${((Date.now() - t0) / 1000).toFixed(0)} s reales)`);
    results[`leccion${n}`] = !!state.finished && state.score >= 70;
    await page.evaluate(() => (window.__app.debug.noRender = false));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `leccion-${n}.png`) });
  } finally {
    await browser.close();
  }
}
report(results);
