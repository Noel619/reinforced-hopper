import { storageGet, storageSet } from '../../app/settings.ts';
import { CARGO_TYPES, getCargoType } from '../../sim/pallet.ts';
import { FORKLIFT_SPECS } from '../../sim/specs.ts';

/** Minutos de juego por segundo real. Jornada 08:00–18:00 = 10 minutos reales. */
export const MINUTES_PER_SECOND = 1;
export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;

export interface Client {
  id: string;
  name: string;
  color: string;
  cargos: string[];
}

export const CLIENTS: Client[] = [
  { id: 'dsur', name: 'Distribuidora Sur', color: '#1f6fb5', cargos: ['bebidas', 'cajas'] },
  { id: 'cnorte', name: 'Corralón El Norte', color: '#b3261e', cargos: ['cemento', 'ladrillos', 'ceramicos'] },
  { id: 'qandina', name: 'Química Andina', color: '#7b2fbf', cargos: ['tambores'] },
  { id: 'ehogar', name: 'Electro Hogar', color: '#e8701a', cargos: ['cajas', 'maquina'] },
  { id: 'aplata', name: 'Acería del Plata', color: '#4b5563', cargos: ['bobina'] },
  { id: 'reciclar', name: 'Reciclados Pampa', color: '#2e9b4e', cargos: ['pallets'] },
];

export function clientById(id: string): Client {
  return CLIENTS.find((c) => c.id === id) ?? CLIENTS[0];
}

export const RATES = {
  inboundPerPallet: 90,
  outboundPerPallet: 120,
  storagePerDay: 12,
  rentPerDay: 450,
  onTimeBonus: 0.2,
  latePenalty: 0.3,
  fuelPrice: { glp: 2.2, diesel: 1.8, electrico: 0.45 } as Record<string, number>,
  rackRepairBase: 150,
  rackRepairPerSeverity: 1500,
  pedestrianFine: 5000,
  inspectionFine: 150,
  rescue: 300,
};

export interface InventoryItem {
  id: string;
  client: string;
  cargo: string;
  mass: number;
  sku: string;
  /** Dónde quedó guardado al final del día. */
  where: { kind: 'slot'; slotId: string } | { kind: 'floor'; x: number; z: number; yaw: number; y: number };
  damage: number;
}

export interface OrderPallet {
  client: string;
  cargo: string;
  mass: number;
  sku: string;
}

export interface Order {
  id: string;
  kind: 'recepcion' | 'despacho';
  client: string;
  /** Minuto del día en que llega el camión */
  arrival: number;
  /** Minuto límite para completarlo */
  deadline: number;
  /** Recepción: pallets que trae el camión */
  pallets: OrderPallet[];
  /** Despacho: cantidad pedida por tipo de carga */
  request: { cargo: string; qty: number }[];
  bay: number;
  status: 'pendiente' | 'en_bahia' | 'completado' | 'tarde' | 'cancelado';
  paid: number;
  progress: number;
  total: number;
}

export interface ShopItem {
  id: string;
  category: 'autoelevador' | 'accesorio' | 'instalacion' | 'servicio';
  name: string;
  description: string;
  price: number;
  /** Requisitos (ids comprados) */
  requires?: string[];
  /** Pagos diarios (servicios) */
  daily?: number;
}

