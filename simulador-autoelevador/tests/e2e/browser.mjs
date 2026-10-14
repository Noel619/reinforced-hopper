// Utilidades comunes de las pruebas en navegador (Playwright + Chromium sin pantalla).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
/** URL del juego (servidor de desarrollo: `npm run dev`). */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
/** Carpeta para capturas de pantalla. */
export const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // instalación global (p. ej. PLAYWRIGHT_NODE_PATH=/opt/node-tools/node_modules/)
    const base = process.env.PLAYWRIGHT_NODE_PATH ?? '/opt/node-tools/node_modules/';
    return createRequire(base)('playwright');
  }
}

/** Abre el juego en un Chromium sin pantalla (WebGL por software). */
export async function openGame(opts = {}) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: opts.viewport ?? { width: 1100, height: 650 } });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.startsWith('[AP]')) console.log(`[${m.type()}] ${t}`);
  });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__app, null, { timeout: 60000 });
  if (opts.lowQuality !== false) {
    await page.evaluate(() => {
      const a = window.__app;
      a.settings.quality = 'baja';
      a.applySettings();
    });
  }
  return { browser, page };
}

/** Inyecta el piloto automático de pruebas en la página. */
export async function injectAutopilot(page) {
  await page.addScriptTag({ content: fs.readFileSync(path.join(HERE, 'autopilot.js'), 'utf8') });
}

/** Espera a que la simulación avance `n` cuadros (los cuadros con WebGL por software son lentos). */
export async function simFrames(page, n = 1) {
  for (let i = 0; i < n; i++) {
    const t0 = await page.evaluate(() => window.__app.session.elapsed);
    await page.waitForFunction((t0) => window.__app.session.elapsed > t0, t0, { timeout: 60000, polling: 20 });
  }
}

/** Imprime los resultados y fija el código de salida (1 si alguno falló). */
export function report(results) {
  console.log('RESULTADOS', JSON.stringify(results));
  const failed = Object.entries(results).filter(([, v]) => v === false);
  if (failed.length) {
    console.log('FALLARON:', failed.map(([k]) => k).join(', '));
    process.exitCode = 1;
  } else console.log('OK');
}
