import * as THREE from 'three';
import type { World, Slot } from './World.ts';
import { ground, building, rack, flatbedTruck, ramp, cone, zone, column, sign, fuelStation, paintLine, staticBox, type ConeEntity } from './builders.ts';
import { materials } from '../render/materials.ts';
import { PedestrianSystem } from './pedestrians.ts';
import { CARGO_TYPES } from '../sim/pallet.ts';

export function placeOnSlot(world: World, slot: Slot, cargo: string, mass?: number, opts: { type?: 'eur' | 'arlog'; label?: { text: string; color: string }; meta?: Record<string, unknown> } = {}) {
  const p = slot.center.clone();
  p.y += 0.003;
  return world.addPallet({ cargo, mass, position: p, yaw: slot.yaw, sleeping: true, type: opts.type, label: opts.label, meta: opts.meta });
}

/** Altura total (pallet + carga) de un tipo de carga. */
export function cargoHeight(cargoId: string): number {
  const c = CARGO_TYPES.find((x) => x.id === cargoId);
  return 0.144 + (c?.height ?? 1);
}

export function randomCargo(rand: () => number, maxMass = 2400, maxHeight = 9): { cargo: string; mass: number } {
  const options = CARGO_TYPES.filter((c) => c.style !== 'empty' && c.massMin <= maxMass && 0.144 + c.height <= maxHeight);
  const c = options[Math.floor(rand() * options.length)];
  const mass = Math.round(c.massMin + (Math.min(c.massMax, maxMass) - c.massMin) * rand());
  return { cargo: c.id, mass };
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface PracticeCenter {
  spawn: { position: THREE.Vector3; yaw: number };
  cones: ConeEntity[];
}

/**
 * Centro de práctica (modo libre): galpón de 60×40 m con racks, zonas de piso,
 * patio con camiones, rampa a plataforma y circuito de conos.
 */
export function buildPracticeCenter(world: World, opts: { pedestrians?: boolean } = {}): PracticeCenter {
  const r = rng(42);
  ground(world, { size: 260, inside: { x0: -30, z0: -20, x1: 30, z1: 20 } });
  building(world, -30, -20, 30, 20, 9, [
    { wall: 's', at: -14, width: 5.5, height: 5.2 },
    { wall: 's', at: 8, width: 5.5, height: 5.2 },
    { wall: 'e', at: -6, width: 5, height: 5.2 },
  ]);
  for (const x of [-18, -6, 6, 18]) column(world, x, -2.5, 9);

  // --- Estanterías ---
  // Fila A contra la pared norte, mirando al sur
  const A = rack(world, { id: 1, name: 'A', origin: new THREE.Vector3(26, 0, 18.6), yaw: Math.PI, bays: 8, levels: [0, 1.5, 3.0], color: 'blue' });
  // Fila B/C doble (lomo con lomo). Pasillos de 4,4 m para autoelevadores contrapesados
  const B2 = rack(world, { id: 2, name: 'B', origin: new THREE.Vector3(2.5, 0, 14.2), yaw: 0, bays: 8, levels: [0, 1.5, 3.0, 4.2], color: 'orange' });
  const B1 = rack(world, { id: 3, name: 'C', origin: new THREE.Vector3(23.71, 0, 11.85), yaw: Math.PI, bays: 8, levels: [0, 1.5, 3.0, 4.2], color: 'orange' });
  // carteles de pasillo
  sign(world, 'PASILLO 1', new THREE.Vector3(1.4, 4.2, 16.4), Math.PI / 2, 2.4, 0.6, { post: false });
  sign(world, 'PASILLO 2', new THREE.Vector3(1.4, 4.2, 9.8), Math.PI / 2, 2.4, 0.6, { post: false });
  // pintura de pasillos
  paintLine(world, 1.5, 18.6 - 0.2, 26, 18.6 - 0.2, 0.08, 0xf2c200);
  paintLine(world, 1.5, 14.2 + 0.2, 26, 14.2 + 0.2, 0.08, 0xf2c200);
  paintLine(world, 1.5, 11.85 - 0.2, 26, 11.85 - 0.2, 0.08, 0xf2c200);

  // Ocupación inicial de los racks (algunos huecos libres para practicar)
  const fill = (slots: Slot[], prob: number) => {
    for (const s of slots) {
      if (r() < prob) {
        const c = randomCargo(r, s.level >= 2 ? 1000 : 1600, s.clearance);
        placeOnSlot(world, s, c.cargo, c.mass);
      }
    }
  };
  fill(A, 0.45);
  fill(B2, 0.4);
  fill(B1, 0.4);

  // --- Zonas de piso ---
  zone(world, { id: 'recepcion', label: 'RECEPCIÓN', center: new THREE.Vector3(-14, 0, -12), width: 9, depth: 6, yaw: 0, color: 0x2b6cd6, kind: 'recepcion' }, { fill: true });
  zone(world, { id: 'despacho', label: 'DESPACHO', center: new THREE.Vector3(8, 0, -12), width: 9, depth: 6, yaw: 0, color: 0x2e9b4e, kind: 'despacho' }, { fill: true });
  zone(world, { id: 'piso', label: 'ESTIBA EN PISO', center: new THREE.Vector3(-19, 0, 10), width: 12, depth: 12, yaw: 0, color: 0xf2c200, kind: 'piso' }, { dashed: true });
  // pallets en el piso para practicar
  const floorCargos = ['cajas', 'bebidas', 'cemento', 'ladrillos', 'tambores', 'bobina', 'maquina', 'pallets', 'ceramicos'];
  floorCargos.forEach((cg, i) => {
    const x = -23.5 + (i % 3) * 4;
    const z = 6 + Math.floor(i / 3) * 3.2;
    world.addPallet({ cargo: cg, position: new THREE.Vector3(x, 0.002, z), yaw: Math.PI, sleeping: true });
  });
  // estación de carga / surtidor
  fuelStation(world, new THREE.Vector3(-27.5, 0, -16), Math.PI / 2, false);
  fuelStation(world, new THREE.Vector3(-27.5, 0, -12.5), Math.PI / 2, true);
  zone(world, { id: 'estacion', label: 'CARGA', center: new THREE.Vector3(-25, 0, -14.2), width: 3.4, depth: 6, yaw: 0, color: 0xd62a2a, kind: 'estacion' }, {});
  // senda peatonal
  paintLine(world, -30, -1.2, 30, -1.2, 0.12, 0x2e9b4e);
  paintLine(world, -30, 0.2, 30, 0.2, 0.12, 0x2e9b4e);
  sign(world, 'SENDA\nPEATONAL', new THREE.Vector3(-29.8, 2.2, -0.5), Math.PI / 2, 1.4, 0.8, { bg: '#2e9b4e' });

  // --- Patio ---
  const t1 = flatbedTruck(world, 1, new THREE.Vector3(-14, 0, -32), Math.PI / 2, { color: 'blue', label: 'TRANSPORTES SUR' });
  const t2 = flatbedTruck(world, 2, new THREE.Vector3(8, 0, -44), -Math.PI / 2, { color: 'red', label: 'LOGÍSTICA NORTE' });
  // algunos pallets cargados en el camión 2
  t2.slots.filter((_, i) => i % 3 === 0).forEach((s) => {
    const c = randomCargo(r, 1400);
    placeOnSlot(world, s, c.cargo, c.mass);
  });
  void t1;
  // rampa a plataforma elevada (pendiente ~13 %)
  ramp(world, new THREE.Vector3(22, 0, -24), Math.PI, 9, 4.2, 1.2, 7);
  // cordones en los bordes de la plataforma
  for (const x of [19.98, 24.02]) staticBox(world, new THREE.Vector3(x, 1.2 + 0.08, -36.5), new THREE.Vector3(0.16, 0.16, 7), 0, materials().stripes, 'dock');
  staticBox(world, new THREE.Vector3(22, 1.2 + 0.08, -39.92), new THREE.Vector3(4.2, 0.16, 0.16), 0, materials().stripes, 'dock');
  sign(world, 'RAMPA 13%\nCARGA ARRIBA', new THREE.Vector3(25.2, 1.6, -24.5), Math.PI / 2 + 0.5, 1.6, 0.9, { bg: '#f2c200', fg: '#111', post: true });
  for (let i = 0; i < 3; i++) {
    const c = randomCargo(r, 1200);
    world.addPallet({ cargo: c.cargo, mass: c.mass, position: new THREE.Vector3(20.6 + i * 1.4, 1.2 + 0.003, -37.5), yaw: 0, sleeping: true });
  }
  // circuito de conos (slalom)
  const cones: ConeEntity[] = [];
  for (let i = 0; i < 7; i++) cones.push(cone(world, -42 + i * 4.5, -52 + (i % 2 ? 1.2 : -1.2)));
  zone(world, { id: 'slalom', label: 'SLALOM', center: new THREE.Vector3(-28.5, 0, -52), width: 36, depth: 7, yaw: 0, color: 0xf2f2f2, kind: 'meta' }, { dashed: true });
  // estacionamiento marcado
  for (let i = 0; i < 3; i++) {
    zone(world, { id: `est${i}`, label: 'P', center: new THREE.Vector3(-26 + i * 3, 0, -26), width: 2.4, depth: 4.2, yaw: 0, color: 0xf2f2f2, kind: 'estacionamiento' }, {});
  }
  if (opts.pedestrians === false) return { spawn: { position: new THREE.Vector3(-8, 0.02, -8), yaw: 0 }, cones };
  // peatones por la senda peatonal y hacia la oficina
  const peds = new PedestrianSystem(world);
  world.peds = peds;
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  peds.add([V(-27, -0.5), V(27, -0.5)], { speed: 1.2 });
  peds.add([V(24, -0.5), V(-24, -0.5)], { speed: 1.0, vest: 0xff7a1a });
  peds.add([V(-28, -0.5), V(-23, -5), V(-23, -17.5), V(-28, -0.5)], { speed: 1.1, distracted: true });
  return { spawn: { position: new THREE.Vector3(-8, 0.02, -8), yaw: 0 }, cones };
}
