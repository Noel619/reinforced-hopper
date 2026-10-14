import * as THREE from 'three';
import type { GameMode, Session, AccessoryId } from '../../game/Session.ts';
import type { World, PalletEntity } from '../../world/World.ts';
import type { GameEvent } from '../../game/events.ts';
import { getSpec, type ForkliftSpec } from '../../sim/specs.ts';
import { flatbedTruck, removeTruck } from '../../world/builders.ts';
import { buildWarehouse, type Warehouse, type Bay } from './warehouse.ts';
import {
  type BusinessState,
  type Order,
  type InventoryItem,
  RATES,
  DAY_START,
  DAY_END,
  MINUTES_PER_SECOND,
  generateOrders,
  saveGame,
  repMultiplier,
  clientById,
  cargoValue,
  fmtTime,
  cargoName,
} from './economy.ts';
import { el, escapeHtml, money } from '../../ui/dom.ts';
import { repStarsHtml } from './ui.ts';

interface TrackedPallet {
  itemId: string;
  client: string;
  cargo: string;
  mass: number;
  sku: string;
  /** Pedido de recepción del que vino (si todavía no se cobró) */
  inboundOrder: string | null;
  inboundPaid: boolean;
  damage: number;
}

export interface DayReport {
  day: number;
  lines: { text: string; amount: number }[];
  income: number;
  expenses: number;
  repDelta: number;
  orders: Order[];
}

/** Modo gestión: una jornada de trabajo en el depósito propio. */
export class BusinessMode implements GameMode {
  readonly id = 'business' as const;
  readonly title = 'Mi Almacén';
  state: BusinessState;
  wh!: Warehouse;
  orders: Order[] = [];
  clock = DAY_START;
  private running = false;
  private dayOver = false;
  private tracked = new Map<number, TrackedPallet>();
  private lines: { text: string; amount: number }[] = [];
  private repStart: number;
  private inspection: { from: number; to: number } | null = null;
  private panel: HTMLDivElement;
  private panelTimer = 0;
  private checkTimer = 0;
  private refuelTimer = 0;
  private departing: { bay: Bay; timer: number; removePallets: number[] }[] = [];
  private accidentToday = false;
  private onDayEnd: (report: DayReport) => void;
  private onStartDay: (s: Session) => void;
  readonly safetyConfig = { speedLimit: 10, speedLimitLoaded: 8 };

  constructor(state: BusinessState, hooks: { onDayEnd: (r: DayReport) => void; onStartDay: (s: Session) => void }) {
    this.state = state;
    this.repStart = state.reputation;
    this.onDayEnd = hooks.onDayEnd;
    this.onStartDay = hooks.onStartDay;
    this.panel = el('div', 'panel biz-panel');
  }

  /** Ficha del autoelevador propio con accesorios aplicados. */
  currentSpec(): ForkliftSpec {
    const base = getSpec(this.state.specId);
    if (!base.sideShift && this.state.owned.includes('desplazador')) return { ...base, sideShift: true, sideShiftRange: 0.1 };
    return base;
  }

  build(world: World) {
    this.wh = buildWarehouse(world, this.state.owned);
    // restaurar inventario
    const slotById = new Map(this.wh.slots.map((s) => [s.id, s]));
    const keep: InventoryItem[] = [];
    for (const it of this.state.inventory) {
      let pos: THREE.Vector3 | null = null;
      let yaw = 0;
      if (it.where.kind === 'slot') {
        const sl = slotById.get(it.where.slotId);
        if (sl) {
          pos = sl.center.clone();
          pos.y += 0.003;
          yaw = sl.yaw;
        }
      }
      if (!pos && it.where.kind === 'floor') {
        pos = new THREE.Vector3(it.where.x, Math.max(0.003, it.where.y + 0.003), it.where.z);
        yaw = it.where.yaw;
      }
      if (!pos) {
        // ubicación perdida: al piso de la zona de estiba
        const z = this.wh.zones.piso;
        pos = new THREE.Vector3(z.center.x + (Math.random() - 0.5) * 4, 0.003, z.center.z + (Math.random() - 0.5) * 8);
      }
      const e = this.spawnPallet(world, it.client, it.cargo, it.mass, it.sku, pos, yaw, it.id, null);
      e.meta.damage = it.damage;
      this.tracked.get(e.id)!.damage = it.damage;
      keep.push(it);
    }
    this.state.inventory = keep;
    const cap = this.capacity();
    this.orders = generateOrders(this.state, cap, this.wh.bays.length, this.currentSpec().capacityKg);
    // inspección de seguridad aleatoria (1 de cada 3 días)
    if ((this.state.day + this.state.seed) % 3 === 0) {
      const from = DAY_START + 90 + ((this.state.seed + this.state.day * 31) % 240);
      this.inspection = { from, to: from + 120 };
    }
    return { spec: this.currentSpec(), position: this.wh.spawn.position, yaw: this.wh.spawn.yaw };
  }

