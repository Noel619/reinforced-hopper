import type { App } from '../app/App.ts';
import { LESSONS, lessonById } from './training/lessons.ts';
import { TrainingMode, loadProgress, setLessonOrder } from './training/TrainingMode.ts';
import { screen } from '../ui/menus.ts';
import { el, button, escapeHtml } from '../ui/dom.ts';

/** Pantalla de la escuela de manejo: lista de lecciones con progreso. */
export function openTraining(app: App) {
  app.endSession();
  app.clearScreens();
  setLessonOrder(LESSONS.map((l) => l.id));
  const progress = loadProgress();
  const { root, body, footer } = screen('🎓 Escuela de manejo', 'lessons');
  const passed = LESSONS.filter((l) => (progress[l.id]?.stars ?? 0) > 0).length;
  const totalStars = LESSONS.reduce((a, l) => a + (progress[l.id]?.stars ?? 0), 0);
  const intro = el('div', 'lessons-intro');
  intro.innerHTML = `<p>Aprendé a operar un autoelevador contrapesado paso a paso. Cada lección evalúa tu técnica y las reglas de seguridad: choques, cargas caídas, velocidad, horquillas altas, cinturón y más.</p>
    <div class="lessons-progress"><div class="lp-bar"><div style="width:${(passed / LESSONS.length) * 100}%"></div></div>
    <span>${passed}/${LESSONS.length} aprobadas · ${totalStars}/${LESSONS.length * 3} ★</span></div>
    ${passed === LESSONS.length ? '<div class="cert">🏅 ¡Completaste la escuela! Ya podés operar en <b>Mi Almacén</b> con licencia completa.</div>' : ''}`;
  const grid = el('div', 'lesson-grid');
  for (const L of LESSONS) {
    const rec = progress[L.id];
    const card = el('button', `lesson-card ${rec ? 'passed' : ''}`);
    const stars = [0, 1, 2].map((i) => `<span class="${rec && i < rec.stars ? 'on' : ''}">★</span>`).join('');
    card.innerHTML = `<div class="lc-num">${L.num}</div>
      <div class="lc-body"><div class="lc-title">${escapeHtml(L.title)}${L.strict ? ' <span class="tag">examen</span>' : ''}</div>
      <div class="lc-sum">${escapeHtml(L.summary)}</div>
      <div class="lc-foot"><span class="stars small">${stars}</span>${rec ? `<span class="dim">Mejor: ${rec.best} pts</span>` : '<span class="dim">Sin intentar</span>'}</div></div>`;
    card.addEventListener('click', () => startLesson(app, L.id));
    grid.append(card);
  }
  body.append(intro, grid);
  footer.append(button('Volver al menú', () => app.showMainMenu(), 'btn'));
  app.pushScreen(root);
}

export function startLesson(app: App, id: string) {
  const L = lessonById(id);
  if (!L) return openTraining(app);
  app.startSession(
    new TrainingMode(L, (next) => {
      if (next) startLesson(app, next);
      else openTraining(app);
    }),
  );
}
