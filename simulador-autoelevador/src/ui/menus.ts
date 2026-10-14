import { el, button } from './dom.ts';
import type { Settings } from '../app/settings.ts';
import type { CameraMode } from '../render/CameraRig.ts';

/** Pantalla superpuesta con panel central. */
export function screen(title: string, cls = ''): { root: HTMLDivElement; body: HTMLDivElement; footer: HTMLDivElement } {
  const root = el('div', `screen ${cls}`);
  const panel = el('div', 'screen-panel');
  const h = el('h2', '', title);
  const body = el('div', 'screen-body');
  const footer = el('div', 'screen-footer');
  panel.append(h, body, footer);
  root.append(panel);
  return { root, body, footer };
}

export interface MainMenuHandlers {
  training: () => void;
  sandbox: () => void;
  business: () => void;
  help: () => void;
  settings: () => void;
}

export function mainMenu(h: MainMenuHandlers, padInfo: string): HTMLDivElement {
  const root = el('div', 'screen main-menu');
  const box = el('div', 'menu-box');
  const logo = el('div', 'logo');
  logo.innerHTML = '<span class="logo-icon">⛟</span><div><div class="logo-title">SIMULADOR DE<br>AUTOELEVADOR</div><div class="logo-sub">Aprendé a manejar un autoelevador contrapesado de verdad</div></div>';
  const cards = el('div', 'mode-cards');
  const card = (icon: string, title: string, desc: string, fn: () => void) => {
    const c = el('button', 'mode-card');
    c.innerHTML = `<div class="mc-icon">${icon}</div><div class="mc-title">${title}</div><div class="mc-desc">${desc}</div>`;
    c.addEventListener('click', fn);
    return c;
  };
  cards.append(
    card('🎓', 'Escuela de manejo', 'Lecciones guiadas paso a paso: puesta en marcha, dirección trasera, tomar y estibar pallets, camiones, rampas y examen final.', h.training),
    card('🏗️', 'Modo libre', 'Sandbox con depósito, racks, camiones, rampa y circuito de conos. Elegí el modelo y practicá sin presión.', h.sandbox),
    card('📦', 'Mi Almacén', 'Gestioná tu propio depósito: atendé camiones, cumplí pedidos, ganá dinero y comprá mejores equipos y ampliaciones.', h.business),
  );
  const row = el('div', 'menu-row');
  row.append(button('🎮 Controles', h.help, 'btn ghost'), button('⚙ Ajustes', h.settings, 'btn ghost'));
  const pad = el('div', 'pad-info', padInfo);
  pad.id = 'pad-info';
  box.append(logo, cards, row, pad);
  // en un teléfono o tableta sin teclado ni ratón: avisar cómo se juega
  const touchOnly = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  if (touchOnly) box.append(el('div', 'touch-note', 'Este simulador se maneja con teclado y ratón o con un joystick (PlayStation/Xbox). En un teléfono podés conectar un mando por Bluetooth.'));
  root.append(box);
  return root;
}