  capacity() {
    return this.wh.slots.length + this.wh.floorCapacity;
  }

  respawn() {
    return this.wh.spawn;
  }

  hasAccessory(id: AccessoryId) {
    if (id === 'alarma' || id === 'luces') return true;
    return this.state.owned.includes(id);
  }

  private spawnPallet(world: World, client: string, cargo: string, mass: number, sku: string, pos: THREE.Vector3, yaw: number, itemId: string, order: string | null): PalletEntity {
    const cl = clientById(client);
    const e = world.addPallet({
      cargo,
      mass,
      position: pos,
      yaw,
      sleeping: true,
      type: cargo === 'bebidas' || cargo === 'tambores' ? 'arlog' : 'eur',
      label: { text: `${cl.name.split(' ')[0]}\n${sku}`, color: cl.color },
      meta: { client, sku },
    });
    this.tracked.set(e.id, { itemId, client, cargo, mass, sku, inboundOrder: order, inboundPaid: order === null, damage: 0 });
    return e;
  }

  start(s: Session) {
    s.hud.modePanel.innerHTML = '';
    s.hud.modePanel.append(this.panel);
    s.fl.controls.parkingBrake = true;
    s.safety.config.enabled = false;
    this.renderPanel(s);
    this.onStartDay(s);
  }

  inspectionText(): string | null {
    if (!this.inspection) return null;
    return `Hoy hay inspección de seguridad de ${fmtTime(this.inspection.from)} a ${fmtTime(this.inspection.to)}: cada infracción se multa con ${'$'}${this.state.owned.includes('seguridad') ? RATES.inspectionFine / 2 : RATES.inspectionFine}.`;
  }

  /** Arranca el reloj de la jornada (lo llama la planilla del día). */
  beginDay(s: Session) {
    this.running = true;
    s.safety.config.enabled = true;
    s.setPaused(false);
    s.hud.toast(`Día ${this.state.day}: ${this.orders.length} pedidos programados. ¡A trabajar!`, 'info', 'day', 5);
    if (this.inspection) s.hud.toast(`📋 Hoy hay inspección de seguridad de ${fmtTime(this.inspection.from)} a ${fmtTime(this.inspection.to)}: las infracciones se multan.`, 'warn', 'insp', 8);
  }

  // ---------------------------------------------------------------- dinero
  private charge(s: Session, amount: number, text: string, quiet = false) {
    if (!amount) return;
    this.state.money += amount;
    this.lines.push({ text, amount });
    if (!quiet) s.hud.toast(`${amount > 0 ? '+' : '−'}${money(Math.abs(amount))} · ${text}`, amount > 0 ? 'good' : 'danger', `$${text}`, 3);
    this.renderPanel(s);
  }

  private rep(delta: number) {
    this.state.reputation = Math.max(0, Math.min(100, this.state.reputation + delta));
  }

