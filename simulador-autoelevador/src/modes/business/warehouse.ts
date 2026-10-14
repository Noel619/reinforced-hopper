import * as THREE from 'three';
import type { World, Slot, Zone, TruckInfo } from '../../world/World.ts';
import { ground, building, rack, zone, column, sign, fuelStation, paintLine, staticBox, paintText } from '../../world/builders.ts';
import { PedestrianSystem } from '../../world/pedestrians.ts';
import { materials } from '../../render/materials.ts';

export interface Bay {
  id: number;
  center: THREE.Vector3;
  yaw: number;
  truck: TruckInfo | null;
  orderId: string | null;
}

export interface Warehouse {
  spawn: { position: THREE.Vector3; yaw: number };
  bays: Bay[];
  zones: { recepcion: Zone; despacho: Zone; piso: Zone; estacion: Zone };
  slots: Slot[];
  floorCapacity: number;
}

interface ModuleDef {
  id: string;
  racks: { origin: [number, number]; yaw: number; levels: number[]; name: string }[];
  /** Rectángulo del área (para marcar "disponible") */
  area: [number, number, number, number];
}

export const MODULES: ModuleDef[] = [
  { id: 'rack1', racks: [{ origin: [-10.85, 14.6], yaw: Math.PI, levels: [0, 1.5, 3.0], name: 'N1' }], area: [-21.5, 14.6, -10.85, 15.65] },
  { id: 'rack2', racks: [{ origin: [1.35, 14.6], yaw: Math.PI, levels: [0, 1.5, 3.0], name: 'N2' }], area: [-9.3, 14.6, 1.35, 15.65] },
  { id: 'rack3', racks: [{ origin: [13.55, 14.6], yaw: Math.PI, levels: [0, 1.5, 3.0], name: 'N3' }], area: [2.9, 14.6, 13.55, 15.65] },
  {
    id: 'rack4',
    racks: [
      { origin: [-21.5, 10.2], yaw: 0, levels: [0, 1.5, 3.0, 4.5], name: 'A' },
      { origin: [-10.85, 7.85], yaw: Math.PI, levels: [0, 1.5, 3.0, 4.5], name: 'B' },
    ],
    area: [-21.5, 7.85, -10.85, 10.2],
  },
  {
    id: 'rack5',
    racks: [
      { origin: [-9.3, 10.2], yaw: 0, levels: [0, 1.5, 3.0, 4.5], name: 'C' },
      { origin: [1.35, 7.85], yaw: Math.PI, levels: [0, 1.5, 3.0, 4.5], name: 'D' },
    ],
    area: [-9.3, 7.85, 1.35, 10.2],
  },
  {
    id: 'rack6',
    racks: [
      { origin: [2.9, 10.2], yaw: 0, levels: [0, 1.5, 3.0, 4.5], name: 'E' },
      { origin: [13.55, 7.85], yaw: Math.PI, levels: [0, 1.5, 3.0, 4.5], name: 'F' },
    ],
    area: [2.9, 7.85, 13.55, 10.2],
  },
];