export function helpScreen(onClose: () => void): HTMLDivElement {
  const { root, body, footer } = screen('Controles y consejos', 'help');
  const tabs = el('div', 'tabs');
  const content = el('div', 'tab-content');
  const pages: Record<string, string> = {
    Teclado: `
      <table class="keys">
      <tr><th colspan="2">Conducción</th></tr>
      <tr><td><kbd>W</kbd></td><td>Acelerador</td></tr>
      <tr><td><kbd>S</kbd></td><td>Freno de servicio</td></tr>
      <tr><td><kbd>Shift</kbd></td><td>Pedal de avance lento (inching): desembraga y, a fondo, frena. Usalo con el acelerador para elevar rápido sin avanzar.</td></tr>
      <tr><td><kbd>A</kbd> / <kbd>D</kbd></td><td>Volante izquierda / derecha (dirección trasera: la cola se abre hacia afuera)</td></tr>
      <tr><td><kbd>E</kbd> / <kbd>Q</kbd></td><td>Palanca de marcha: adelante / atrás (pasa por N)</td></tr>
      <tr><td><kbd>Espacio</kbd></td><td>Freno de mano</td></tr>
      <tr><td><kbd>K</kbd></td><td>Llave: arrancar / apagar (con la palanca en N)</td></tr>
      <tr><td><kbd>B</kbd> · <kbd>H</kbd> · <kbd>L</kbd> · <kbd>J</kbd></td><td>Cinturón · Bocina · Luces · Baliza</td></tr>
      <tr><th colspan="2">Mástil (palancas hidráulicas)</th></tr>
      <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Elevar / bajar horquillas</td></tr>
      <tr><td><kbd>R</kbd> / <kbd>F</kbd></td><td>Inclinar mástil hacia atrás / adelante</td></tr>
      <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Desplazador lateral</td></tr>
      <tr><td><kbd>Z</kbd> / <kbd>X</kbd></td><td>Posicionador: cerrar / abrir horquillas (si tiene)</td></tr>
      <tr><td><kbd>Ctrl</kbd></td><td>Mantener: mando fino (palancas y acelerador suaves)</td></tr>
      <tr><th colspan="2">Cámara y sistema</th></tr>
      <tr><td><kbd>C</kbd></td><td>Cambiar cámara (cabina · tercera persona · horquillas · aérea)</td></tr>
      <tr><td><kbd>V</kbd></td><td>Mantener: mirar hacia atrás</td></tr>
      <tr><td><kbd>G</kbd></td><td>Monitor de la cámara de horquillas</td></tr>
      <tr><td><kbd>Inicio</kbd> · <kbd>Retroceso</kbd></td><td>Centrar vista · Reubicar autoelevador</td></tr>
      <tr><td><kbd>Esc</kbd> / <kbd>P</kbd> · <kbd>F1</kbd></td><td>Pausa · Ayuda</td></tr>
      </table>`,
    'Joystick (PlayStation)': `
      <table class="keys">
      <tr><td><span class="pad">Stick izq. ↔</span></td><td>Volante (proporcional)</td></tr>
      <tr><td><span class="pad">R2</span></td><td>Acelerador (analógico)</td></tr>
      <tr><td><span class="pad">L2</span></td><td>Pedal de avance lento: primera mitad desembraga, a fondo frena (en eléctricos: freno)</td></tr>
      <tr><td><span class="pad">Stick der. ↕</span></td><td>Elevar / bajar (proporcional: empujá suave para ir despacio)</td></tr>
      <tr><td><span class="pad">Stick der. ↔</span></td><td>Inclinar mástil (izquierda = atrás, derecha = adelante)</td></tr>
      <tr><td><span class="pad">L1 / R1</span></td><td>Desplazador lateral izquierda / derecha</td></tr>
      <tr><td><span class="pad">Stick izq. ↕</span></td><td>Posicionador de horquillas (si tiene)</td></tr>
      <tr><td><span class="pad">D-pad ↑ / ↓</span></td><td>Palanca de marcha adelante / atrás</td></tr>
      <tr><td><span class="pad">✕</span></td><td>Llave (arrancar / apagar)</td></tr>
      <tr><td><span class="pad">○</span></td><td>Freno de mano</td></tr>
      <tr><td><span class="pad">□</span></td><td>Bocina</td></tr>
      <tr><td><span class="pad">△</span></td><td>Cambiar cámara</td></tr>
      <tr><td><span class="pad">L3</span></td><td>Cinturón de seguridad</td></tr>
      <tr><td><span class="pad">D-pad ←</span></td><td>Luces</td></tr>
      <tr><td><span class="pad">R3 mantenido + stick der.</span></td><td>Mirar alrededor (en cabina) u orbitar la cámara · toque de R3: centrar la vista</td></tr>
      <tr><td><span class="pad">D-pad →</span></td><td>Mantener: mirar hacia atrás</td></tr>
      <tr><td><span class="pad">Options · Share</span></td><td>Pausa · Ayuda</td></tr>
      <tr><td><span class="pad">Menús</span></td><td>Cruceta o stick izq. para moverte · ✕ aceptar · ○ volver</td></tr>
      </table>
      <p class="note">Funciona con DualShock 4, DualSense y mandos Xbox conectados por USB o Bluetooth. Si no responde, apretá cualquier botón del mando con la ventana enfocada.</p>`,
    'Ratón en cabina': `
      <ul class="tips">
      <li><b>Mirar alrededor:</b> clic derecho y arrastrar (o clic izquierdo en una zona sin mandos). Rueda: zoom.</li>
      <li>Pasá el puntero sobre un mando: se resalta y aparece qué hace.</li>
      <li><b>Palancas hidráulicas</b> (a la derecha del volante): clic y arrastrá hacia vos (abajo) para <i>tirar</i> o hacia arriba para <i>empujar</i>. Son proporcionales y vuelven al centro al soltar.
        <br>Tirar = subir / inclinar atrás / desplazar a la izquierda. Empujar = bajar / inclinar adelante / derecha.</li>
      <li><b>Palanca de marcha</b> (izquierda de la columna): arrastrá arriba = adelante (F), abajo = atrás (R), al medio = neutral (N).</li>
      <li><b>Volante:</b> agarrá el pomo o el aro y giralo en círculo como en la realidad.</li>
      <li><b>Llave de contacto y luces:</b> en el frente del tablero, debajo de las palancas (mirá hacia abajo a la derecha). Clic para accionarlas.</li>
      <li><b>Freno de mano:</b> palanca roja a la izquierda del volante. <b>Cinturón:</b> hebilla naranja a la derecha del asiento (mirá hacia abajo). <b>Bocina:</b> botón rojo del volante.</li>
      <li>Los pedales se manejan con el teclado o con R2/L2.</li>
      </ul>`,
    'Seguridad': `
      <ol class="tips">
      <li>Antes de arrancar: cinturón puesto, palanca en <b>N</b> y freno de mano aplicado.</li>
      <li>Circulá con las horquillas a <b>15–20 cm</b> del piso y el mástil <b>inclinado hacia atrás</b>.</li>
      <li>Nunca eleves ni bajes la carga con el autoelevador en movimiento.</li>
      <li>La dirección es <b>trasera</b>: al doblar, el contrapeso barre hacia afuera. Ojo con paredes, racks y peatones.</li>
      <li>Mirá siempre en el sentido de marcha. Si la carga te tapa la visión, circulá en reversa.</li>
      <li>En rampas con carga: la carga <b>del lado de arriba</b> (subí de frente, bajá en reversa) y sin girar.</li>
      <li>Respetá la <b>placa de capacidad</b>: la capacidad baja con la altura y con el centro de carga.</li>
      <li>Mantené el punto dentro del <b>triángulo de estabilidad</b> (panel arriba a la derecha). Girar rápido o con la carga alta lo saca afuera: vuelco.</li>
      <li>Frená antes de cambiar de marcha. Nada de frenadas bruscas con carga.</li>
      <li>Al estacionar: horquillas apoyadas en el piso, freno de mano, motor apagado.</li>
      </ol>`,
  };
  const keys = Object.keys(pages);
  const show = (k: string) => {
    content.innerHTML = pages[k];
    for (const b of tabs.children) b.classList.toggle('active', (b as HTMLElement).dataset.k === k);
  };
  for (const k of keys) {
    const b = button(k, () => show(k), 'tab');
    b.dataset.k = k;
    tabs.append(b);
  }
  body.append(tabs, content);
  show(keys[0]);
  footer.append(button('Cerrar', onClose, 'btn primary'));
  return root;
}

