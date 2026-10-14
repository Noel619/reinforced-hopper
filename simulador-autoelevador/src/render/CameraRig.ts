import * as THREE from 'three';
import type { ForkliftModel } from './ForkliftModel.ts';

export type CameraMode = 'cabina' | 'tercera' | 'horquillas' | 'aerea';
export const CAMERA_LABELS: Record<CameraMode, string> = {
  cabina: 'Cabina (1ª persona)',
  tercera: 'Tercera persona',
  horquillas: 'Cámara de horquillas',
  aerea: 'Vista aérea',
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

/** Cámaras: cabina con mirada libre, tercera persona orbital, cámara de horquillas y aérea. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'cabina';
  modes: CameraMode[] = ['cabina', 'tercera', 'horquillas', 'aerea'];
  // cabina
  headYaw = 0;
  headPitch = -0.26;
  private lookBack = 0;
  cabFov = 72;
  // tercera persona
  orbitYaw = 0;
  orbitPitch = 0.38;
  orbitDist = 7;
  private heading = 0;
  private idleTime = 0;
  autoRecenter = true;
  private smoothTarget = new THREE.Vector3();
  private initialized = false;
  /** Vibración de cabina (0..1), la fija el motor. */
  shake = 0;
  private time = 0;
  /** Obstáculos para que la cámara orbital no atraviese paredes. */
  occluders: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(72, aspect, 0.05, 600);
  }

  next() {
    const i = this.modes.indexOf(this.mode);
    this.setMode(this.modes[(i + 1) % this.modes.length]);
  }

  setMode(m: CameraMode) {
    this.mode = m;
    if (m === 'tercera') {
      this.orbitYaw = 0;
      this.initialized = false;
    }
    if (m === 'cabina') {
      this.headYaw = 0;
      this.headPitch = -0.26;
    }
  }

  /** Arrastre del ratón (píxeles). */
  look(dx: number, dy: number) {
    const k = 0.0045;
    if (this.mode === 'cabina') {
      this.headYaw = THREE.MathUtils.clamp(this.headYaw - dx * k, -2.6, 2.6);
      this.headPitch = THREE.MathUtils.clamp(this.headPitch - dy * k, -1.35, 0.9);
    } else if (this.mode === 'tercera' || this.mode === 'aerea') {
      this.orbitYaw -= dx * k;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * k, 0.05, 1.45);
      this.idleTime = 0;
    }
  }

  /** Mirada con el gamepad (radianes/seg). */
  lookRate(yawRate: number, pitchRate: number, dt: number) {
    if (this.mode === 'cabina') {
      this.headYaw = THREE.MathUtils.clamp(this.headYaw + yawRate * dt, -2.6, 2.6);
      this.headPitch = THREE.MathUtils.clamp(this.headPitch + pitchRate * dt, -1.35, 0.9);
    } else {
      this.orbitYaw += yawRate * dt;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - pitchRate * dt, 0.05, 1.45);
      if (yawRate || pitchRate) this.idleTime = 0;
    }
  }

  zoom(steps: number) {
    if (this.mode === 'cabina') this.cabFov = THREE.MathUtils.clamp(this.cabFov + steps * 4, 35, 95);
    else this.orbitDist = THREE.MathUtils.clamp(this.orbitDist * (1 + steps * 0.1), 2.5, 40);
  }

  resetView() {
    this.headYaw = 0;
    this.headPitch = -0.26;
    this.orbitYaw = 0;
    this.orbitPitch = 0.38;
  }

  update(dt: number, model: ForkliftModel, lookBack: boolean, speed: number) {
    this.time += dt;
    const cam = this.camera;
    // el techo del galpón (capa 1) sólo se ve desde la cabina y la cámara de horquillas
    if (this.mode === 'cabina' || this.mode === 'horquillas') cam.layers.enable(1);
    else cam.layers.disable(1);
    model.chassis.updateMatrixWorld();
    const chassisQ = model.chassis.getWorldQuaternion(_q);
    const chassisP = model.chassis.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(chassisQ);
    const yawNow = Math.atan2(fwd.x, fwd.z);

    if (this.mode === 'cabina') {
      this.lookBack += ((lookBack ? 1 : 0) - this.lookBack) * Math.min(1, dt * 7);
      const yawEff = THREE.MathUtils.lerp(this.headYaw, this.headYaw >= -0.3 ? Math.PI * 0.86 : -Math.PI * 0.86, this.lookBack);
      // inclinación del cuerpo al mirar a los costados / atrás
      const lean = Math.sin(yawEff) * 0.13;
      const back = (1 - Math.cos(yawEff)) * 0.06;
      const eye = _v.copy(model.eye).add(new THREE.Vector3(lean, -back * 0.3, -back));
      // vibración del motor
      const sh = this.shake * 0.0035;
      eye.x += Math.sin(this.time * 61) * sh;
      eye.y += Math.sin(this.time * 47 + 1) * sh;
      eye.applyMatrix4(model.chassis.matrixWorld);
      cam.position.copy(eye);
      _e.set(this.headPitch * (1 - this.lookBack * 0.6), yawEff + Math.PI, 0, 'YXZ');
      _q2.setFromEuler(_e);
      cam.quaternion.copy(chassisQ).multiply(_q2);
      cam.fov = this.cabFov;
      cam.near = 0.05;
    } else if (this.mode === 'tercera') {
      if (!this.initialized) {
        this.heading = yawNow;
        this.smoothTarget.copy(chassisP);
        this.initialized = true;
      }
      // seguir el rumbo suavemente (atrás del contrapeso)
      let dYaw = yawNow - this.heading;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this.heading += dYaw * Math.min(1, dt * 2.2);
      this.idleTime += dt;
      if (this.autoRecenter && this.idleTime > 3 && Math.abs(speed) > 0.5) {
        this.orbitYaw *= 1 - Math.min(1, dt * 1.2);
      }
      this.smoothTarget.lerp(chassisP, Math.min(1, dt * 10));
      const target = this.smoothTarget.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(fwd, -0.3);
      const yaw = this.heading + Math.PI + this.orbitYaw;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), Math.cos(yaw) * Math.cos(this.orbitPitch));
      let dist = this.orbitDist;
      if (this.occluders.length) {
        this.ray.set(target, dir);
        this.ray.far = dist;
        const hits = this.ray.intersectObjects(this.occluders, false);
        if (hits.length) dist = Math.max(1.5, hits[0].distance - 0.3);
      }
      cam.position.copy(target).addScaledVector(dir, dist);
      if (cam.position.y < 0.3) cam.position.y = 0.3;
      cam.lookAt(target);
      cam.fov = 60;
      cam.near = 0.1;
    } else if (this.mode === 'horquillas') {
      model.carriage.updateMatrixWorld();
      const p = new THREE.Vector3(0, 0.06, -0.02).applyMatrix4(model.forks.matrixWorld);
      model.forks.getWorldQuaternion(_q2);
      cam.position.copy(p);
      _e.set(-0.08, Math.PI, 0, 'YXZ');
      cam.quaternion.copy(_q2).multiply(new THREE.Quaternion().setFromEuler(_e));
      cam.fov = 78;
      cam.near = 0.03;
    } else {
      // aérea
      const yaw = this.orbitYaw;
      const h = 9 + this.orbitDist * 1.2;
      cam.position.set(chassisP.x + Math.sin(yaw) * h * 0.25, h, chassisP.z + Math.cos(yaw) * h * 0.25);
      cam.lookAt(chassisP.x, 0, chassisP.z);
      cam.fov = 55;
      cam.near = 0.5;
    }
    cam.updateProjectionMatrix();
  }

  /** ¿El operador mira hacia atrás? (para la regla de seguridad en reversa) */
  lookingBackward(): boolean {
    if (this.mode !== 'cabina') return true;
    const yaw = THREE.MathUtils.lerp(this.headYaw, Math.PI * 0.86, this.lookBack);
    return Math.abs(yaw) > 1.2;
  }
}