/** Construye el depósito propio según las instalaciones compradas. */
export function buildWarehouse(world: World, owned: string[]): Warehouse {
  const M = materials();
  ground(world, { size: 220, inside: { x0: -24, z0: -16, x1: 24, z1: 16 } });
  building(world, -24, -16, 24, 16, 9, [
    { wall: 's', at: -11, width: 6, height: 5.5 },
    { wall: 's', at: 11, width: 6, height: 5.5 },
  ]);
  for (const x of [-12, 0, 12]) column(world, x, 2.6, 9);

  // estanterías compradas
  const slots: Slot[] = [];
  let rackId = 10;
  for (const m of MODULES) {
    const has = m.id === 'rack1' || owned.includes(m.id);
    if (has) {
      for (const r of m.racks) {
        slots.push(...rack(world, { id: rackId++, name: r.name, origin: new THREE.Vector3(r.origin[0], 0, r.origin[1]), yaw: r.yaw, bays: 4, levels: r.levels, color: m.racks.length > 1 ? 'orange' : 'blue' }));
      }
    } else {
      const [x0, z0, x1, z1] = m.area;
      zone(world, { id: `venta-${m.id}`, label: 'AMPLIACIÓN DISPONIBLE', center: new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), width: x1 - x0, depth: Math.max(1.2, z1 - z0), yaw: 0, color: 0x6d7a88, kind: 'piso' }, { dashed: true, text: false });
      paintText(world, 'AMPLIACIÓN DISPONIBLE', (x0 + x1) / 2, (z0 + z1) / 2, Math.PI, Math.min(8, x1 - x0 - 1), 0.6, '#8fa0b2');
    }
  }
  // pasillos
  paintLine(world, -22, 14.6 - 0.2, 14, 14.6 - 0.2, 0.08, 0xf2c200);
  paintLine(world, -22, 10.2 + 0.2, 14, 10.2 + 0.2, 0.08, 0xf2c200);
  paintLine(world, -22, 7.85 - 0.2, 14, 7.85 - 0.2, 0.08, 0xf2c200);

  // zonas
  const recepcion = zone(world, { id: 'recepcion', label: 'RECEPCIÓN', center: new THREE.Vector3(-11, 0, -10.6), width: 8, depth: 5, yaw: 0, color: 0x2b6cd6, kind: 'recepcion' }, { fill: true });
  const despacho = zone(world, { id: 'despacho', label: 'DESPACHO', center: new THREE.Vector3(11, 0, -10.6), width: 8, depth: 5, yaw: 0, color: 0x2e9b4e, kind: 'despacho' }, { fill: true });
  const piso = zone(world, { id: 'piso', label: 'ESTIBA EN PISO', center: new THREE.Vector3(20.2, 0, 0.5), width: 7.2, depth: 11, yaw: 0, color: 0xf2c200, kind: 'piso' }, { dashed: true, fill: true });
  const estacion = zone(world, { id: 'estacion', label: 'CARGA', center: new THREE.Vector3(-21.8, 0, -9.5), width: 3.4, depth: 5.6, yaw: 0, color: 0xd62a2a, kind: 'estacion' }, {});
  fuelStation(world, new THREE.Vector3(-23.4, 0, -11.2), Math.PI / 2, false);
  fuelStation(world, new THREE.Vector3(-23.4, 0, -7.8), Math.PI / 2, true);
  sign(world, 'CARGA DE\nCOMBUSTIBLE', new THREE.Vector3(-23.7, 2.6, -9.5), Math.PI / 2, 1.8, 0.9, { bg: '#d62a2a' });

  // oficina (visual + colisión)
  const office = staticBox(world, new THREE.Vector3(20.5, 1.5, -13), new THREE.Vector3(6.6, 3, 5.4), 0, new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.8 }), 'wall', { occluder: true });
  void office;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x8fb3cf, roughness: 0.1, metalness: 0.3 }));
  win.position.set(20.5, 1.7, -10.29);
  world.staticGroup.add(win);
  sign(world, 'OFICINA', new THREE.Vector3(20.5, 2.75, -10.27), 0, 2.2, 0.45, { bg: '#1d4f8f' });
  // senda peatonal
  paintLine(world, -23, -6.0, 16.2, -6.0, 0.12, 0x2e9b4e);
  paintLine(world, -23, -7.3, 14.9, -7.3, 0.12, 0x2e9b4e);
  paintLine(world, 14.9, -10, 14.9, 6.5, 0.12, 0x2e9b4e);
  paintLine(world, 16.2, -10, 16.2, 6.5, 0.12, 0x2e9b4e);
  sign(world, 'VELOCIDAD MÁX\n10 km/h', new THREE.Vector3(-1, 3.2, -15.75), 0, 1.8, 0.9, { bg: '#ffffff', fg: '#c81e1e' });
  void M;

  // bahías de camiones
  const bayDefs: [number, number][] = [
    [-11, -24],
    [11, -24],
  ];
  if (owned.includes('bahia3')) bayDefs.push([-11, -37]);
  if (owned.includes('bahia4')) bayDefs.push([11, -37]);
  const bays: Bay[] = bayDefs.map(([x, z], i) => {
    zone(world, { id: `bahia${i + 1}`, label: `BAHÍA ${i + 1}`, center: new THREE.Vector3(x + 1.5, 0, z), width: 18, depth: 3.6, yaw: 0, color: 0xf2f2f2, kind: 'carga' }, { dashed: true });
    return { id: i + 1, center: new THREE.Vector3(x, 0, z), yaw: Math.PI / 2, truck: null, orderId: null };
  });

  // peatones
  const peds = new PedestrianSystem(world);
  world.peds = peds;
  const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  peds.add([V(15.55, -9.6), V(15.55, 5.5), V(15.55, -6.6), V(-22, -6.6), V(15.55, -6.6)], { speed: 1.15 });
  peds.add([V(-20, -6.6), V(14, -6.6)], { speed: 1.0, vest: 0xff7a1a, distracted: true });

  return {
    spawn: { position: new THREE.Vector3(-19.5, 0.02, -9.6), yaw: Math.PI / 2 },
    bays,
    zones: { recepcion, despacho, piso, estacion },
    slots,
    floorCapacity: 16,
  };
}