  // ---------------------------------------------------------------- eventos
  onEvent(e: GameEvent, s: Session) {
    if (!this.running) return;
    const insured = this.state.owned.includes('seguro');
    switch (e.type) {
      case 'collision':
        if (e.what === 'rack' || e.what === 'wall') {
          const cost = Math.round(RATES.rackRepairBase * (e.severity > 0.25 ? 2 : 0.5) + RATES.rackRepairPerSeverity * e.severity);
          this.charge(s, -cost, e.what === 'rack' ? 'Reparación de estantería' : 'Reparación de estructura');
          if (e.severity > 0.3) this.rep(-1);
        } else if (e.what === 'truck') {
          this.charge(s, -Math.round(200 + 1200 * e.severity), 'Daño al camión del cliente');
          this.rep(-2);
        }
        break;
      case 'palletImpact': {
        const p = s.world.pallets.get(e.palletId);
        const tr = p ? this.tracked.get(p.id) : undefined;
        if (!p || !tr || e.severity < 0.1) break;
        tr.damage = Math.min(1, tr.damage + e.severity * 0.5);
        let cost = cargoValue(tr.cargo, tr.mass) * e.severity * 0.25;
        if (insured) cost *= 0.3;
        this.charge(s, -Math.round(cost), 'Mercadería golpeada');
        this.rep(-1);
        break;
      }
      case 'palletDropped': {
        const p = s.world.pallets.get(e.palletId);
        const tr = p ? this.tracked.get(p.id) : undefined;
        if (!p || !tr) break;
        tr.damage = 1;
        let cost = cargoValue(tr.cargo, tr.mass) * 0.6;
        if (insured) cost *= 0.3;
        this.charge(s, -Math.round(cost), 'Carga caída y dañada');
        this.rep(-5);
        break;
      }
      case 'tipover':
        this.charge(s, -2500, 'Vuelco: reparación y grúa');
        this.rep(-10);
        this.accidentToday = true;
        this.state.stats.accidents++;
        setTimeout(() => s.resetForklift(), 3500);
        break;
      case 'pedestrianHit':
        this.charge(s, -RATES.pedestrianFine, 'Accidente con un peatón');
        this.rep(-25);
        this.accidentToday = true;
        this.state.stats.accidents++;
        break;
      case 'violation':
        if (this.inspection && this.clock >= this.inspection.from && this.clock <= this.inspection.to) {
          const fine = this.state.owned.includes('seguridad') ? RATES.inspectionFine / 2 : RATES.inspectionFine;
          this.charge(s, -fine, `Multa de inspección: ${e.message.replace(/\.$/, '')}`);
        }
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- cuadro
  update(dt: number, s: Session) {
    for (const d of [...this.departing]) {
      d.timer -= dt;
      if (d.timer <= 0) this.finishDeparture(s, d);
    }
    if (!this.running || this.dayOver) return;
    this.clock += dt * MINUTES_PER_SECOND;
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 0.4;
      this.updateOrders(s);
    }
    this.updateRefuel(dt, s);
    this.panelTimer -= dt;
    if (this.panelTimer <= 0) {
      this.panelTimer = 0.5;
      this.renderPanel(s);
    }
    if (this.clock >= DAY_END) this.endDay(s);
  }

  private updateRefuel(dt: number, s: Session) {
    const fl = s.fl;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.quaternion);
    const center = fl.position.addScaledVector(fwd, -fl.spec.wheelbase * 0.5);
    const inStation = s.world.pointInZone(center, this.wh.zones.estacion);
    const stopped = Math.abs(fl.telemetry.speedKmh) < 0.3 && fl.controls.parkingBrake;
    if (inStation && stopped && fl.energy < fl.spec.energyCapacity - 0.01) {
      this.refuelTimer += dt;
      const rate = fl.spec.energyCapacity * 0.08 * dt; // ~12 s para llenar
      const add = Math.min(rate, fl.spec.energyCapacity - fl.energy);
      fl.energy += add;
      const price = RATES.fuelPrice[fl.spec.power] * (this.state.owned.includes('tanque') ? 0.65 : 1);
      this.pendingFuel += add * price;
      if (this.refuelTimer > 0.4) s.hud.toast(fl.isElectric ? '⚡ Cargando batería…' : '⛽ Cargando combustible…', 'info', 'refuel', 4);
    } else if (this.pendingFuel > 0.5) {
      this.charge(s, -Math.round(this.pendingFuel), fl.isElectric ? 'Energía para la batería' : 'Combustible');
      this.pendingFuel = 0;
      this.refuelTimer = 0;
    }
  }
  private pendingFuel = 0;

  /** ¿El pallet está guardado (rack propio o zona de estiba en piso)? */
  private storedWhere(s: Session, e: PalletEntity): InventoryItem['where'] | null {
    const w = s.world;
    if (!w.palletUpright(e) || s.fl.carried.has(e.phys.body.handle)) return null;
    for (const sl of this.wh.slots) if (w.palletInSlot(e, sl, 0.35, 0.1)) return { kind: 'slot', slotId: sl.id };
    if (w.palletInZone(e, this.wh.zones.piso)) return { kind: 'floor', x: e.curPos.x, z: e.curPos.z, y: e.curPos.y, yaw: yawOf(e) };
    return null;
  }

