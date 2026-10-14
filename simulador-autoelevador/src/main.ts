import './ui/style.css';
import { initPhysics } from './sim/physics.ts';
import { App } from './app/App.ts';
import { SandboxMode } from './modes/sandbox.ts';
import { openTraining } from './modes/training.ts';
import { openBusiness } from './modes/business.ts';

async function boot() {
  await initPhysics();
  const container = document.getElementById('app')!;
  const app = new App(container, {
    sandbox: (a) => a.startSession(new SandboxMode()),
    training: (a) => openTraining(a),
    business: (a) => openBusiness(a),
  });
  document.getElementById('loading')?.remove();
  app.start();
  // acceso para depuración y pruebas automatizadas
  (window as unknown as { __app: App }).__app = app;
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Error al iniciar: ' + (e instanceof Error ? e.message : String(e));
});
