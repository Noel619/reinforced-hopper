import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

let initPromise: Promise<void> | null = null;

/** Inicializa el módulo WASM de Rapier una sola vez. */
export function initPhysics(): Promise<void> {
  if (!initPromise) initPromise = RAPIER.init();
  return initPromise;
}

/** Grupos de colisión (bits). */
export const G = {
  STATIC: 1 << 0,
  FORKLIFT: 1 << 1,
  LOAD: 1 << 2,
  PEDESTRIAN: 1 << 3,
  PROP: 1 << 4,
  SENSOR: 1 << 5,
} as const;

export const ALL = 0xffff;

/** Construye un valor de InteractionGroups: pertenencia en los 16 bits altos, filtro en los bajos. */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const GROUPS = {
  static: groups(G.STATIC, ALL),
  forklift: groups(G.FORKLIFT, G.STATIC | G.LOAD | G.PEDESTRIAN | G.PROP),
  load: groups(G.LOAD, ALL),
  prop: groups(G.PROP, ALL),
  pedestrian: groups(G.PEDESTRIAN, G.FORKLIFT | G.LOAD | G.PROP),
  sensor: groups(G.SENSOR, G.FORKLIFT | G.LOAD),
  /** Filtro usado por los rayos de las ruedas. */
  wheelRay: groups(ALL, G.STATIC | G.LOAD | G.PROP),
};

/** Tipos de etiqueta que guardamos en userData de los cuerpos para identificar objetos del juego. */
export type BodyTag =
  | { kind: 'forklift'; part: 'chassis' | 'mast' | 'carriage' | 'forks' }
  | { kind: 'pallet'; id: number }
  | { kind: 'static'; what: 'floor' | 'wall' | 'rack' | 'truck' | 'ramp' | 'dock' | 'other'; id?: number }
  | { kind: 'prop'; what: string; id: number }
  | { kind: 'pedestrian'; id: number };

/** Etiquetas por handle de colisionador (más simple que userData en wasm). */
export class TagRegistry {
  private byCollider = new Map<number, BodyTag>();
  set(collider: RAPIER.Collider, tag: BodyTag) {
    this.byCollider.set(collider.handle, tag);
  }
  get(handle: number): BodyTag | undefined {
    return this.byCollider.get(handle);
  }
  delete(collider: RAPIER.Collider) {
    this.byCollider.delete(collider.handle);
  }
}

export interface PhysicsWorld {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  tags: TagRegistry;
  dt: number;
}

export function createPhysicsWorld(dt = 1 / 120): PhysicsWorld {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = dt;
  world.integrationParameters.numSolverIterations = 6;
  return { world, events: new RAPIER.EventQueue(true), tags: new TagRegistry(), dt };
}

/** Crea un colisionador estático en forma de caja. */
export function addStaticBox(
  pw: PhysicsWorld,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  opts: { rotY?: number; friction?: number; tag?: BodyTag; rot?: { x: number; y: number; z: number; w: number } } = {},
): RAPIER.Collider {
  const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setTranslation(cx, cy, cz)
    .setFriction(opts.friction ?? 0.8)
    .setCollisionGroups(GROUPS.static);
  if (opts.rot) desc.setRotation(opts.rot);
  else if (opts.rotY) {
    const h = opts.rotY / 2;
    desc.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
  }
  const c = pw.world.createCollider(desc);
  pw.tags.set(c, opts.tag ?? { kind: 'static', what: 'other' });
  return c;
}
