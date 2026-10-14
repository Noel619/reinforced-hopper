import * as THREE from 'three';
import { RAPIER, GROUPS, type PhysicsWorld } from './physics.ts';

/** Tipos de pallet. Medidas en metros. El largo va sobre el eje Z local. */
export interface PalletType {
  id: 'eur' | 'arlog';
  name: string;
  width: number; // eje X (lado de entrada estándar de horquillas)
  length: number; // eje Z
  blockHeight: number;
  deckThickness: number;
  /** Anchos de los tacos sobre X: [borde, centro]. */
  blockWX: [number, number];
  blockWZ: number;
  mass: number;
}

export const PALLET_TYPES: Record<PalletType['id'], PalletType> = {
  eur: {
    id: 'eur',
    name: 'Europallet 1200×800',
    width: 0.8,
    length: 1.2,
    blockHeight: 0.1,
    deckThickness: 0.044,
    blockWX: [0.1, 0.145],
    blockWZ: 0.145,
    mass: 25,
  },
  arlog: {
    id: 'arlog',
    name: 'Pallet ARLOG 1200×1000',
    width: 1.0,
    length: 1.2,
    blockHeight: 0.1,
    deckThickness: 0.044,
    blockWX: [0.145, 0.145],
    blockWZ: 0.145,
    mass: 30,
  },
};

export type CargoStyle = 'boxes' | 'sacks' | 'drums' | 'bricks' | 'drinks' | 'coil' | 'empty' | 'pallets' | 'tiles' | 'machine';

export interface CargoType {
  id: string;
  name: string;
  style: CargoStyle;
  /** Alto de la carga (m). */
  height: number;
  /** Factor de ocupación de la planta del pallet (0..1). */
  footprint: number;
  massMin: number;
  massMax: number;
  /** Valor por kg ($), para costo de daños y pagos. */
  valuePerKg: number;
  /** Fragilidad: 1 = muy frágil. Multiplica el daño por impactos. */
  fragility: number;
  /** Desplazamiento vertical del CDG relativo (0.5 = centro). */
  cgFactor: number;
}

export const CARGO_TYPES: CargoType[] = [
  { id: 'cajas', name: 'Cajas de cartón', style: 'boxes', height: 1.0, footprint: 0.98, massMin: 250, massMax: 500, valuePerKg: 6, fragility: 0.9, cgFactor: 0.5 },
  { id: 'bebidas', name: 'Bebidas', style: 'drinks', height: 1.3, footprint: 0.98, massMin: 700, massMax: 950, valuePerKg: 2.2, fragility: 1.0, cgFactor: 0.5 },
  { id: 'cemento', name: 'Bolsas de cemento', style: 'sacks', height: 0.85, footprint: 0.98, massMin: 1000, massMax: 1500, valuePerKg: 0.35, fragility: 0.4, cgFactor: 0.45 },
  { id: 'ladrillos', name: 'Ladrillos', style: 'bricks', height: 0.9, footprint: 0.95, massMin: 1100, massMax: 1400, valuePerKg: 0.4, fragility: 0.6, cgFactor: 0.5 },
  { id: 'tambores', name: 'Tambores (4×200 L)', style: 'drums', height: 0.9, footprint: 1.0, massMin: 700, massMax: 880, valuePerKg: 1.8, fragility: 0.7, cgFactor: 0.5 },
  { id: 'ceramicos', name: 'Cerámicos', style: 'tiles', height: 0.7, footprint: 0.9, massMin: 1300, massMax: 1650, valuePerKg: 1.4, fragility: 1.2, cgFactor: 0.45 },
  { id: 'bobina', name: 'Bobina de acero', style: 'coil', height: 0.85, footprint: 0.75, massMin: 1800, massMax: 2400, valuePerKg: 1.1, fragility: 0.2, cgFactor: 0.5 },
  { id: 'maquina', name: 'Máquina embalada', style: 'machine', height: 1.4, footprint: 0.9, massMin: 900, massMax: 1300, valuePerKg: 9, fragility: 1.1, cgFactor: 0.4 },
  { id: 'pallets', name: 'Pila de pallets vacíos', style: 'pallets', height: 1.15, footprint: 1.0, massMin: 200, massMax: 260, valuePerKg: 2, fragility: 0.1, cgFactor: 0.5 },
  { id: 'vacio', name: 'Pallet vacío', style: 'empty', height: 0, footprint: 0, massMin: 0, massMax: 0, valuePerKg: 0, fragility: 0, cgFactor: 0.5 },
];

