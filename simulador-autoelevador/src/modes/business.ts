import type { App } from '../app/App.ts';
import { BusinessMode } from './business/BusinessMode.ts';
import { loadGame, newGame, saveGame, deleteGame, type BusinessState } from './business/economy.ts';
import { dayStartScreen, dayEndScreen, shopScreen, statsHtml } from './business/ui.ts';
import { screen, modal } from '../ui/menus.ts';
import { el, button } from '../ui/dom.ts';

/** Pantalla inicial de "Mi Almacén": continuar o empezar una partida. */
export function openBusiness(app: App) {
  app.endSession();
  app.clearScreens();
  const saved = loadGame();
  const { root, body, footer } = screen('📦 Mi Almacén', 'biz-home');
  const intro = el('div');
  intro.innerHTML = `<p>Alquilaste un depósito con una estantería y un autoelevador usado. Atendé los camiones que llegan: <b>descargá y almacená</b> la mercadería de tus clientes y <b>despachá</b> sus pedidos a tiempo. Cobrás por cada pallet movido y por el almacenaje diario.</p>
    <p class="dim">Con lo que ganes comprá autoelevadores más capaces, accesorios (báscula, cámara, luz azul), más estanterías y bahías. Cuidado: los choques, las cargas dañadas, los atrasos y los accidentes cuestan plata y reputación.</p>`;
  body.append(intro);
  if (saved) {
    const box = el('div', 'saved-box');
    box.innerHTML = `<h3>Partida guardada · Día ${saved.day}</h3>${statsHtml(saved)}`;
    body.append(box);
  }
  footer.append(button('Volver', () => app.showMainMenu(), 'btn'));
  if (saved) {
    footer.append(
      button(
        'Nueva partida',
        () => {
          const m = modal('¿Empezar de cero?', '<p>Se borrará la partida guardada.</p>', [
            { label: 'Cancelar', action: () => app.popScreen(m) },
            {
              label: 'Sí, empezar de nuevo',
              cls: 'danger',
              action: () => {
                deleteGame();
                const st = newGame();
                saveGame(st);
                startDay(app, st);
              },
            },
          ]);
          app.pushScreen(m);
        },
        'btn',
      ),
      button('▶ Continuar', () => startDay(app, saved), 'btn primary'),
    );
  } else {
    footer.append(
      button(
        '▶ Empezar',
        () => {
          const st = newGame();
          saveGame(st);
          startDay(app, st);
        },
        'btn primary',
      ),
    );
  }
  app.pushScreen(root);
}

export function startDay(app: App, state: BusinessState) {
  if (state.money < -10000) {
    deleteGame();
    app.endSession();
    app.clearScreens();
    const m = modal('Quiebra', '<p>Las deudas superaron los $10.000 y el depósito cerró. ¡Volvé a intentarlo con más cuidado!</p>', [{ label: 'Volver', action: () => openBusiness(app), cls: 'primary' }]);
    app.pushScreen(m);
    return;
  }
  const mode: BusinessMode = new BusinessMode(state, {
    onStartDay: (s) => {
      s.setPaused(true);
      const m = dayStartScreen(app, state, mode.orders, mode.inspectionText(), {
        begin: () => {
          app.popScreen(m);
          mode.beginDay(s);
        },
        shop: () => {
          app.popScreen(m);
          shopScreen(app, state, () => startDay(app, state));
        },
        exit: () => {
          saveGame(state);
          openBusiness(app);
        },
      });
    },
    onDayEnd: (report) => {
      const s = app.session;
      if (!s) return;
      s.setPaused(true);
      const show = () => {
        const m = dayEndScreen(app, state, report, {
          next: () => startDay(app, state),
          shop: () => {
            app.popScreen(m);
            shopScreen(app, state, show);
          },
          exit: () => openBusiness(app),
        });
      };
      show();
    },
  });
  app.startSession(mode);
}
