import * as THREE from 'three';
import { RAPIER, createPhysicsWorld, type PhysicsWorld } from '../sim/physics.ts';
import { PalletBody, type PalletType } from '../sim/pallet.ts';
import { ForkliftPhysics } from '../sim/forklift.ts';
import type { ForkliftSpec } from '../sim/specs.ts';
import { ForkliftModel } from '../render/ForkliftModel.ts';
import { buildPalletMesh } from './palletView.ts';
import type { PedestrianSystem } from './pedestrians.ts';

export interface PalletMeta {
  /** Código de producto / cliente (modo gestión). */
  sku?: string;
  client?: string;
  clientColor?: string;
  orderId?: string;
  /** Valor monetario de la mercadería. */
  value: number;
  /** Daño acumulado 0..1 */
  damage: number;
  /** Marcado como "caído" (volcado). */
  dropped: boolean;
}

export interface PalletEntity {
  id: number;
  phys: PalletBody;
  mesh: THREE.Group;
  meta: PalletMeta;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  curPos: THREE.Vector3;
  curQuat: THREE.Quaternion;
  prevVel: THREE.Vector3;
  awake: boolean;
}

export interface Slot {
  id: string;
  label: string;
  /** Centro del pallet apoyado (base inferior) */
  center: THREE.Vector3;
  yaw: number;
  level: number;
  rackId: number;
  /** Medio ancho disponible (m) */
  halfWidth: number;
  /** Altura máxima de carga (pallet incluido) que entra en el hueco (m). */
  clearance: number;
}

export interface Zone {
  id: string;
  label: string;
  center: THREE.Vector3;
  width: number;
  depth: number;
  yaw: number;
  color: number;
  kind: 'recepcion' | 'despacho' | 'estacion' | 'meta' | 'estacionamiento' | 'piso' | 'carga';
  mesh?: THREE.Object3D;
}

export interface TruckInfo {
  id: number;
  label: string;
  group: THREE.Group;
  slots: Slot[];
  bedHeight: number;
  colliders: RAPIER.Collider[];
  center: THREE.Vector3;
  yaw: number;
}

interface BodySync {
  body: RAPIER.RigidBody;
  obj: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  curPos: THREE.Vector3;
  curQuat: THREE.Quaternion;
}