export const SHOP: ShopItem[] = [
  { id: 'bascula', category: 'accesorio', name: 'Báscula de horquillas', description: 'Muestra el peso de la carga en el tablero y en el HUD. Evita sobrecargas.', price: 1800 },
  { id: 'altura', category: 'accesorio', name: 'Indicador de altura', description: 'Muestra la altura exacta de las horquillas: ideal para estibar en racks altos.', price: 900 },
  { id: 'camara', category: 'accesorio', name: 'Cámara de horquillas', description: 'Cámara en el carro con monitor en cabina (tecla G / vista de horquillas).', price: 2400 },
  { id: 'luz_azul', category: 'accesorio', name: 'Luz azul de seguridad', description: 'Proyecta un punto azul detrás del autoelevador para alertar a los peatones.', price: 600 },
  { id: 'desplazador', category: 'accesorio', name: 'Desplazador lateral', description: 'Agrega desplazador lateral al Toro 15 (los demás modelos ya lo traen).', price: 3500 },
  { id: 'rack2', category: 'instalacion', name: 'Estantería norte · módulo 2', description: '+24 posiciones (3 niveles hasta 3,0 m).', price: 6000 },
  { id: 'rack3', category: 'instalacion', name: 'Estantería norte · módulo 3', description: '+24 posiciones (3 niveles hasta 3,0 m).', price: 7500, requires: ['rack2'] },
  { id: 'rack4', category: 'instalacion', name: 'Estantería central doble · módulo A', description: '+64 posiciones en 4 niveles (el último a 4,2 m: requiere mástil alto).', price: 14000 },
  { id: 'rack5', category: 'instalacion', name: 'Estantería central doble · módulo B', description: '+64 posiciones en 4 niveles.', price: 15000, requires: ['rack4'] },
  { id: 'rack6', category: 'instalacion', name: 'Estantería central doble · módulo C', description: '+64 posiciones en 4 niveles.', price: 16000, requires: ['rack5'] },
  { id: 'bahia3', category: 'instalacion', name: 'Tercera bahía de camiones', description: 'Permite atender más camiones por día.', price: 8000 },
  { id: 'bahia4', category: 'instalacion', name: 'Cuarta bahía de camiones', description: 'Todavía más pedidos diarios.', price: 10000, requires: ['bahia3'] },
  { id: 'tanque', category: 'instalacion', name: 'Tanque/cargador propio', description: 'El combustible o la energía cuestan 35 % menos.', price: 3000 },
  { id: 'seguridad', category: 'servicio', name: 'Programa de seguridad', description: 'Capacitación y señalización: la mitad de multas en inspecciones y +1 reputación por día sin accidentes.', price: 2000 },
  { id: 'seguro', category: 'servicio', name: 'Seguro de mercadería', description: 'Cubre el 70 % de los daños a la carga. Cuesta $250 por día.', price: 500, daily: 250 },
  { id: 'publicidad', category: 'servicio', name: 'Campaña de publicidad', description: '+8 de reputación y más pedidos.', price: 2500 },
];

export interface BusinessState {
  version: 1;
  day: number;
  money: number;
  reputation: number;
  specId: string;
  owned: string[];
  inventory: InventoryItem[];
  stats: { palletsIn: number; palletsOut: number; accidents: number; ordersDone: number; ordersLate: number; daysNoAccident: number };
  history: { day: number; income: number; expenses: number; rep: number }[];
  nextId: number;
  seed: number;
}

const SAVE_KEY = 'autoelevador.almacen.v1';

export function newGame(): BusinessState {
  return {
    version: 1,
    day: 1,
    money: 8000,
    reputation: 50,
    specId: 'toro15',
    owned: [],
    inventory: [],
    stats: { palletsIn: 0, palletsOut: 0, accidents: 0, ordersDone: 0, ordersLate: 0, daysNoAccident: 0 },
    history: [],
    nextId: 1,
    seed: Math.floor(Math.random() * 1e9),
  };
}

export function loadGame(): BusinessState | null {
  const s = storageGet<BusinessState | null>(SAVE_KEY, null);
  if (!s || s.version !== 1) return null;
  return s;
}

export function saveGame(s: BusinessState) {
  storageSet(SAVE_KEY, s);
}

export function deleteGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

export function repMultiplier(rep: number) {
  return 0.8 + (Math.max(0, Math.min(100, rep)) / 100) * 0.5;
}

export function repStars(rep: number) {
  return Math.round((Math.max(0, Math.min(100, rep)) / 100) * 5 * 2) / 2;
}

