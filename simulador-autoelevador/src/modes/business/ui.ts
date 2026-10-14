import type { App } from '../../app/App.ts';
import { screen, modal } from '../../ui/menus.ts';
import { el, button, money, escapeHtml } from '../../ui/dom.ts';
import { FORKLIFT_SPECS, getSpec } from '../../sim/specs.ts';
import { SHOP, type BusinessState, type Order, saveGame, sellValue, clientById, fmtTime, cargoName, repStars, RATES } from './economy.ts';

export function repStarsHtml(rep: number): string {
  const st = repStars(rep);
  let h = '<span class="rep-stars">';
  for (let i = 1; i <= 5; i++) h += `<span class="${st >= i ? 'on' : st >= i - 0.5 ? 'half' : ''}">★</span>`;
  return h + '</span>';
}

export function ordersTable(orders: Order[]): string {
  if (!orders.length) return '<p class="dim">No hay pedidos programados.</p>';
  return `<table class="orders-table"><tr><th></th><th>Cliente</th><th>Pedido</th><th>Llega</th><th>Límite</th><th>Estado</th></tr>${orders
    .map((o) => {
      const cl = clientById(o.client);
      const detail = o.kind === 'recepcion' ? `Descargar ${o.total} pallets` : `Cargar ${o.request.map((r) => `${r.qty}× ${cargoName(r.cargo)}`).join(', ')}`;
      const status = { pendiente: 'Programado', en_bahia: 'En bahía', completado: '✓ Completado', tarde: 'Tarde', cancelado: '✗ No cumplido' }[o.status];
      return `<tr><td>${o.kind === 'recepcion' ? '⬇' : '⬆'}</td><td><b style="color:${cl.color}">${escapeHtml(cl.name)}</b></td><td>${escapeHtml(detail)}</td><td>${fmtTime(o.arrival)}</td><td>${fmtTime(o.deadline)}</td><td>${status}</td></tr>`;
    })
    .join('')}</table>`;
}

export function statsHtml(s: BusinessState): string {
  const spec = getSpec(s.specId);
  return `<div class="biz-stats">
    <div><span>Dinero</span><b class="${s.money < 0 ? 'bad' : ''}">${money(s.money)}</b></div>
    <div><span>Reputación</span><b>${repStarsHtml(s.reputation)}</b></div>
    <div><span>Autoelevador</span><b>${escapeHtml(spec.name)}</b></div>
    <div><span>Inventario</span><b>${s.inventory.length} pallets</b></div>
    <div><span>Pedidos</span><b>${s.stats.ordersDone} ✓ · ${s.stats.ordersLate} tarde</b></div>
    <div><span>Días sin accidentes</span><b>${s.stats.daysNoAccident}</b></div>
  </div>`;
}

/** Tienda de equipos, accesorios, ampliaciones y servicios. */
export function shopScreen(app: App, state: BusinessState, onClose: () => void) {
  const { root, body, footer } = screen('🛒 Tienda', 'shop');
  const tabs = el('div', 'tabs');
  const content = el('div', 'tab-content');
  const moneyEl = el('div', 'shop-money');
  const refreshMoney = () => (moneyEl.innerHTML = `Saldo: <b class="${state.money < 0 ? 'bad' : ''}">${money(state.money)}</b>`);
  refreshMoney();
  const cats: [string, string][] = [
    ['autoelevador', 'Autoelevadores'],
    ['accesorio', 'Accesorios'],
    ['instalacion', 'Instalaciones'],
    ['servicio', 'Servicios'],
  ];
  const buy = (price: number, apply: () => void, what: string) => {
    if (state.money < price) return;
    state.money -= price;
    apply();
    saveGame(state);
    refreshMoney();
    app.audio.chime(true);
    show(current);
    void what;
  };
  let current = 'autoelevador';
  const show = (cat: string) => {
    current = cat;
    for (const b of tabs.children) b.classList.toggle('active', (b as HTMLElement).dataset.k === cat);
    content.innerHTML = '';
    const grid = el('div', 'shop-grid');
    if (cat === 'autoelevador') {
      const tradeIn = sellValue(state.specId);
      for (const spec of FORKLIFT_SPECS) {
        const owned = spec.id === state.specId;
        const net = spec.price - tradeIn;
        const card = el('div', `shop-card ${owned ? 'owned' : ''}`);
        card.innerHTML = `<div class="sc-name">${escapeHtml(spec.name)}</div><div class="sc-desc">${escapeHtml(spec.description)}</div>
          <div class="sc-stats"><span>Capacidad <b>${spec.capacityKg} kg</b></span><span>Altura <b>${spec.maxForkHeight.toFixed(1)} m</b></span><span>Vel. <b>${spec.maxSpeedKmh} km/h</b></span>
          <span>${spec.power === 'electrico' ? 'Eléctrico' : spec.power === 'glp' ? 'GLP' : 'Diésel'}${spec.sideShift ? ' · desplazador' : ''}${spec.forkPositioner ? ' · posicionador' : ''}</span></div>`;
        const foot = el('div', 'shop-foot');
        if (owned) foot.append(el('span', 'good', 'En uso'));
        else {
          foot.append(el('span', '', `${money(spec.price)} − tu equipo ${money(tradeIn)} = `), el('b', '', money(net)));
          const b = button('Comprar', () => buy(net, () => (state.specId = spec.id), spec.name), 'btn primary small');
          b.disabled = state.money < net;
          foot.append(b);
        }
        card.append(foot);
        grid.append(card);
      }
    } else {
      for (const it of SHOP.filter((x) => x.category === cat)) {
        const owned = state.owned.includes(it.id);
        const reqOk = (it.requires ?? []).every((r) => state.owned.includes(r));
        const notApplicable = it.id === 'desplazador' && getSpec(state.specId).sideShift;
        const card = el('div', `shop-card ${owned ? 'owned' : ''}`);
        card.innerHTML = `<div class="sc-name">${escapeHtml(it.name)}</div><div class="sc-desc">${escapeHtml(it.description)}</div>`;
        const foot = el('div', 'shop-foot');
        if (owned) foot.append(el('span', 'good', it.id === 'publicidad' ? 'Contratada' : 'Comprado ✓'));
        else if (notApplicable) foot.append(el('span', 'dim', 'Tu autoelevador ya lo trae'));
        else if (!reqOk) foot.append(el('span', 'dim', 'Requiere el módulo anterior'));
        else {
          foot.append(el('b', '', money(it.price) + (it.daily ? ` + ${money(it.daily)}/día` : '')));
          const b = button(
            'Comprar',
            () =>
              buy(
                it.price,
                () => {
                  state.owned.push(it.id);
                  if (it.id === 'publicidad') state.reputation = Math.min(100, state.reputation + 8);
                },
                it.name,
              ),
            'btn primary small',
          );
          b.disabled = state.money < it.price;
          foot.append(b);
        }
        card.append(foot);
        grid.append(card);
      }
    }
    content.append(grid);
  };
  for (const [k, l] of cats) {
    const b = button(l, () => show(k), 'tab');
    b.dataset.k = k;
    tabs.append(b);
  }
  body.append(moneyEl, tabs, content);
  show('autoelevador');
  footer.append(
    button(
      'Listo',
      () => {
        app.popScreen(root);
        onClose();
      },
      'btn primary',
    ),
  );
  app.pushScreen(root);
}