  private onTruckBed(s: Session, e: PalletEntity, bay: Bay): boolean {
    const t = bay.truck;
    if (!t) return false;
    const local = e.curPos.clone().sub(t.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), -t.yaw);
    return Math.abs(e.curPos.y - t.bedHeight) < 0.15 && Math.abs(local.x) < 1.3 && Math.abs(local.z) < 6.1 && s.world.palletUpright(e) && !s.fl.carried.has(e.phys.body.handle);
  }

  private updateOrders(s: Session) {
    const world = s.world;
    const mult = repMultiplier(this.state.reputation);
    for (const o of this.orders) {
      if (o.status === 'completado' || o.status === 'cancelado') continue;
      // llegada
      if (o.status === 'pendiente' && this.clock >= o.arrival) {
        const bay = this.wh.bays.find((b) => !b.truck && !this.departing.some((d) => d.bay === b));
        if (bay) this.arrive(s, o, bay);
        continue;
      }
      if (o.status === 'pendiente') continue;
      // atraso
      if (o.status === 'en_bahia' && this.clock > o.deadline) {
        o.status = 'tarde';
        this.rep(-4);
        this.state.stats.ordersLate++;
        s.hud.toast(`⏰ El pedido ${o.id} (${clientById(o.client).name}) está atrasado.`, 'danger', `late:${o.id}`, 6);
      }
      const bay = this.wh.bays.find((b) => b.orderId === o.id);
      if (!bay) continue;
      if (o.kind === 'recepcion') {
        let stored = 0;
        let onTruck = 0;
        for (const [pid, tr] of this.tracked) {
          if (tr.inboundOrder !== o.id) continue;
          const e = world.pallets.get(pid);
          if (!e) continue;
          if (this.onTruckBed(s, e, bay)) onTruck++;
          const where = this.storedWhere(s, e);
          if (where) {
            stored++;
            if (!tr.inboundPaid) {
              tr.inboundPaid = true;
              this.state.stats.palletsIn++;
              this.charge(s, Math.round(RATES.inboundPerPallet * mult), `Pallet almacenado (${cargoName(tr.cargo)})`);
            }
          }
        }
        o.progress = stored;
        if (onTruck === 0 && stored >= o.total) this.completeOrder(s, o, bay, []);
      } else {
        // despacho: pallets correctos sobre el camión
        const need = new Map(o.request.map((r) => [r.cargo, r.qty]));
        const loaded: number[] = [];
        let wrong = 0;
        for (const [pid, tr] of this.tracked) {
          const e = world.pallets.get(pid);
          if (!e || !this.onTruckBed(s, e, bay)) continue;
          const left = need.get(tr.cargo) ?? 0;
          if (tr.client === o.client && left > 0 && tr.damage < 0.95) {
            need.set(tr.cargo, left - 1);
            loaded.push(pid);
          } else wrong++;
        }
        o.progress = loaded.length;
        if (wrong > 0) s.hud.toast('Ese pallet no corresponde al pedido: sacalo del camión.', 'warn', `wrong:${o.id}`, 5);
        if (wrong === 0 && loaded.length >= o.total) this.completeOrder(s, o, bay, loaded);
      }
    }
  }

  private arrive(s: Session, o: Order, bay: Bay) {
    const world = s.world;
    const cl = clientById(o.client);
    const t = flatbedTruck(world, 100 + bay.id, bay.center, bay.yaw, { color: o.kind === 'recepcion' ? 'blue' : 'red', label: cl.name.toUpperCase() });
    bay.truck = t;
    bay.orderId = o.id;
    o.bay = bay.id;
    o.status = 'en_bahia';
    if (o.kind === 'recepcion') {
      // pallets sobre la caja: primero el lado cercano, después el lejano
      const near = t.slots.filter((x) => x.id.includes('-D'));
      const far = t.slots.filter((x) => x.id.includes('-I'));
      const order = [...near.filter((_, i) => i % 2 === 0), ...far.filter((_, i) => i % 2 === 0), ...near.filter((_, i) => i % 2 === 1), ...far.filter((_, i) => i % 2 === 1)];
      o.pallets.forEach((p, i) => {
        const sl = order[i % order.length];
        const pos = sl.center.clone();
        pos.y += 0.003;
        const id = `I${this.state.nextId++}`;
        this.spawnPallet(world, p.client, p.cargo, p.mass, p.sku, pos, sl.yaw, id, o.id);
      });
    }
    s.app.audio.chime(true);
    const what = o.kind === 'recepcion' ? `trae ${o.total} pallets para descargar` : `viene a buscar ${o.total} pallets`;
    s.hud.toast(`🚚 Llegó ${cl.name} a la BAHÍA ${bay.id}: ${what}.`, 'info', `arr:${o.id}`, 7);
  }

  private completeOrder(s: Session, o: Order, bay: Bay, loaded: number[]) {
    const mult = repMultiplier(this.state.reputation);
    const late = o.status === 'tarde';
    o.status = 'completado';
    this.state.stats.ordersDone++;
    if (o.kind === 'despacho') {
      let pay = RATES.outboundPerPallet * o.total * mult;
      if (late) pay *= 1 - RATES.latePenalty;
      else pay *= 1 + RATES.onTimeBonus;
      this.state.stats.palletsOut += o.total;
      this.charge(s, Math.round(pay), `Despacho ${o.id} ${late ? '(tarde)' : 'a tiempo'}`);
    } else if (!late) {
      this.charge(s, Math.round(RATES.inboundPerPallet * o.total * mult * RATES.onTimeBonus), `Bonificación descarga ${o.id} a tiempo`);
    }
    this.rep(late ? 1 : 3);
    s.hud.toast(`✅ Pedido ${o.id} completado. El camión se va.`, 'good', `done:${o.id}`, 5);
    s.app.audio.chime(true);
    this.departing.push({ bay, timer: 4, removePallets: loaded });
  }

  private finishDeparture(s: Session, d: { bay: Bay; timer: number; removePallets: number[] }) {
    const world = s.world;
    for (const pid of d.removePallets) {
      world.removePallet(pid);
      this.tracked.delete(pid);
    }
    // pallets que hayan quedado sobre la caja también se van (y se pierden)
    if (d.bay.truck) {
      for (const [pid] of [...this.tracked]) {
        const e = world.pallets.get(pid);
        if (e && this.onTruckBed(s, e, d.bay)) {
          world.removePallet(pid);
          this.tracked.delete(pid);
        }
      }
      removeTruck(world, d.bay.truck);
    }
    d.bay.truck = null;
    d.bay.orderId = null;
    this.departing = this.departing.filter((x) => x !== d);
  }

  // ---------------------------------------------------------------- fin del día
  endDay(s: Session) {
    if (this.dayOver) return;
    this.dayOver = true;
    this.running = false;
    s.safety.config.enabled = false;
    const mult = repMultiplier(this.state.reputation);
    // pedidos sin terminar
    for (const o of this.orders) {
      if (o.status === 'completado') continue;
      if (o.status === 'pendiente') {
        o.status = 'cancelado';
        this.rep(-2);
        this.lines.push({ text: `Pedido ${o.id} no atendido`, amount: 0 });
        continue;
      }
      o.status = 'cancelado';
      this.rep(-6);
      const fine = Math.round((o.kind === 'despacho' ? RATES.outboundPerPallet : RATES.inboundPerPallet) * o.total * 0.5);
      this.state.money -= fine;
      this.lines.push({ text: `Pedido ${o.id} incompleto (multa)`, amount: -fine });
    }
    // camiones que siguen en bahía se van con lo que tengan arriba
    for (const b of this.wh.bays) if (b.truck) this.finishDeparture(s, { bay: b, timer: 0, removePallets: [] });
    // inventario: posiciones al cierre
    const inv: InventoryItem[] = [];
    for (const [pid, tr] of this.tracked) {
      const e = s.world.pallets.get(pid);
      if (!e) continue;
      const where = this.storedWhere(s, e) ?? { kind: 'floor' as const, x: e.curPos.x, z: e.curPos.z, y: Math.max(0, e.curPos.y), yaw: yawOf(e) };
      inv.push({ id: tr.itemId, client: tr.client, cargo: tr.cargo, mass: tr.mass, sku: tr.sku, where, damage: tr.damage });
    }
    this.state.inventory = inv;
    const storedCount = inv.length;
    const storage = Math.round(storedCount * RATES.storagePerDay * mult);
    if (storage) {
      this.state.money += storage;
      this.lines.push({ text: `Almacenaje (${storedCount} pallets)`, amount: storage });
    }
    this.state.money -= RATES.rentPerDay;
    this.lines.push({ text: 'Alquiler del depósito', amount: -RATES.rentPerDay });
    for (const id of this.state.owned) {
      if (id === 'seguro') {
        this.state.money -= 250;
        this.lines.push({ text: 'Seguro de mercadería', amount: -250 });
      }
    }
    if (!this.accidentToday) {
      this.state.stats.daysNoAccident++;
      if (this.state.owned.includes('seguridad')) this.rep(1);
    } else this.state.stats.daysNoAccident = 0;
    // combustible: guardar nivel (el autoelevador se recarga por la noche sólo si es eléctrico, pagando)
    const income = this.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    const expenses = -this.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    const report: DayReport = { day: this.state.day, lines: this.lines, income, expenses, repDelta: this.state.reputation - this.repStart, orders: this.orders };
    this.state.history.push({ day: this.state.day, income, expenses, rep: this.state.reputation });
    this.state.day++;
    saveGame(this.state);
    s.hud.bigMessage('Fin de la jornada', 2.5);
    setTimeout(() => this.onDayEnd(report), 1200);
  }

  pauseItems(s: Session) {
    const items = [
      {
        label: '⏭ Terminar la jornada ahora',
        action: () => {
          s.app.closePause();
          this.clock = DAY_END;
          this.endDay(s);
        },
      },
    ];
    if (s.fl.energy <= 0.01) {
      items.unshift({
        label: `🛻 Pedir auxilio mecánico (${money(RATES.rescue)})`,
        action: () => {
          this.charge(s, -RATES.rescue, 'Auxilio mecánico');
          s.fl.reset(this.wh.spawn.position, this.wh.spawn.yaw);
          s.fl.refuel(0.3);
          s.app.closePause();
        },
      });
    }
    return items;
  }

  // ---------------------------------------------------------------- HUD
  private renderPanel(s: Session) {
    const st = this.state;
    const rows = this.orders
      .filter((o) => o.status !== 'cancelado')
      .slice(0, 7)
      .map((o) => {
        const cl = clientById(o.client);
        const icon = o.kind === 'recepcion' ? '⬇' : '⬆';
        let status = '';
        if (o.status === 'pendiente') status = `llega ${fmtTime(o.arrival)}`;
        else if (o.status === 'en_bahia') status = `bahía ${o.bay} · ${Math.max(0, Math.round(o.deadline - this.clock))} min`;
        else if (o.status === 'tarde') status = `bahía ${o.bay} · ¡TARDE!`;
        else status = 'listo ✓';
        const detail = o.kind === 'despacho' ? o.request.map((r) => `${r.qty}× ${cargoName(r.cargo)}`).join(', ') : `${o.total} pallets`;
        return `<div class="ord ord-${o.status}"><span class="oi">${icon}</span><div class="ob"><div><b style="color:${cl.color}">${escapeHtml(cl.name)}</b> <span class="dim">${o.id}</span></div><div class="od">${escapeHtml(detail)} · ${o.progress}/${o.total}</div></div><span class="os">${status}</span></div>`;
      })
      .join('');
    const insp = this.inspection && this.clock >= this.inspection.from - 30 && this.clock <= this.inspection.to ? `<div class="insp">📋 Inspección ${fmtTime(this.inspection.from)}–${fmtTime(this.inspection.to)}${this.clock >= this.inspection.from ? ' · EN CURSO' : ''}</div>` : '';
    this.panel.innerHTML = `
      <div class="biz-head"><b>Día ${st.day}</b><span class="clock">${fmtTime(Math.min(this.clock, DAY_END))}</span></div>
      <div class="biz-money ${st.money < 0 ? 'neg' : ''}">${money(st.money)}</div>
      <div class="biz-rep">${repStarsHtml(st.reputation)} <span class="dim">reputación</span></div>
      ${insp}
      <div class="orders">${rows || '<div class="dim">Sin pedidos por ahora.</div>'}</div>
      <div class="dim small">Inventario: ${[...this.tracked.values()].filter((t) => t.inboundPaid).length} pallets · Capacidad ${this.capacity()}</div>`;
    void s;
  }
}

function yawOf(e: PalletEntity) {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(e.curQuat);
  return Math.atan2(f.x, f.z);
}