export function settingsScreen(s: Settings, onChange: (s: Settings) => void, onClose: () => void): HTMLDivElement {
  const { root, body, footer } = screen('Ajustes', 'settings');
  const form = el('div', 'form');
  const row = (label: string, input: HTMLElement, hint = '') => {
    const r = el('label', 'form-row');
    r.append(el('span', 'form-label', label), input);
    if (hint) r.append(el('span', 'form-hint', hint));
    form.append(r);
  };
  const select = <T extends string>(value: T, opts: [T, string][], set: (v: T) => void) => {
    const sel = el('select');
    for (const [v, l] of opts) {
      const o = el('option', '', l);
      o.value = v;
      if (v === value) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener('change', () => {
      set(sel.value as T);
      onChange(s);
    });
    return sel;
  };
  const check = (value: boolean, set: (v: boolean) => void) => {
    const c = el('input');
    c.type = 'checkbox';
    c.checked = value;
    c.addEventListener('change', () => {
      set(c.checked);
      onChange(s);
    });
    return c;
  };
  row('Cámara inicial', select<CameraMode>(s.defaultCamera, [['cabina', 'Cabina (1ª persona)'], ['tercera', 'Tercera persona']], (v) => (s.defaultCamera = v)));
  row('Modo de conducción', select<Settings['drivingMode']>(s.drivingMode, [['realista', 'Realista (palanca F/N/R)'], ['simple', 'Simple (W avanza, S retrocede)']], (v) => (s.drivingMode = v)), 'En realista hay que usar la palanca de marcha como en un autoelevador real.');
  row('Volante con auto-centrado', check(s.autoCenter, (v) => (s.autoCenter = v)), 'Ayuda para teclado. Los autoelevadores reales no se centran solos.');
  row('Invertir inclinación (stick der.)', check(s.invertTilt, (v) => (s.invertTilt = v)));
  row('Exigir mirar atrás en reversa', check(s.requireLookBack, (v) => (s.requireLookBack = v)));
  row('Mostrar triángulo de estabilidad', check(s.showStability, (v) => (s.showStability = v)));
  row('Mostrar HUD', check(s.showHud, (v) => (s.showHud = v)));
  row('Calidad gráfica', select<Settings['quality']>(s.quality, [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], (v) => (s.quality = v)));
  const vol = el('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.05';
  vol.value = String(s.volume);
  vol.addEventListener('input', () => {
    s.volume = Number(vol.value);
    onChange(s);
  });
  row('Volumen', vol);
  body.append(form);
  footer.append(button('Listo', onClose, 'btn primary'));
  return root;
}

export function pauseScreen(items: { label: string; action: () => void; cls?: string }[]): HTMLDivElement {
  const { root, body } = screen('Pausa', 'pause');
  const list = el('div', 'menu-list');
  for (const it of items) list.append(button(it.label, it.action, `btn ${it.cls ?? ''}`));
  body.append(list);
  return root;
}

/** Ventana modal simple con contenido HTML y botones. */
export function modal(title: string, html: string, buttons: { label: string; action: () => void; cls?: string }[]): HTMLDivElement {
  const { root, body, footer } = screen(title, 'modal');
  body.innerHTML = html;
  for (const b of buttons) footer.append(button(b.label, b.action, `btn ${b.cls ?? ''}`));
  return root;
}