export function getCargoType(id: string): CargoType {
  return CARGO_TYPES.find((c) => c.id === id) ?? CARGO_TYPES[0];
}

export interface PalletOptions {
  type: PalletType['id'];
  cargo: string;
  cargoMass?: number;
  position: THREE.Vector3;
  yaw: number;
  id: number;
  /** Crear dormido (apoyado en su lugar, sin asentarse hasta que algo lo toque). */
  sleeping?: boolean;
}

/** Datos de un pallet físico en el mundo. */
export class PalletBody {
  readonly id: number;
  readonly type: PalletType;
  readonly cargo: CargoType;
  readonly cargoMass: number;
  readonly totalMass: number;
  readonly height: number;
  readonly cargoSize: THREE.Vector3;
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];

  constructor(pw: PhysicsWorld, opts: PalletOptions) {
    this.id = opts.id;
    this.type = PALLET_TYPES[opts.type];
    this.cargo = getCargoType(opts.cargo);
    const pt = this.type;
    const cg = this.cargo;
    const mass = opts.cargoMass ?? (cg.massMin + cg.massMax) / 2;
    this.cargoMass = cg.style === 'empty' ? 0 : mass;
    this.totalMass = pt.mass + this.cargoMass;
    const deckTop = pt.blockHeight + pt.deckThickness;
    this.height = deckTop + cg.height;

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(opts.position.x, opts.position.y, opts.position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.05)
      .setAngularDamping(0.15)
      .setCcdEnabled(true)
      .setSleeping(!!opts.sleeping);
    this.body = pw.world.createRigidBody(desc);

    const blockMass = (pt.mass * 0.4) / 9;
    const deckMass = pt.mass * 0.6;
    const wood = 0.5;

    // Tablero superior
    this.addBox(pw, pt.width / 2, pt.deckThickness / 2, pt.length / 2, 0, pt.blockHeight + pt.deckThickness / 2, 0, deckMass, wood);

    // Tacos 3×3
    const xs = [-pt.width / 2 + pt.blockWX[0] / 2, 0, pt.width / 2 - pt.blockWX[0] / 2];
    const wx = [pt.blockWX[0], pt.blockWX[1], pt.blockWX[0]];
    const zs = [-pt.length / 2 + pt.blockWZ / 2, 0, pt.length / 2 - pt.blockWZ / 2];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        this.addBox(pw, wx[i] / 2, pt.blockHeight / 2, pt.blockWZ / 2, xs[i], pt.blockHeight / 2, zs[j], blockMass, wood);
      }
    }

    // Carga
    const fp = Math.sqrt(Math.max(cg.footprint, 0.01));
    this.cargoSize = new THREE.Vector3(pt.width * fp, cg.height, pt.length * fp);
    if (cg.style !== 'empty' && cg.height > 0) {
      // Masa repartida en dos cajas apiladas para ubicar el CDG según cgFactor
      // CDG = h/4 + (mU/m)·h/2  ⇒  mU/m = 2·(cgFactor − 0,25)
      const h = cg.height;
      const lowerH = h * 0.5;
      const upperH = h - lowerH;
      const upperFrac = Math.min(0.9, Math.max(0.1, 2 * (cg.cgFactor - 0.25)));
      const mUpper = this.cargoMass * upperFrac;
      const mLower = this.cargoMass - mUpper;
      this.addBox(pw, this.cargoSize.x / 2, lowerH / 2, this.cargoSize.z / 2, 0, deckTop + lowerH / 2, 0, mLower, 0.55);
      this.addBox(pw, this.cargoSize.x / 2, upperH / 2, this.cargoSize.z / 2, 0, deckTop + lowerH + upperH / 2, 0, mUpper, 0.55);
    }
    for (const c of this.colliders) pw.tags.set(c, { kind: 'pallet', id: this.id });
  }

  private addBox(pw: PhysicsWorld, hx: number, hy: number, hz: number, x: number, y: number, z: number, mass: number, friction: number) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setMass(Math.max(mass, 0.1))
      .setFriction(friction)
      .setRestitution(0.02)
      .setCollisionGroups(GROUPS.load)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(2500);
    this.colliders.push(pw.world.createCollider(desc, this.body));
  }

  destroy(pw: PhysicsWorld) {
    for (const c of this.colliders) pw.tags.delete(c);
    pw.world.removeRigidBody(this.body);
  }
}