export function dayStartScreen(app: App, state: BusinessState, orders: Order[], inspection: string | null, h: { begin: () => void; shop: () => void; exit: () => void }) {
  const html = `${statsHtml(state)}
    <h3>Planilla del día ${state.day}</h3>
    ${ordersTable(orders)}
    ${inspection ? `<p class="warn-box">📋 ${escapeHtml(inspection)}</p>` : ''}
    <ul class="tips small">
      <li><b>Recepción:</b> descargá el camión y guardá cada pallet en una estantería o en la zona ESTIBA EN PISO. Cobrás ${money(RATES.inboundPerPallet)} por pallet.</li>
      <li><b>Despacho:</b> buscá en tu inventario los pallets del cliente (mirá la etiqueta de color) y cargalos en su camión. Cobrás ${money(RATES.outboundPerPallet)} por pallet.</li>
      <li>Los pallets altos (bebidas, máquinas) sólo entran en el piso o en el último nivel. Cargá combustible estacionando en la zona CARGA con freno de mano.</li>
    </ul>`;
  const m = modal(`📦 Mi Almacén — Día ${state.day}`, html, [
    { label: 'Salir', action: h.exit },
    { label: '🛒 Tienda', action: h.shop },
    { label: '▶ Comenzar jornada', action: h.begin, cls: 'primary' },
  ]);
  m.classList.add('biz-modal');
  app.pushScreen(m);
  return m;
}

export function dayEndScreen(app: App, state: BusinessState, report: { day: number; lines: { text: string; amount: number }[]; income: number; expenses: number; repDelta: number; orders: Order[] }, h: { next: () => void; shop: () => void; exit: () => void }) {
  // agrupar líneas iguales
  const grouped = new Map<string, number>();
  for (const l of report.lines) grouped.set(l.text, (grouped.get(l.text) ?? 0) + l.amount);
  const lines = [...grouped.entries()]
    .map(([t, a]) => `<tr><td>${escapeHtml(t)}</td><td class="${a >= 0 ? 'good' : 'bad'}">${a >= 0 ? '+' : '−'}${money(Math.abs(a))}</td></tr>`)
    .join('');
  const net = report.income - report.expenses;
  const html = `${statsHtml(state)}
    <h3>Resultado del día ${report.day}</h3>
    <table class="ledger">${lines}<tr class="total"><td>Resultado neto</td><td class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</td></tr></table>
    <p>Reputación: ${report.repDelta >= 0 ? '+' : ''}${report.repDelta} ${repStarsHtml(state.reputation)}</p>
    <h3>Pedidos</h3>${ordersTable(report.orders)}
    ${state.money < 0 ? '<p class="warn-box">⚠ Saldo negativo: si baja de −$10.000 perdés el depósito.</p>' : ''}`;
  const m = modal(`🌙 Fin de la jornada ${report.day}`, html, [
    { label: 'Menú principal', action: h.exit },
    { label: '🛒 Tienda', action: h.shop },
    { label: `▶ Día ${state.day}`, action: h.next, cls: 'primary' },
  ]);
  m.classList.add('biz-modal');
  app.pushScreen(m);
  return m;
}