/** Contiene la escena 3D y la física, y mantiene sincronizadas las entidades. */
export class World {
  readonly scene: THREE.Scene;
  readonly pw: PhysicsWorld;
  readonly staticGroup = new THREE.Group();
  readonly dynamicGroup = new THREE.Group();
  readonly pallets = new Map<number, PalletEntity>();
  /** Pallet por handle de cuerpo rígido. */
  readonly palletByBody = new Map<number, PalletEntity>();
  readonly slots: Slot[] = [];
  readonly zones: Zone[] = [];
  readonly trucks: TruckInfo[] = [];
  /** Meshes que bloquean la cámara orbital. */
  readonly occluders: THREE.Object3D[] = [];
  /** Animaciones/actualizaciones de objetos del mundo (peatones, puertas, etc.). */
  readonly updaters: ((dt: number, time: number) => void)[] = [];
  forklift!: ForkliftPhysics;
  model!: ForkliftModel;
  /** Peatones (si el escenario los tiene). */
  peds: PedestrianSystem | null = null;
  private forkliftSync: BodySync[] = [];
  private nextPalletId = 1;
  time = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.pw = createPhysicsWorld(1 / 120);
    this.scene.add(this.staticGroup, this.dynamicGroup);
  }

  // ----------------------------------------------------------- autoelevador
  spawnForklift(spec: ForkliftSpec, position: THREE.Vector3, yaw: number): ForkliftPhysics {
    if (this.forklift) this.removeForklift();
    this.forklift = new ForkliftPhysics(this.pw, spec, position, yaw);
    this.model = new ForkliftModel(spec);
    this.dynamicGroup.add(this.model.root);
    const fl = this.forklift;
    const m = this.model;
    this.forkliftSync = [
      this.makeSync(fl.chassis, m.chassis),
      this.makeSync(fl.mast, m.mast),
      this.makeSync(fl.carriage, m.carriage),
      this.makeSync(fl.forks, m.forks),
    ];
    return fl;
  }

  removeForklift() {
    if (!this.forklift) return;
    this.forklift.destroy();
    this.dynamicGroup.remove(this.model.root);
    this.model.dispose();
  }

  private makeSync(body: RAPIER.RigidBody, obj: THREE.Object3D): BodySync {
    const t = body.translation();
    const r = body.rotation();
    const p = new THREE.Vector3(t.x, t.y, t.z);
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    obj.position.copy(p);
    obj.quaternion.copy(q);
    return { body, obj, prevPos: p.clone(), prevQuat: q.clone(), curPos: p.clone(), curQuat: q.clone() };
  }

  // ----------------------------------------------------------- pallets
  addPallet(opts: {
    type?: PalletType['id'];
    cargo: string;
    mass?: number;
    position: THREE.Vector3;
    yaw: number;
    meta?: Partial<PalletMeta>;
    sleeping?: boolean;
    label?: { text: string; color: string };
  }): PalletEntity {
    const id = this.nextPalletId++;
    const phys = new PalletBody(this.pw, { id, type: opts.type ?? 'eur', cargo: opts.cargo, cargoMass: opts.mass, position: opts.position, yaw: opts.yaw });
    if (opts.sleeping) phys.body.sleep();
    const mesh = buildPalletMesh(phys.type.id, phys.cargo, phys.cargoSize, opts.label);
    mesh.position.copy(opts.position);
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw);
    this.dynamicGroup.add(mesh);
    const meta: PalletMeta = {
      value: phys.cargoMass * phys.cargo.valuePerKg,
      damage: 0,
      dropped: false,
      ...opts.meta,
    };
    const e: PalletEntity = {
      id,
      phys,
      mesh,
      meta,
      prevPos: opts.position.clone(),
      prevQuat: mesh.quaternion.clone(),
      curPos: opts.position.clone(),
      curQuat: mesh.quaternion.clone(),
      prevVel: new THREE.Vector3(),
      awake: !opts.sleeping,
    };
    this.pallets.set(id, e);
    this.palletByBody.set(phys.body.handle, e);
    return e;
  }

  removePallet(id: number) {
    const e = this.pallets.get(id);
    if (!e) return;
    this.palletByBody.delete(e.phys.body.handle);
    e.phys.destroy(this.pw);
    this.dynamicGroup.remove(e.mesh);
    this.pallets.delete(id);
  }

  /** Pallet que contiene el colisionador (por handle). */
  palletFromCollider(handle: number): PalletEntity | undefined {
    const tag = this.pw.tags.get(handle);
    if (tag?.kind === 'pallet') return this.pallets.get(tag.id);
    return undefined;
  }

  // ----------------------------------------------------------- simulación
  /** Guarda poses previas para interpolar (llamar antes de cada paso). */
  beforeStep() {
    for (const s of this.forkliftSync) {
      s.prevPos.copy(s.curPos);
      s.prevQuat.copy(s.curQuat);
    }
    for (const e of this.pallets.values()) {
      if (!e.awake) continue;
      e.prevPos.copy(e.curPos);
      e.prevQuat.copy(e.curQuat);
    }
  }

  step() {
    const fl = this.forklift;
    const dt = this.pw.dt;
    fl.preStep(dt);
    this.pw.world.step(this.pw.events);
    fl.postStep(dt);
    this.time += dt;
  }

  /** Lee las poses nuevas después del paso. */
  afterStep() {
    for (const s of this.forkliftSync) {
      const t = s.body.translation();
      const r = s.body.rotation();
      s.curPos.set(t.x, t.y, t.z);
      s.curQuat.set(r.x, r.y, r.z, r.w);
    }
    for (const e of this.pallets.values()) {
      const b = e.phys.body;
      const sleeping = b.isSleeping();
      if (sleeping && !e.awake) continue;
      if (!e.awake) {
        // se acaba de despertar: arrancar la interpolación desde la pose actual
        e.prevPos.copy(e.curPos);
        e.prevQuat.copy(e.curQuat);
      }
      e.awake = !sleeping;
      const t = b.translation();
      const r = b.rotation();
      e.curPos.set(t.x, t.y, t.z);
      e.curQuat.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Aplica las poses interpoladas a los objetos 3D. */
  syncVisuals(alpha: number) {
    for (const s of this.forkliftSync) {
      s.obj.position.lerpVectors(s.prevPos, s.curPos, alpha);
      s.obj.quaternion.slerpQuaternions(s.prevQuat, s.curQuat, alpha);
    }
    for (const e of this.pallets.values()) {
      if (!e.awake && e.mesh.position.equals(e.curPos)) continue;
      e.mesh.position.lerpVectors(e.prevPos, e.curPos, e.awake ? alpha : 1);
      e.mesh.quaternion.slerpQuaternions(e.prevQuat, e.curQuat, e.awake ? alpha : 1);
    }
  }

  // ----------------------------------------------------------- consultas
  /** ¿El pallet está apoyado en el hueco del rack? */
  palletInSlot(e: PalletEntity, s: Slot, tolXZ = 0.35, tolY = 0.12): boolean {
    const p = e.curPos;
    if (Math.abs(p.y - s.center.y) > tolY) return false;
    const dx = p.x - s.center.x;
    const dz = p.z - s.center.z;
    const c = Math.cos(-s.yaw);
    const sn = Math.sin(-s.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    return Math.abs(lx) < Math.min(tolXZ, s.halfWidth) && Math.abs(lz) < tolXZ;
  }

  palletInZone(e: PalletEntity, z: Zone, maxHeightAbove = 0.25): boolean {
    const p = e.curPos;
    if (p.y - z.center.y > maxHeightAbove || p.y < z.center.y - 0.3) return false;
    const dx = p.x - z.center.x;
    const dz = p.z - z.center.z;
    const c = Math.cos(-z.yaw);
    const sn = Math.sin(-z.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    return Math.abs(lx) <= z.width / 2 && Math.abs(lz) <= z.depth / 2;
  }

  pointInZone(p: THREE.Vector3, z: Zone): boolean {
    const dx = p.x - z.center.x;
    const dz = p.z - z.center.z;
    const c = Math.cos(-z.yaw);
    const sn = Math.sin(-z.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    return Math.abs(lx) <= z.width / 2 && Math.abs(lz) <= z.depth / 2;
  }

  /** Pallet "derecho" (no volcado). */
  palletUpright(e: PalletEntity): boolean {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.curQuat);
    return up.y > 0.94;
  }

  slotOccupant(s: Slot): PalletEntity | undefined {
    for (const e of this.pallets.values()) if (this.palletInSlot(e, s)) return e;
    return undefined;
  }

  update(dt: number) {
    for (const u of this.updaters) u(dt, this.time);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.pw.world.free();
    this.pw.events.free();
  }
}
