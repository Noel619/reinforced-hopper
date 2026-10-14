import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.ts';
import { materials } from '../render/materials.ts';
import type { World } from './World.ts';

let pedId = 1;

/** Operario que camina por una ruta. Se detiene si un autoelevador se le acerca (salvo distraído). */
export class Pedestrian {
  readonly id = pedId++;
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private path: THREE.Vector3[];
  private idx = 1;
  private pos: THREE.Vector3;
  private heading = 0;
  private walkPhase = 0;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  state: 'walk' | 'wait' | 'down' = 'walk';
  private waitTimer = 0;
  speed: number;
  distracted: boolean;
  private downTimer = 0;

  constructor(world: World, path: THREE.Vector3[], opts: { speed?: number; distracted?: boolean; vest?: number } = {}) {
    this.path = path;
    this.pos = path[0].clone();
    this.speed = opts.speed ?? 1.25;
    this.distracted = opts.distracted ?? false;
    const M = materials();
    const vest = new THREE.MeshStandardMaterial({ color: opts.vest ?? 0xd7ff2a, roughness: 0.6, emissive: opts.vest ?? 0xd7ff2a, emissiveIntensity: 0.12 });
    // cuerpo simple: piernas, torso con chaleco, brazos, cabeza con casco
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), vest);
    torso.position.y = 1.22;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.25), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.5 }));
    stripe.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), M.skin);
    head.position.y = 1.66;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.helmet);
    helmet.position.y = 1.69;
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.11, 0.92, 0);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.88, 0.17), M.jeans);
      l.position.y = -0.44;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.26), M.black);
      shoe.position.set(0, -0.86, 0.04);
      leg.add(l, shoe);
      this.legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(sx * 0.27, 1.48, 0);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.12), vest);
      a.position.y = -0.3;
      arm.add(a);
      this.arms.push(arm);
      this.group.add(leg, arm);
    }
    if (this.distracted) {
      // con el celular en la mano
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.015), M.black);
      phone.position.set(0, -0.55, 0.12);
      this.arms[1].add(phone);
      this.arms[1].rotation.x = -1.1;
    }
    this.group.add(torso, stripe, head, helmet);
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    world.dynamicGroup.add(this.group);

    this.body = world.pw.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, 0.9, this.pos.z));
    this.collider = world.pw.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.28).setSensor(true).setCollisionGroups(GROUPS.pedestrian).setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED),
      this.body,
    );
    world.pw.tags.set(this.collider, { kind: 'pedestrian', id: this.id });
    this.sync();
  }

  get position() {
    return this.pos;
  }

  /** Atropellado: cae al piso. */
  knockDown() {
    this.state = 'down';
    this.downTimer = 0;
  }

  update(dt: number, forkliftPos: THREE.Vector3 | null, forkliftVel: THREE.Vector3 | null) {
    if (this.state === 'down') {
      this.downTimer += dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.downTimer * 4);
      this.group.position.y = 0.15 * Math.min(1, this.downTimer * 4);
      // se levanta después de un rato
      if (this.downTimer > 8) {
        this.state = 'wait';
        this.waitTimer = 2;
        this.group.rotation.x = 0;
        this.group.position.y = 0;
      }
      return;
    }
    const target = this.path[this.idx];
    const to = target.clone().sub(this.pos);
    to.y = 0;
    const dist = to.length();
    // ¿hay un autoelevador cerca, adelante?
    let blocked = false;
    if (forkliftPos && !this.distracted) {
      const rel = forkliftPos.clone().sub(this.pos);
      rel.y = 0;
      const d = rel.length();
      const ahead = dist > 0.01 ? rel.dot(to) / (d * dist) : 0;
      const fast = forkliftVel ? forkliftVel.length() > 0.3 : false;
      if (d < 4.2 && (ahead > 0.1 || (fast && d < 3))) blocked = true;
    }
    if (this.state === 'wait') {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0 && !blocked) this.state = 'walk';
    } else if (blocked) {
      this.state = 'wait';
      this.waitTimer = 1.2;
    } else if (dist < 0.1) {
      this.idx = (this.idx + 1) % this.path.length;
      this.state = 'wait';
      this.waitTimer = 1 + Math.random() * 2;
    } else {
      const step = Math.min(dist, this.speed * dt);
      this.pos.addScaledVector(to.normalize(), step);
      this.heading = Math.atan2(to.x, to.z);
      this.walkPhase += dt * this.speed * 5.5;
    }
    const walking = this.state === 'walk';
    const sw = walking ? Math.sin(this.walkPhase) * 0.5 : 0;
    this.legs[0].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.8;
    if (!this.distracted) this.arms[1].rotation.x = sw * 0.8;
    this.sync();
  }

  private sync() {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    let dh = this.heading - this.group.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.group.rotation.y += dh * 0.2;
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: 0.9, z: this.pos.z });
  }
}

/** Gestiona los peatones del mundo: movimiento y detección de atropellos. */
export class PedestrianSystem {
  readonly list: Pedestrian[] = [];
  private world: World;
  onHit: ((p: Pedestrian) => void) | null = null;

  constructor(world: World) {
    this.world = world;
    world.updaters.push((dt) => this.update(dt));
  }

  add(path: THREE.Vector3[], opts: { speed?: number; distracted?: boolean; vest?: number } = {}) {
    const p = new Pedestrian(this.world, path, opts);
    this.list.push(p);
    return p;
  }

  /** Distancia mínima entre el autoelevador y un peatón (m). */
  nearestDistance(): number {
    const fl = this.world.forklift;
    if (!fl) return Infinity;
    const fp = fl.position;
    // centro aproximado del autoelevador (entre ejes)
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.quaternion);
    const c = fp.clone().addScaledVector(fwd, -fl.spec.wheelbase * 0.3);
    let min = Infinity;
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.position.x - c.x, p.position.z - c.z) - 1.2;
      min = Math.min(min, d);
    }
    return min;
  }

  private update(dt: number) {
    const fl = this.world.forklift;
    const pos = fl ? fl.position : null;
    const v = fl ? fl.chassis.linvel() : null;
    const vel = v ? new THREE.Vector3(v.x, v.y, v.z) : null;
    for (const p of this.list) {
      p.update(dt, pos, vel);
      if (p.state === 'down' || !fl) continue;
      // ¿algún colisionador del autoelevador toca al peatón?
      let hit = false;
      this.world.pw.world.intersectionPairsWith(p.collider, (other) => {
        const tag = this.world.pw.tags.get(other.handle);
        if (tag?.kind === 'forklift') hit = true;
      });
      if (hit && vel && vel.length() > 0.25) {
        p.knockDown();
        this.onHit?.(p);
      }
    }
  }
}
