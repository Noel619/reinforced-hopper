import * as THREE from 'three';
import type { Session } from '../../game/Session.ts';
import type { World, PalletEntity, Zone, Slot, TruckInfo } from '../../world/World.ts';
import type { ConeEntity } from '../../world/builders.ts';

export interface LessonRefs {
  pallets: Record<string, PalletEntity>;
  zones: Record<string, Zone>;
  slots: Record<string, Slot>;
  cones: ConeEntity[];
  truck?: TruckInfo;
  /** Puntos de paso (slalom) */
  gates: Zone[];
  data: Record<string, number | boolean | string>;
}

export interface GhostSpec {
  pos: THREE.Vector3;
  yaw: number;
  size: [number, number, number];
}

export interface LessonStep {
  text: string;
  hint?: string;
  /** Posición de la flecha guía (o null). */
  marker?: (ctx: LessonCtx) => THREE.Vector3 | null;
  /** Caja fantasma de destino. */
  ghost?: (ctx: LessonCtx) => GhostSpec | null;
  check: (ctx: LessonCtx) => boolean;
  /** Segundos que la condición debe sostenerse. */
  hold?: number;
  /** Texto de progreso extra (ej. "2/3"). */
  progress?: (ctx: LessonCtx) => string;
}

export interface Lesson {
  id: string;
  num: number;
  title: string;
  summary: string;
  objectives: string[];
  spec: string;
  /** Tiempo de referencia (s) */
  par: number;
  start: { x: number; z: number; yawDeg: number; engineOn: boolean };
  pedestrians: boolean;
  strict?: boolean;
  speedLimit?: number;
  setup(world: World, refs: LessonRefs): void;
  steps: LessonStep[];
  /** Monitor extra por cuadro (ej. bocina al cruzar la senda). */
  monitor?: (ctx: LessonCtx, dt: number) => void;
}

const DEG = Math.PI / 180;

/** Contexto con utilidades para evaluar los pasos de una lección. */
export class LessonCtx {
  readonly s: Session;
  readonly refs: LessonRefs;
  stepTime = 0;
  flags: Record<string, number | boolean> = {};
  /** Penalización manual (lección): puntos y motivo. */
  penalize: (points: number, reason: string) => void = () => {};

  constructor(s: Session, refs: LessonRefs) {
    this.s = s;
    this.refs = refs;
  }

  get world() {
    return this.s.world;
  }
  get fl() {
    return this.s.fl;
  }
  get t() {
    return this.s.fl.telemetry;
  }
  get c() {
    return this.s.fl.controls;
  }

  stopped(tolKmh = 0.3) {
    return Math.abs(this.t.speedKmh) < tolKmh;
  }

  /** Centro del autoelevador (entre ejes) en el piso. */
  center(): THREE.Vector3 {
    const fl = this.fl;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.quaternion);
    return fl.position.addScaledVector(fwd, -fl.spec.wheelbase * 0.5);
  }

  /** Punto en la cara de las horquillas (a nivel del piso). */
  forkFace(): THREE.Vector3 {
    const fl = this.fl;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.quaternion);
    return fl.position.addScaledVector(fwd, fl.spec.forkFaceOffset);
  }

  forward(): THREE.Vector3 {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.fl.quaternion);
    f.y = 0;
    return f.normalize();
  }

  forkliftIn(z: Zone): boolean {
    return this.world.pointInZone(this.center(), z);
  }

  /** Todo el contorno del autoelevador dentro de la zona. */
  forkliftFullyIn(z: Zone, withForks = false): boolean {
    const fl = this.fl;
    const s = fl.spec;
    const q = fl.quaternion;
    const p = fl.position;
    const zf = withForks ? s.forkFaceOffset + s.forkLength : s.forkFaceOffset;
    const zr = -s.wheelbase - s.rearOverhang;
    const hw = s.bodyWidth / 2;
    for (const [x, zz] of [[hw, zf], [-hw, zf], [hw, zr], [-hw, zr]]) {
      const c = new THREE.Vector3(x, 0, zz).applyQuaternion(q).add(p);
      if (!this.world.pointInZone(c, z)) return false;
    }
    return true;
  }

  carried(p: PalletEntity) {
    return this.fl.carried.has(p.phys.body.handle);
  }

  touching(p: PalletEntity) {
    return this.fl.touchingForks.has(p.phys.body.handle);
  }

  /** Posición del pallet en el marco de las horquillas. */
  palletInForkFrame(p: PalletEntity): THREE.Vector3 {
    const fl = this.fl;
    const pf = fl.pos(fl.forks, new THREE.Vector3());
    const qf = fl.rot(fl.forks, new THREE.Quaternion()).invert();
    return p.curPos.clone().sub(pf).applyQuaternion(qf);
  }

  /** Distancia (m) entre la cara de las horquillas y el borde cercano del pallet (≈0 = metido hasta el fondo). */
  insertionGap(p: PalletEntity): number {
    const local = this.palletInForkFrame(p);
    // largo del pallet a lo largo de las horquillas
    const q = new THREE.Quaternion().copy(p.curQuat);
    const pz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const f = this.forward();
    const along = Math.abs(pz.dot(f)) > 0.7 ? p.phys.type.length : p.phys.type.width;
    return local.z - along / 2;
  }

  /** ¿El autoelevador apunta a una de las caras del pallet (±tol grados)? */
  aligned(p: PalletEntity, tolDeg = 8): boolean {
    const f = this.forward();
    const q = new THREE.Quaternion().copy(p.curQuat);
    const pz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    pz.y = 0;
    pz.normalize();
    const px = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    px.y = 0;
    px.normalize();
    const c = Math.cos(tolDeg * DEG);
    return Math.abs(f.dot(pz)) > c || Math.abs(f.dot(px)) > c;
  }

  /** Desalineación lateral del centro del pallet respecto del eje de las horquillas (m). */
  lateralOffset(p: PalletEntity): number {
    return this.palletInForkFrame(p).x;
  }

  dist2D(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  palletIn(p: PalletEntity, z: Zone) {
    return this.world.palletInZone(p, z) && this.world.palletUpright(p);
  }

  palletInSlot(p: PalletEntity, s: Slot) {
    return this.world.palletInSlot(p, s, 0.3, 0.1) && this.world.palletUpright(p);
  }

  /** Pallet sobre el hueco (en planta), sin importar la altura. */
  palletOverSlot(p: PalletEntity, s: Slot, tolX = 0.22, tolZ = 0.3): boolean {
    const dx = p.curPos.x - s.center.x;
    const dz = p.curPos.z - s.center.z;
    const c = Math.cos(-s.yaw);
    const sn = Math.sin(-s.yaw);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    return Math.abs(lx) < tolX && Math.abs(lz) < tolZ;
  }

  yawDiffDeg(targetYaw: number): number {
    const f = this.forward();
    const yaw = Math.atan2(f.x, f.z);
    const d = Math.atan2(Math.sin(yaw - targetYaw), Math.cos(yaw - targetYaw));
    return Math.abs(d) / DEG;
  }
}

/** Marcador sobre un pallet. */
export const above = (p: PalletEntity, h = 0.8) => p.curPos.clone().add(new THREE.Vector3(0, p.phys.height + h, 0));
export const zoneMarker = (z: Zone, h = 1.6) => z.center.clone().add(new THREE.Vector3(0, h, 0));
export const slotGhost = (s: Slot, p: PalletEntity): GhostSpec => ({
  pos: s.center.clone(),
  yaw: s.yaw,
  size: [p.phys.type.width + 0.04, p.phys.height + 0.02, p.phys.type.length + 0.04],
});