export function fmtTime(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function sellValue(specId: string) {
  const spec = FORKLIFT_SPECS.find((s) => s.id === specId);
  return Math.round((spec?.price ?? 0) * 0.5);
}

export function cargoValue(cargo: string, mass: number) {
  return getCargoType(cargo).valuePerKg * mass;
}

/** Genera los pedidos del día según capacidad, inventario y reputación. */
export function generateOrders(state: BusinessState, capacity: number, bays: number, maxLiftCapacity: number): Order[] {
  const r = rng(state.seed + state.day * 7919);
  const orders: Order[] = [];
  const free = capacity - state.inventory.length;
  const repBoost = state.reputation / 100;
  // Recepciones
  const nIn = Math.max(1, Math.min(bays + 1, Math.round(1 + repBoost * 2 + r() * 1.2)));
  let freeLeft = free;
  const times: number[] = [];
  for (let i = 0; i < nIn && freeLeft >= 2; i++) {
    const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
    const n = Math.min(freeLeft, Math.min(10, 3 + Math.floor(r() * (3 + state.day * 0.4 + repBoost * 3))));
    freeLeft -= n;
    const pallets: OrderPallet[] = [];
    for (let k = 0; k < n; k++) {
      const cg = getCargoType(client.cargos[Math.floor(r() * client.cargos.length)]);
      const maxM = Math.min(cg.massMax, maxLiftCapacity * 0.95);
      const mass = Math.round(Math.max(cg.massMin * 0.6, cg.massMin + (maxM - cg.massMin) * r()) / 10) * 10;
      pallets.push({ client: client.id, cargo: cg.id, mass, sku: `${client.id.toUpperCase().slice(0, 3)}-${cg.id.slice(0, 3).toUpperCase()}-${100 + Math.floor(r() * 900)}` });
    }
    const arrival = DAY_START + 15 + Math.floor(r() * 360);
    times.push(arrival);
    orders.push({
      id: `R${state.day}-${i + 1}`,
      kind: 'recepcion',
      client: client.id,
      arrival,
      deadline: arrival + 25 + n * 9,
      pallets,
      request: [],
      bay: -1,
      status: 'pendiente',
      paid: 0,
      progress: 0,
      total: n,
    });
  }
  // Despachos desde el inventario
  const byClient = new Map<string, Map<string, number>>();
  for (const it of state.inventory) {
    const m = byClient.get(it.client) ?? new Map<string, number>();
    m.set(it.cargo, (m.get(it.cargo) ?? 0) + 1);
    byClient.set(it.client, m);
  }
  const clientsWithStock = [...byClient.keys()];
  const nOut = Math.min(clientsWithStock.length, Math.round(1 + repBoost * 2 + r()));
  for (let i = 0; i < nOut; i++) {
    const ci = Math.floor(r() * clientsWithStock.length);
    const cid = clientsWithStock.splice(ci, 1)[0];
    const stock = byClient.get(cid)!;
    const request: { cargo: string; qty: number }[] = [];
    let total = 0;
    for (const [cargo, qty] of stock) {
      if (total >= 6) break;
      const take = Math.max(1, Math.min(qty, Math.floor(1 + r() * Math.min(qty, 4))));
      request.push({ cargo, qty: take });
      total += take;
    }
    const arrival = DAY_START + 60 + Math.floor(r() * 420);
    orders.push({
      id: `D${state.day}-${i + 1}`,
      kind: 'despacho',
      client: cid,
      arrival,
      deadline: arrival + 25 + total * 10,
      pallets: [],
      request,
      bay: -1,
      status: 'pendiente',
      paid: 0,
      progress: 0,
      total,
    });
  }
  orders.sort((a, b) => a.arrival - b.arrival);
  return orders;
}

export function cargoName(id: string) {
  return CARGO_TYPES.find((c) => c.id === id)?.name ?? id;
}
