import * as THREE from 'three';
import { RAPIER, GROUPS, type PhysicsWorld } from './physics.ts';
import type { ForkliftSpec } from './specs.ts';

const DEG = Math.PI / 180;
// Servos hidráulicos (modelo por fuerza: rigidez en N/m o N·m/rad, amortiguamiento en N·s/m)
const LIFT_K = 1.2e7;
const LIFT_C = 4.0e5;
const TILT_K = 2.5e7;
const TILT_C = 1.2e6;
const SHIFT_K = 2.0e6;
const SHIFT_C = 1.5e5;
const GRAV = 9.81;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const deadzone = (v: number, d: number) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

/** Estado de los mandos del operador. Lo escriben el teclado, el gamepad y la cabina interactiva. */
export class ForkliftControls {
  /** Pedal del acelerador 0..1 */
  throttle = 0;
  /** Pedal de freno 0..1 */
  brake = 0;
  /** Pedal de avance lento (inching) 0..1 — sólo motores a combustión */
  inching = 0;
  /** Posición del volante normalizada: −1 (tope derecha) .. +1 (tope izquierda) */
  handwheel = 0;
  /** Palanca de marcha: 1 adelante, 0 neutral, −1 atrás */
  direction: -1 | 0 | 1 = 0;
  /** Palanca de elevación −1 (bajar) .. +1 (subir) */
  lift = 0;
  /** Palanca de inclinación −1 (adelante) .. +1 (atrás) */
  tilt = 0;
  /** Palanca del desplazador lateral −1 (derecha) .. +1 (izquierda) */
  sideShift = 0;
  /** Posicionador de horquillas −1 (cerrar) .. +1 (abrir) */
  spread = 0;
  parkingBrake = true;
  /** Llave de contacto */
  ignition = false;
  horn = false;
  lights = false;
  beacon = true;
  seatbelt = false;
}

export type ForkliftEvent =
  | 'engineStart'
  | 'engineStop'
  | 'needNeutral'
  | 'noFuel'
  | 'directionChangeMoving'
  | 'relief';

interface WheelDef {
  name: 'FL' | 'FR' | 'RL' | 'RR';
  local: THREE.Vector3;
  radius: number;
  width: number;
  front: boolean;
  left: boolean;
  k: number;
  c: number;
}

export interface WheelState {
  def: WheelDef;
  contact: boolean;
  compression: number;
  rawCompression: number;
  normalForce: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  fwd: THREE.Vector3;
  lat: THREE.Vector3;
  steer: number;
  spin: number;
  slipping: boolean;
  groundBody: RAPIER.RigidBody | null;
  groundCollider: number;
  // impulsos acumulados del paso
  accLat: number;
  accBrake: number;
  accDrive: number;
  appliedLong: number;
  appliedLat: number;
  brakeCap: number;
  hubWorld: THREE.Vector3;
  anchor: THREE.Vector3;
  anchorSet: boolean;
  targetLong: number;
  targetLat: number;
}

export interface ForkliftTelemetry {
  speed: number;
  speedKmh: number;
  rpm: number;
  engineLoad: number;
  engineRunning: boolean;
  cranking: boolean;
  energy: number;
  energyFrac: number;
  hourMeter: number;
  forkHeight: number;
  liftPos: number;
  liftCmd: number;
  tiltDeg: number;
  sideShift: number;
  spread: number;
  forkLoadKg: number;
  /** Centro de carga medido desde la cara de las horquillas (m) */
  loadCenter: number;
  innerMastRise: number;
  intermediateRise: number;
  steerDeg: number;
  rearAxleDeg: number;
  wheelLoads: number[];
  /** Fracción de carga sobre el eje trasero (0 = vuelco hacia adelante) */
  rearLoadFrac: number;
  /** Desbalance lateral de ruedas delanteras −1..1 (±1 = vuelco lateral) */
  lateralBalance: number;
  /** Centro de presión en coordenadas del chasis (x, z) */
  copX: number;
  copZ: number;
  reliefActive: boolean;
  liftActive: number;
  tiltActive: number;
  shiftActive: number;
  /** Aceleración longitudinal (m/s²) */
  accelLong: number;
  accelLat: number;
  /** Ángulo de vuelco del chasis respecto a la vertical (grados) */
  rollDeg: number;
  pitchDeg: number;
  tippedOver: boolean;
  wheelsSlipping: boolean;
  /** Fuerza de contacto máxima del último paso sobre el chasis/mástil (N) */
  driveForce: number;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _vc = new THREE.Vector3();
const _qc = new THREE.Quaternion();

/** Geometría derivada de la ficha técnica, en el marco del chasis. */
export interface ForkliftGeometry {
  pivot: THREE.Vector3;
  forkTop0: number;
  forkFace: number;
  liftMax: number;
  mastZ: number;
  mastDepth: number;
  outerMastHeight: number;
  outerChannelX: number;
  innerChannelX: number;
  bodyFrontZ: number;
  bodyRearZ: number;
  counterweightZ: number;
  carriageWidth: number;
  carriageHeight: number;
}

export function computeGeometry(spec: ForkliftSpec): ForkliftGeometry {
  const forkFace = spec.forkFaceOffset;
  const forkTop0 = spec.forkThickness + 0.012;
  return {
    pivot: new THREE.Vector3(0, spec.frontWheelRadius * 0.95, 0.1),
    forkTop0,
    forkFace,
    liftMax: spec.maxForkHeight - forkTop0,
    mastZ: forkFace - 0.17,
    mastDepth: 0.13,
    outerMastHeight: spec.loweredMastHeight - 0.08,
    outerChannelX: Math.min(0.42, spec.bodyWidth * 0.33),
    innerChannelX: Math.min(0.42, spec.bodyWidth * 0.33) - 0.075,
    bodyFrontZ: 0.05,
    bodyRearZ: -spec.wheelbase - spec.rearOverhang,
    counterweightZ: -spec.wheelbase + 0.05,
    carriageWidth: Math.min(1.05, spec.bodyWidth * 0.86),
    carriageHeight: 0.42,
  };
}

/** Desplazamiento de las etapas del mástil para una posición del carro. */
export function mastStages(spec: ForkliftSpec, lift: number): { inner: number; intermediate: number } {
  if (spec.mastType === 'triplex') {
    const over = Math.max(0, lift - spec.freeLift);
    return { inner: over, intermediate: over / 2 };
  }
  // Dúplex estándar: el mástil interior sube a la mitad de velocidad que el carro
  return { inner: lift / 2, intermediate: 0 };
}

export class ForkliftPhysics {
  readonly spec: ForkliftSpec;
  readonly geo: ForkliftGeometry;
  readonly pw: PhysicsWorld;
  readonly controls = new ForkliftControls();
  chassis!: RAPIER.RigidBody;
  mast!: RAPIER.RigidBody;
  carriage!: RAPIER.RigidBody;
  forks!: RAPIER.RigidBody;
  tiltJoint!: RAPIER.RevoluteImpulseJoint;
  liftJoint!: RAPIER.PrismaticImpulseJoint;
  shiftJoint!: RAPIER.PrismaticImpulseJoint;
  readonly wheels: WheelState[] = [];
  /** Colisionadores que pueden sostener carga (para la báscula). */
  private loadSensingColliders: RAPIER.Collider[] = [];
  private forkBlades: RAPIER.Collider[] = [];
  private forkShanks: RAPIER.Collider[] = [];
  private innerMastColliders: { c: RAPIER.Collider; base: THREE.Vector3; stage: 'inner' | 'intermediate' }[] = [];
  readonly allColliders: RAPIER.Collider[] = [];
  readonly bodies: RAPIER.RigidBody[] = [];
  private listeners: ((e: ForkliftEvent) => void)[] = [];

  // --- Estado hidráulico ---
  liftCmd = 0;
  tiltCmd = 0; // grados, + = atrás
  shiftCmd = 0;
  spread: number;
  liftActual = 0;
  tiltActual = 0;
  shiftActual = 0;

  // --- Motor / tren de potencia ---
  engineOmega = 0;
  running = false;
  private crankTimer = 0;
  private ignitionPrev = false;
  energy: number;
  hourMeter = 0;
  private steerAngle = 0; // ángulo equivalente de bicicleta (rad), + = giro a la izquierda
  private rearAxleAngle = 0;
  private gearRatio: number;
  private kc: number;
  private engineTmax: number;
  private omegaMax: number;
  private omegaIdle: number;
  private driveForce = 0;
  private hydPower = 0;
  private enginePower = 0;
  private reliefActive = false;
  slackChain = false;
  private dirPrev: -1 | 0 | 1 = 0;
  private prevVel = new THREE.Vector3();
  private accelSmoothed = new THREE.Vector3();
  private forkLoadKg = 0;
  private forkLoadSmoothed = 0;
  private loadCentroidLocal = new THREE.Vector3();
  private copSmoothed = new THREE.Vector2();
  readonly telemetry: ForkliftTelemetry;

  constructor(pw: PhysicsWorld, spec: ForkliftSpec, position: THREE.Vector3, yaw: number) {
    this.pw = pw;
    this.spec = spec;
    this.geo = computeGeometry(spec);
    this.spread = spec.forkSpreadDefault;
    this.energy = spec.energyCapacity;
    this.omegaMax = (spec.maxRpm * 2 * Math.PI) / 60;
    this.omegaIdle = (spec.idleRpm * 2 * Math.PI) / 60;
    const vmax = spec.maxSpeedKmh / 3.6;
    const R = spec.frontWheelRadius;
    this.gearRatio = (0.93 * this.omegaMax * R) / vmax;
    const tOutStall = (spec.maxDriveForce * R) / (this.gearRatio * 0.85);
    const tImpStall = tOutStall / 2.3;
    const omegaStall = 0.72 * this.omegaMax;
    this.kc = tImpStall / (omegaStall * omegaStall);
    this.engineTmax = tImpStall * 1.08;
    this.telemetry = this.emptyTelemetry();
    this.build(position, yaw);
  }

  on(fn: (e: ForkliftEvent) => void) {
    this.listeners.push(fn);
  }
  private emit(e: ForkliftEvent) {
    for (const fn of this.listeners) fn(e);
  }

  get isElectric() {
    return this.spec.power === 'electrico';
  }

  // ------------------------------------------------------------------
  // Construcción de cuerpos, colisionadores y articulaciones
  // ------------------------------------------------------------------
  private build(position: THREE.Vector3, yaw: number) {
    const { world } = this.pw;
    const spec = this.spec;
    const geo = this.geo;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const rot = { x: qYaw.x, y: qYaw.y, z: qYaw.z, w: qYaw.w };
    const toWorld = (local: THREE.Vector3) => local.clone().applyQuaternion(qYaw).add(position);

    // Masas de las partes del mástil y CDG del chasis para que el conjunto respete la ficha
    const mMast = spec.mastMass;
    const mCar = spec.carriageMass;
    const mFork = spec.forkFrameMass;
    const mChassis = spec.serviceWeight - mMast - mCar - mFork;
    const mastCom = new THREE.Vector3(0, spec.loweredMastHeight * 0.48, geo.mastZ);
    const carCom = new THREE.Vector3(0, geo.forkTop0 + 0.3, geo.forkFace - 0.08);
    const forkCom = new THREE.Vector3(0, geo.forkTop0 + 0.02, geo.forkFace + spec.forkLength * 0.3);
    const totalZ = -spec.cgFromFrontAxle * spec.serviceWeight;
    const chassisZ = (totalZ - mMast * mastCom.z - mCar * carCom.z - mFork * forkCom.z) / mChassis;
    const totalY = spec.cgHeight * spec.serviceWeight;
    const chassisY = Math.max(0.35, (totalY - mMast * mastCom.y - mCar * carCom.y - mFork * forkCom.y) / mChassis);

    // ---- Chasis ----
    const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rot)
      .setCanSleep(false)
      .setAdditionalSolverIterations(4)
      .setLinearDamping(0.02)
      .setAngularDamping(0.05);
    this.chassis = world.createRigidBody(chassisDesc);
    const L = spec.wheelbase + spec.rearOverhang + 0.05;
    const W = spec.bodyWidth;
    const Hb = 1.15;
    this.chassis.setAdditionalMassProperties(
      mChassis,
      { x: 0, y: chassisY, z: chassisZ },
      {
        x: (mChassis / 12) * (Hb * Hb + L * L) * 1.15,
        y: (mChassis / 12) * (W * W + L * L) * 1.15,
        z: (mChassis / 12) * (W * W + Hb * Hb),
      },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    const zFront = geo.bodyFrontZ;
    const zRear = geo.bodyRearZ;
    const cx = (a: number, b: number) => (a + b) / 2;
    // Bastidor central (entre ruedas)
    this.addChassisBox(W / 2 - 0.2, 0.33, (zFront - (zRear + 0.4)) / 2, 0, 0.12 + 0.33, cx(zFront, zRear + 0.4));
    // Guardabarros/costados sobre las ruedas delanteras
    this.addChassisBox(W / 2, 0.2, 0.3, 0, spec.frontWheelRadius * 2 + 0.12, -0.05);
    // Contrapeso
    this.addChassisBox(W / 2, 0.47, 0.32, 0, 0.62, zRear + 0.32);
    this.addChassisBox(W / 2 - 0.04, 0.2, 0.22, 0, 0.3, zRear + 0.26);
    // Capot / asiento
    this.addChassisBox(W / 2 - 0.08, 0.12, 0.55, 0, 1.0, -spec.wheelbase * 0.55);
    // Techo protector y parantes
    const gH = spec.overheadGuardHeight;
    const gz0 = -spec.wheelbase * 0.95;
    const gz1 = 0.0;
    this.addChassisBox(W / 2 - 0.04, 0.03, (gz1 - gz0) / 2 + 0.05, 0, gH - 0.03, cx(gz0, gz1));
    for (const sx of [-1, 1]) {
      this.addChassisBox(0.03, (gH - 1.0) / 2, 0.03, sx * (W / 2 - 0.07), 1.0 + (gH - 1.0) / 2, gz1 - 0.02);
      this.addChassisBox(0.03, (gH - 1.1) / 2, 0.03, sx * (W / 2 - 0.07), 1.1 + (gH - 1.1) / 2, gz0);
    }

    // ---- Mástil exterior (bascula) ----
    const pivotW = toWorld(geo.pivot);
    this.mast = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pivotW.x, pivotW.y, pivotW.z)
        .setRotation(rot)
        .setCanSleep(false)
        .setAdditionalSolverIterations(4)
        .setAngularDamping(0.2),
    );
    const mastLocalCom = mastCom.clone().sub(geo.pivot);
    const mh = spec.loweredMastHeight;
    this.mast.setAdditionalMassProperties(
      mMast,
      mastLocalCom,
      { x: (mMast / 12) * mh * mh, y: (mMast / 12) * 0.8 * 0.8, z: (mMast / 12) * (mh * mh + 0.64) },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    const outerH = geo.outerMastHeight;
    const chY0 = 0.1 - geo.pivot.y;
    const mz = geo.mastZ - geo.pivot.z;
    for (const sx of [-1, 1]) {
      this.addBox(this.mast, 0.035, outerH / 2, geo.mastDepth / 2, sx * geo.outerChannelX, chY0 + outerH / 2, mz, 0, 0.4, 'mast');
    }
    this.addBox(this.mast, geo.outerChannelX, 0.04, geo.mastDepth / 2, 0, chY0 + outerH - 0.04, mz - 0.02, 0, 0.4, 'mast');
    // Mástil interior (y medio si es triplex): colisionadores que se reubican con la elevación
    const innerH = outerH - 0.02;
    for (const sx of [-1, 1]) {
      this.addInner(sx * geo.innerChannelX, chY0 + 0.03 + innerH / 2, mz + 0.01, 0.03, innerH / 2, 'inner');
    }
    this.addInner(0, chY0 + 0.03 + innerH - 0.035, mz + 0.01, geo.innerChannelX, 0.035, 'inner');
    if (spec.mastType === 'triplex') {
      for (const sx of [-1, 1]) {
        this.addInner(sx * (geo.innerChannelX + 0.04), chY0 + 0.02 + innerH / 2, mz, 0.025, innerH / 2, 'intermediate');
      }
    }

    // ---- Carro portahorquillas ----
    const carW = toWorld(new THREE.Vector3(0, geo.forkTop0, geo.forkFace));
    this.carriage = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(carW.x, carW.y, carW.z)
        .setRotation(rot)
        .setCanSleep(false)
        .setAdditionalSolverIterations(4),
    );
    const cw = geo.carriageWidth;
    const T = spec.forkThickness;
    // Placa del carro y respaldo de carga
    const plate = this.addBox(this.carriage, cw / 2, geo.carriageHeight / 2, 0.035, 0, -T + geo.carriageHeight / 2, -0.035 - T, mCar * 0.7, 0.5, 'carriage');
    const back = this.addBox(this.carriage, cw / 2, (spec.backrestHeight - geo.carriageHeight) / 2, 0.015, 0, -T + geo.carriageHeight + (spec.backrestHeight - geo.carriageHeight) / 2, -0.02 - T, mCar * 0.3, 0.5, 'carriage');
    this.loadSensingColliders.push(plate, back);

    // ---- Horquillas + desplazador lateral ----
    this.forks = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(carW.x, carW.y, carW.z)
        .setRotation(rot)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAdditionalSolverIterations(4),
    );
    const bladeMass = mFork * 0.33;
    const shankMass = mFork * 0.1;
    const barMass = mFork - 2 * bladeMass - 2 * shankMass;
    for (const sx of [-1, 1]) {
      const blade = this.addForkBlade(sx * this.spread / 2, bladeMass);
      const shank = this.addBox(this.forks, spec.forkWidth / 2, 0.24, T / 2, sx * this.spread / 2, -T + 0.24, -T / 2, shankMass, 0.45, 'forks');
      this.forkBlades.push(blade);
      this.forkShanks.push(shank);
      this.loadSensingColliders.push(blade, shank);
    }
    // Barra del desplazador
    this.addBox(this.forks, cw / 2 - 0.02, 0.05, 0.02, 0, 0.12, -T - 0.005, barMass, 0.4, 'forks');

    // ---- Articulaciones ----
    const tiltData = RAPIER.JointData.revolute(
      { x: geo.pivot.x, y: geo.pivot.y, z: geo.pivot.z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    this.tiltJoint = world.createImpulseJoint(tiltData, this.chassis, this.mast, true) as RAPIER.RevoluteImpulseJoint;
    this.tiltJoint.setContactsEnabled(false);
    this.tiltJoint.setLimits(-spec.tiltBackDeg * DEG - 0.01, spec.tiltForwardDeg * DEG + 0.01);
    this.tiltJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    this.tiltJoint.setMotorMaxForce(spec.capacityKg * GRAV * 6);
    this.tiltJoint.configureMotor(0, 0, TILT_K, TILT_C);

    const liftData = RAPIER.JointData.prismatic(
      { x: 0, y: geo.forkTop0 - geo.pivot.y, z: geo.forkFace - geo.pivot.z },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    this.liftJoint = world.createImpulseJoint(liftData, this.mast, this.carriage, true) as RAPIER.PrismaticImpulseJoint;
    this.liftJoint.setContactsEnabled(false);
    this.liftJoint.setLimits(-0.003, geo.liftMax + 0.005);
    this.liftJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    // fuerza máxima del cilindro: la válvula de alivio limita a ~130 % de la capacidad nominal
    this.liftJoint.setMotorMaxForce((spec.capacityKg * 1.3 + mCar + mFork) * GRAV);
    this.liftJoint.configureMotor(0, 0, LIFT_K, LIFT_C);

    const shiftData = RAPIER.JointData.prismatic({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    this.shiftJoint = world.createImpulseJoint(shiftData, this.carriage, this.forks, true) as RAPIER.PrismaticImpulseJoint;
    this.shiftJoint.setContactsEnabled(false);
    this.shiftJoint.setLimits(-spec.sideShiftRange - 0.002, spec.sideShiftRange + 0.002);
    this.shiftJoint.configureMotorModel(RAPIER.MotorModel.ForceBased);
    this.shiftJoint.setMotorMaxForce(25000);
    this.shiftJoint.configureMotor(0, 0, SHIFT_K, SHIFT_C);

    this.bodies.push(this.chassis, this.mast, this.carriage, this.forks);

    // ---- Ruedas ----
    const kF = 1.6e6;
    const kR = 1.1e6;
    const defs: WheelDef[] = [
      { name: 'FL', local: new THREE.Vector3(spec.frontTrack / 2, spec.frontWheelRadius, 0), radius: spec.frontWheelRadius, width: spec.frontWheelWidth, front: true, left: true, k: kF, c: 3.6e4 },
      { name: 'FR', local: new THREE.Vector3(-spec.frontTrack / 2, spec.frontWheelRadius, 0), radius: spec.frontWheelRadius, width: spec.frontWheelWidth, front: true, left: false, k: kF, c: 3.6e4 },
      { name: 'RL', local: new THREE.Vector3(spec.rearTrack / 2, spec.rearWheelRadius, -spec.wheelbase), radius: spec.rearWheelRadius, width: spec.rearWheelWidth, front: false, left: true, k: kR, c: 2.6e4 },
      { name: 'RR', local: new THREE.Vector3(-spec.rearTrack / 2, spec.rearWheelRadius, -spec.wheelbase), radius: spec.rearWheelRadius, width: spec.rearWheelWidth, front: false, left: false, k: kR, c: 2.6e4 },
    ];
    for (const def of defs) {
      this.wheels.push({
        def,
        contact: false,
        compression: 0,
        rawCompression: 0,
        normalForce: 0,
        point: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        fwd: new THREE.Vector3(),
        lat: new THREE.Vector3(),
        steer: 0,
        spin: 0,
        slipping: false,
        groundBody: null,
        groundCollider: -1,
        accLat: 0,
        accBrake: 0,
        accDrive: 0,
        appliedLong: 0,
        appliedLat: 0,
        brakeCap: 0,
        hubWorld: new THREE.Vector3(),
        anchor: new THREE.Vector3(),
        anchorSet: false,
        targetLong: 0,
        targetLat: 0,
      });
    }
  }

  private addChassisBox(hx: number, hy: number, hz: number, x: number, y: number, z: number) {
    return this.addBox(this.chassis, hx, hy, hz, x, y, z, 0, 0.5, 'chassis');
  }

  private addBox(
    body: RAPIER.RigidBody,
    hx: number,
    hy: number,
    hz: number,
    x: number,
    y: number,
    z: number,
    mass: number,
    friction: number,
    part: 'chassis' | 'mast' | 'carriage' | 'forks',
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setFriction(friction)
      .setRestitution(0.05)
      .setCollisionGroups(GROUPS.forklift)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(4000);
    if (mass > 0) desc.setMass(mass);
    else desc.setDensity(0);
    const c = this.pw.world.createCollider(desc, body);
    this.pw.tags.set(c, { kind: 'forklift', part });
    this.allColliders.push(c);
    return c;
  }

  private addInner(x: number, y: number, z: number, hx: number, hy: number, stage: 'inner' | 'intermediate') {
    const c = this.addBox(this.mast, hx, hy, this.geo.mastDepth / 2 - 0.015, x, y, z, 0, 0.4, 'mast');
    this.innerMastColliders.push({ c, base: new THREE.Vector3(x, y, z), stage });
  }

  /** Hoja de horquilla con punta afinada (casco convexo). */
  private addForkBlade(x: number, mass: number): RAPIER.Collider {
    const s = this.spec;
    const T = s.forkThickness;
    const w = s.forkWidth / 2;
    const L = s.forkLength;
    const tipT = T * 0.3;
    const taper = Math.min(0.22, L * 0.2);
    const pts = new Float32Array([
      -w, 0, 0, w, 0, 0, -w, -T, 0, w, -T, 0,
      -w, 0, L - taper, w, 0, L - taper,
      -w * 0.8, -T + tipT, L, w * 0.8, -T + tipT, L,
      -w * 0.8, -T, L, w * 0.8, -T, L,
    ]);
    const desc = RAPIER.ColliderDesc.convexHull(pts)!
      .setTranslation(x, 0, 0)
      .setMass(mass)
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(GROUPS.forklift)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(4000);
    const c = this.pw.world.createCollider(desc, this.forks);
    this.pw.tags.set(c, { kind: 'forklift', part: 'forks' });
    this.allColliders.push(c);
    return c;
  }

  // ------------------------------------------------------------------
  // Paso de simulación
  // ------------------------------------------------------------------

  /** Llamar antes de world.step(). */
  preStep(dt: number) {
    this.readJointStates();
    this.updateEngine(dt);
    this.updateHydraulics(dt);
    this.updateSteering(dt);
    this.updateWheels(dt);
  }

  /** Llamar después de world.step(). */
  postStep(dt: number) {
    this.measureForkLoad(dt);
    this.updateTelemetry(dt);
  }

  private readJointStates() {
    const qc = this.rot(this.chassis, _q1);
    const qm = this.rot(this.mast, _q2);
    // rotación relativa del mástil respecto del chasis
    const rel = qc.clone().invert().multiply(qm);
    this.tiltActual = (-2 * Math.atan2(rel.x, rel.w)) / DEG;

    const pm = this.pos(this.mast, _v1);
    const pc = this.pos(this.carriage, _v2);
    const d = pc.sub(pm).applyQuaternion(qm.clone().invert());
    this.liftActual = d.y - (this.geo.forkTop0 - this.geo.pivot.y);

    const pf = this.pos(this.forks, _v3);
    const pc2 = this.pos(this.carriage, _v4);
    const qcar = this.rot(this.carriage, new THREE.Quaternion());
    const s = pf.sub(pc2).applyQuaternion(qcar.invert());
    this.shiftActual = s.x;
  }

  private updateEngine(dt: number) {
    const c = this.controls;
    const spec = this.spec;
    // Encendido con la llave
    if (c.ignition && !this.ignitionPrev) {
      if (this.isElectric) {
        if (this.energy > 0) {
          this.running = true;
          this.emit('engineStart');
        } else this.emit('noFuel');
      } else if (c.direction !== 0) {
        this.emit('needNeutral');
      } else if (this.energy <= 0) {
        this.emit('noFuel');
      } else {
        this.crankTimer = 0.9;
      }
    }
    if (!c.ignition && (this.running || this.crankTimer > 0)) {
      this.running = false;
      this.crankTimer = 0;
      this.emit('engineStop');
    }
    this.ignitionPrev = c.ignition;
    if (this.crankTimer > 0) {
      this.crankTimer -= dt;
      this.engineOmega += (25 - this.engineOmega) * Math.min(1, dt * 8);
      if (this.crankTimer <= 0) {
        this.running = true;
        this.engineOmega = this.omegaIdle * 1.3;
        this.emit('engineStart');
      }
    }
    if (this.running && this.energy <= 0) {
      this.running = false;
      this.emit('noFuel');
      this.emit('engineStop');
    }

    // Cambio de marcha en movimiento
    if (c.direction !== this.dirPrev) {
      const v = this.forwardSpeed();
      if (c.direction !== 0 && Math.abs(v) > 1.2 && Math.sign(v) !== c.direction) this.emit('directionChangeMoving');
      this.dirPrev = c.direction;
    }

    const v = this.forwardSpeed();
    const dir = this.running ? c.direction : 0;
    if (this.isElectric) {
      this.updateElectricDrive(dt, v, dir);
    } else {
      this.updateICDrive(dt, v, dir);
    }

    // Consumo
    if (this.running) {
      if (this.isElectric) {
        const kw = Math.max(0, this.enginePower) / 1000 / 0.85 + this.hydPower / 1000 / 0.8 + spec.energyUseIdle;
        this.energy = Math.max(0, this.energy - (kw * dt) / 3600);
      } else {
        const pNom = this.engineTmax * this.omegaMax * 0.85;
        const frac = clamp(this.enginePower / pNom, 0, 1);
        const lph = spec.energyUseIdle + (spec.energyUseFull - spec.energyUseIdle) * frac;
        this.energy = Math.max(0, this.energy - (lph * dt) / 3600);
      }
      this.hourMeter += dt / 3600;
    }
  }

  private updateICDrive(dt: number, v: number, dir: number) {
    const c = this.controls;
    const R = this.spec.frontWheelRadius;
    const w = Math.max(this.engineOmega, 1);
    let tGov = 0;
    if (this.running) {
      const target = this.omegaIdle + clamp(c.throttle, 0, 1) * (this.omegaMax - this.omegaIdle);
      const kGov = this.engineTmax / (0.06 * this.omegaMax);
      tGov = clamp(kGov * (target - this.engineOmega), -this.engineTmax * 0.25, this.engineTmax);
    }
    // Convertidor de par
    const engage = dir === 0 ? 0 : clamp(1 - c.inching / 0.5, 0, 1);
    const omegaTurb = (v * dir * this.gearRatio) / R;
    const sr = omegaTurb / w;
    const f = clamp(1 - sr, -0.6, 2.2);
    const tImp = this.kc * w * w * f;
    const tr = sr < 0 ? 2.3 : sr < 0.85 ? 2.3 - (1.3 * sr) / 0.85 : 1;
    const tOut = engage * (f > 0 ? tr : 1) * tImp;
    this.driveForce = (dir * tOut * this.gearRatio * 0.85) / R;
    const tHyd = this.hydPower / w;
    const tFric = 0.03 * this.engineOmega + (this.running ? 0 : 8);
    const J = 0.55;
    if (this.crankTimer <= 0) {
      this.engineOmega += ((tGov - engage * tImp - tHyd - tFric) / J) * dt;
      this.engineOmega = clamp(this.engineOmega, 0, this.omegaMax * 1.08);
    }
    if (this.running && this.engineOmega < this.omegaIdle * 0.45) this.engineOmega = this.omegaIdle * 0.45;
    this.enginePower = Math.max(0, tGov * this.engineOmega);
  }

  private updateElectricDrive(dt: number, v: number, dir: number) {
    const c = this.controls;
    const spec = this.spec;
    const vmax = spec.maxSpeedKmh / 3.6;
    const mTot = spec.serviceWeight + this.forkLoadSmoothed;
    const fMax = spec.maxDriveForce;
    const pMax = fMax * vmax * 0.32;
    let F = 0;
    if (this.running && dir !== 0) {
      const vTarget = dir * clamp(c.throttle, 0, 1) * vmax;
      const vDir = v * dir; // velocidad en el sentido elegido
      if (c.throttle > 0.02) {
        if (vDir < -0.05) {
          // Contramarcha (plugging): frena regenerando
          F = dir * fMax * 0.6;
        } else {
          const err = vTarget - v;
          F = clamp(err * mTot * 2.2, -fMax * 0.5, fMax) ;
          if (dir < 0) F = clamp(err * mTot * 2.2, -fMax, fMax * 0.5);
          F *= Math.min(1, c.throttle * 3);
        }
      } else if (Math.abs(v) > 0.05) {
        // Freno regenerativo al soltar el acelerador
        F = -Math.sign(v) * Math.min(mTot * 0.9, fMax * 0.5);
      }
      const P = Math.abs(F * v);
      if (P > pMax && Math.abs(v) > 0.1) F *= pMax / P;
    } else if (this.running && Math.abs(v) > 0.05) {
      F = -Math.sign(v) * mTot * 0.25;
    }
    this.driveForce = F;
    this.enginePower = F * v;
    // "rpm" de un eléctrico: velocidad del motor de tracción, para el sonido
    const target = this.running ? Math.abs(v) * this.gearRatio / spec.frontWheelRadius : 0;
    this.engineOmega += (target - this.engineOmega) * Math.min(1, dt * 10);
  }

  /** Flujo hidráulico disponible (0..1). */
  private hydraulicFlow(): number {
    if (!this.running) return 0;
    if (this.isElectric) return this.energy > 0 ? 1 : 0;
    return clamp(this.engineOmega / (0.88 * this.omegaMax), 0, 1);
  }

  private updateHydraulics(dt: number) {
    const c = this.controls;
    const spec = this.spec;
    const flow = this.hydraulicFlow();
    const load = this.forkLoadSmoothed;
    let power = 0;
    this.reliefActive = false;

    // --- Elevación (cilindro de simple efecto: empuja hacia arriba, baja por gravedad) ---
    const lv = deadzone(clamp(c.lift, -1, 1), 0.06);
    const liftMax = this.geo.liftMax;
    let vLift = 0;
    if (lv > 0) {
      if (flow > 0) {
        if (this.liftCmd >= liftMax - 1e-4) {
          this.reliefActive = true; // fin de carrera
        } else if (this.liftCmd - this.liftActual > 0.03) {
          // carro trabado o sobrecarga: se abre la válvula de alivio
          this.reliefActive = true;
          this.liftCmd = this.liftActual + 0.03;
        } else {
          const speed = spec.liftSpeed * (1 - 0.18 * Math.min(1, load / spec.capacityKg));
          vLift = lv * speed * flow;
          this.liftCmd = Math.min(liftMax, this.liftCmd + vLift * dt);
          power += ((load + spec.carriageMass + spec.forkFrameMass) * GRAV * vLift) / 0.75 + 600 * lv;
        }
        if (this.reliefActive) power += 7000 * lv * flow;
      }
    } else if (lv < 0) {
      // descenso controlado por válvula: no necesita la bomba
      vLift = lv * spec.lowerSpeed;
      this.liftCmd = Math.max(0, this.liftCmd + vLift * dt);
    }
    // Cadena floja: si algo sostiene el carro por encima del cilindro, el motor no tira hacia abajo
    const slack = this.liftActual - this.liftCmd > 0.012;
    if (slack) {
      this.liftCmd = Math.max(this.liftCmd, this.liftActual - 0.6);
      this.liftJoint.configureMotor(this.liftActual, 0, 0, 0);
    } else {
      this.liftJoint.configureMotor(this.liftCmd, vLift, LIFT_K, LIFT_C);
    }
    this.slackChain = slack;

    // --- Inclinación (doble efecto) ---
    const tv = deadzone(clamp(c.tilt, -1, 1), 0.06);
    let vTilt = 0;
    if (tv !== 0 && flow > 0) {
      const rate = tv * spec.tiltSpeedDeg * flow;
      const next = clamp(this.tiltCmd + rate * dt, -spec.tiltForwardDeg, spec.tiltBackDeg);
      if (next === this.tiltCmd) {
        this.reliefActive = true;
        power += 5000 * Math.abs(tv) * flow;
      } else {
        power += 1500 * Math.abs(tv) + load * 0.3 * Math.abs(tv);
        vTilt = rate;
      }
      this.tiltCmd = next;
    }
    this.tiltJoint.configureMotor(-this.tiltCmd * DEG, -vTilt * DEG, TILT_K, TILT_C);

    // --- Desplazador lateral ---
    let vShift = 0;
    if (spec.sideShift) {
      const sv = deadzone(clamp(c.sideShift, -1, 1), 0.06);
      if (sv !== 0 && flow > 0) {
        const rate = sv * spec.sideShiftSpeed * flow;
        const next = clamp(this.shiftCmd + rate * dt, -spec.sideShiftRange, spec.sideShiftRange);
        if (next === this.shiftCmd) {
          this.reliefActive = true;
          power += 4000 * Math.abs(sv) * flow;
        } else {
          power += 1200 * Math.abs(sv);
          vShift = rate;
        }
        this.shiftCmd = next;
      }
    }
    this.shiftJoint.configureMotor(this.shiftCmd, vShift, SHIFT_K, SHIFT_C);

    // --- Posicionador de horquillas ---
    if (spec.forkPositioner) {
      const pv = deadzone(clamp(c.spread, -1, 1), 0.06);
      if (pv !== 0 && flow > 0) {
        const next = clamp(this.spread + pv * 0.18 * flow * dt, spec.forkSpreadMin, spec.forkSpreadMax);
        if (next !== this.spread) {
          this.spread = next;
          this.applySpread();
          power += 1200 * Math.abs(pv);
        } else {
          this.reliefActive = true;
          power += 3000 * Math.abs(pv) * flow;
        }
      }
    }

    // Mástiles interiores
    const st = mastStages(spec, Math.max(this.liftActual, 0));
    for (const m of this.innerMastColliders) {
      const rise = m.stage === 'inner' ? st.inner : st.intermediate;
      m.c.setTranslationWrtParent({ x: m.base.x, y: m.base.y + rise, z: m.base.z });
    }
    if (this.reliefActive && !this.telemetry.reliefActive) this.emit('relief');
    this.hydPower = power;
  }

  private applySpread() {
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -1 : 1;
      const x = (sx * this.spread) / 2;
      this.forkBlades[i].setTranslationWrtParent({ x, y: 0, z: 0 });
      const t = this.forkShanks[i].translationWrtParent()!;
      this.forkShanks[i].setTranslationWrtParent({ x, y: t.y, z: t.z });
    }
  }

  /** Ángulo equivalente máximo (bicicleta) a partir del ángulo máximo de la rueda interior. */
  private maxCenterSteer(): number {
    const s = this.spec;
    const rInner = s.wheelbase / Math.tan(s.maxInnerSteerDeg * DEG);
    return Math.atan(s.wheelbase / (rInner + s.rearTrack / 2));
  }

  private updateSteering(dt: number) {
    const target = clamp(this.controls.handwheel, -1, 1) * this.maxCenterSteer();
    const powered = this.running;
    const rate = (powered ? 95 : 6) * DEG;
    const d = target - this.steerAngle;
    this.steerAngle += clamp(d, -rate * dt, rate * dt);
    const s = this.spec;
    const a = this.steerAngle;
    if (Math.abs(a) < 1e-4) {
      for (const w of this.wheels) w.steer = 0;
      return;
    }
    const R = s.wheelbase / Math.tan(Math.abs(a));
    const inner = Math.atan(s.wheelbase / Math.max(0.01, R - s.rearTrack / 2));
    const outer = Math.atan(s.wheelbase / (R + s.rearTrack / 2));
    const leftTurn = a > 0;
    for (const w of this.wheels) {
      if (w.def.front) {
        w.steer = 0;
        continue;
      }
      const isInner = w.def.left === leftTurn;
      // Las ruedas traseras giran al revés: para doblar a la izquierda apuntan a la derecha
      w.steer = -(isInner ? inner : outer) * Math.sign(a);
    }
  }

  forwardSpeed(): number {
    const v = this.chassis.linvel();
    const q = this.rot(this.chassis, _q1);
    const f = _v1.set(0, 0, 1).applyQuaternion(q);
    return v.x * f.x + v.y * f.y + v.z * f.z;
  }

  private chassisInvInertia = new THREE.Matrix3();
  private chassisCom = new THREE.Vector3();
  private chassisInvMass = 0;

  private updateChassisMassCache() {
    const c = this.chassis.worldCom();
    this.chassisCom.set(c.x, c.y, c.z);
    const inv = this.chassis.effectiveWorldInvInertia();
    // Matrix3.set recibe por filas
    this.chassisInvInertia.set(inv.m11, inv.m12, inv.m13, inv.m21, inv.m22, inv.m23, inv.m31, inv.m32, inv.m33);
    this.chassisInvMass = this.chassis.invMass();
  }

  /** Masa efectiva inversa del chasis en el punto p a lo largo de dir. */
  private invMassAt(p: THREE.Vector3, dir: THREE.Vector3): number {
    const r = _v3.copy(p).sub(this.chassisCom);
    const rxd = r.cross(dir);
    const Irxd = _v4.copy(rxd).applyMatrix3(this.chassisInvInertia);
    return this.chassisInvMass + rxd.dot(Irxd);
  }

  private updateWheels(dt: number) {
    const { world } = this.pw;
    const spec = this.spec;
    const c = this.controls;
    const q = this.rot(this.chassis, _q1).clone();
    const pos = this.pos(this.chassis, _v1).clone();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const fwdC = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    this.updateChassisMassCache();
    this.chassis.resetForces(true);
    this.chassis.resetTorques(true);

    const s0 = 0.35;
    // 1) Rayos
    for (const w of this.wheels) {
      const hub = w.hubWorld.copy(w.def.local).applyQuaternion(q).add(pos);
      const origin = hub.clone().addScaledVector(up, s0);
      const ray = new RAPIER.Ray(origin, { x: -up.x, y: -up.y, z: -up.z });
      const maxToi = s0 + w.def.radius + 0.06;
      const hit = world.castRayAndGetNormal(ray, maxToi, true, undefined, GROUPS.wheelRay);
      w.groundBody = null;
      const prevGround = w.groundCollider;
      w.groundCollider = -1;
      if (hit) {
        w.rawCompression = s0 + w.def.radius - hit.timeOfImpact;
        w.point.copy(origin).addScaledVector(up, -hit.timeOfImpact);
        w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        if (w.normal.dot(up) < 0.3) w.normal.copy(up);
        w.groundCollider = hit.collider.handle;
        const parent = hit.collider.parent();
        if (parent && !parent.isFixed()) w.groundBody = parent;
      } else {
        w.rawCompression = -1;
      }
      if (w.groundCollider !== prevGround) w.anchorSet = false;
    }

    // 2) Eje trasero pivotante: reparte la compresión por igual mientras no toque el tope
    const RL = this.wheels[2];
    const RR = this.wheels[3];
    const track = spec.rearTrack;
    const phiMax = spec.rearAxleOscillationDeg * DEG;
    for (const w of this.wheels) w.compression = w.rawCompression;
    if (RL.rawCompression > -0.5 && RR.rawCompression > -0.5) {
      let phi = (RR.rawCompression - RL.rawCompression) / track;
      phi = clamp(phi, -phiMax, phiMax);
      this.rearAxleAngle = phi;
      RL.compression = RL.rawCompression + (track / 2) * phi;
      RR.compression = RR.rawCompression - (track / 2) * phi;
    } else if (RL.rawCompression > -0.5 || RR.rawCompression > -0.5) {
      // una sola rueda trasera con suelo: el eje cae hasta el tope
      const one = RL.rawCompression > -0.5 ? RL : RR;
      const sign = one === RL ? -1 : 1;
      this.rearAxleAngle = sign * phiMax;
      one.compression = one.rawCompression - (track / 2) * phiMax;
    }

    // 3) Fuerzas normales (se aplican como fuerzas durante el paso, junto con la gravedad)
    const fMax = spec.serviceWeight * GRAV * 3;
    let anyContact = false;
    for (const w of this.wheels) {
      w.contact = w.compression > 0;
      w.normalForce = 0;
      if (!w.contact) continue;
      anyContact = true;
      const vRel = this.relVel(w, _v2);
      const rate = -vRel.dot(w.normal);
      let F = w.def.k * w.compression + w.def.c * rate;
      F = clamp(F, 0, fMax);
      w.normalForce = F;
    }
    // El pivote reparte la carga trasera por igual mientras el eje esté libre
    if (RL.contact && RR.contact && Math.abs(this.rearAxleAngle) < phiMax - 1e-6) {
      const avg = (RL.normalForce + RR.normalForce) / 2;
      RL.normalForce = avg;
      RR.normalForce = avg;
    }
    for (const w of this.wheels) {
      if (w.normalForce <= 0) continue;
      const F = _v2.copy(w.normal).multiplyScalar(w.normalForce);
      this.chassis.addForceAtPoint(F, w.point, true);
      if (w.groundBody && w.groundBody.isDynamic()) {
        w.groundBody.applyImpulseAtPoint(F.multiplyScalar(-dt), w.point, true);
      }
    }
    if (!anyContact) {
      for (const w of this.wheels) {
        w.slipping = false;
        w.anchorSet = false;
      }
      return;
    }

    // 4) Rozamiento: tracción, frenos, deriva lateral (impulsos secuenciales con círculo de fricción)
    const brakePedal = clamp(Math.max(c.brake, this.isElectric ? 0 : (c.inching - 0.5) / 0.5), 0, 1);
    const serviceBrake = brakePedal * spec.maxBrakeForce * 0.5;
    const parking = c.parkingBrake ? spec.maxBrakeForce * 0.45 : 0;
    const crr = 0.012;
    const mu = 0.85;
    const frontContacts = (this.wheels[0].contact ? 1 : 0) + (this.wheels[1].contact ? 1 : 0);
    for (const w of this.wheels) {
      w.fwd.copy(fwdC).applyAxisAngle(up, w.steer);
      w.fwd.addScaledVector(w.normal, -w.fwd.dot(w.normal)).normalize();
      w.lat.copy(w.normal).cross(w.fwd).normalize();
      w.accLat = 0;
      w.accBrake = 0;
      w.appliedLong = 0;
      w.appliedLat = 0;
      w.slipping = false;
      w.accDrive = 0;
      w.brakeCap = 0;
      w.targetLong = 0;
      w.targetLat = 0;
      if (!w.contact) {
        w.anchorSet = false;
        continue;
      }
      const braking = w.def.front ? Math.max(serviceBrake, parking) : 0;
      w.brakeCap = (crr * w.normalForce + braking) * dt;
      if (w.def.front) w.accDrive = (this.driveForce / Math.max(1, frontContacts)) * dt;

      // Anclaje estático: evita que el vehículo se arrastre lentamente cuando está detenido
      const vRel = this.relVel(w, _v2);
      const slow = Math.abs(vRel.dot(w.fwd)) < 0.06 && Math.abs(vRel.dot(w.lat)) < 0.06 && Math.abs(this.driveForce) < 1;
      const held = braking > 0;
      if (slow) {
        if (!w.anchorSet) {
          w.anchor.copy(w.point);
          w.anchorSet = true;
        }
        const err = _v3.copy(w.point).sub(w.anchor);
        err.addScaledVector(w.normal, -err.dot(w.normal));
        if (!held) {
          // rueda libre: el ancla acompaña el rodado en sentido longitudinal
          const along = err.dot(w.fwd);
          w.anchor.addScaledVector(w.fwd, along);
          err.addScaledVector(w.fwd, -along);
        }
        if (err.length() > 0.08) {
          w.anchor.copy(w.point);
        } else {
          const beta = 0.25 / dt;
          w.targetLong = -err.dot(w.fwd) * beta;
          w.targetLat = -err.dot(w.lat) * beta;
        }
      } else {
        w.anchorSet = false;
      }
    }
    // orden alternado en cada pasada para no introducir un sesgo de guiñada
    const order = [this.wheels[0], this.wheels[1], this.wheels[2], this.wheels[3]];
    const orderRev = [this.wheels[1], this.wheels[0], this.wheels[3], this.wheels[2]];
    for (let pass = 0; pass < 4; pass++) {
      for (const w of pass % 2 === 0 ? order : orderRev) {
        if (!w.contact || w.normalForce <= 0) continue;
        const vRel = this.relVel(w, _v2);
        const vLong = vRel.dot(w.fwd) - w.targetLong;
        const vLat = vRel.dot(w.lat) - w.targetLat;
        const kLat = 1 / (this.invMassAt(w.point, w.lat) + this.groundInvMass(w, w.lat));
        const kLong = 1 / (this.invMassAt(w.point, w.fwd) + this.groundInvMass(w, w.fwd));
        let lat = w.accLat - vLat * kLat;
        // freno: intenta anular la velocidad longitudinal (después de la tracción)
        const vLongAfterDrive = pass === 0 ? vLong + w.accDrive / kLong : vLong;
        let brake = clamp(w.accBrake - vLongAfterDrive * kLong, -w.brakeCap, w.brakeCap);
        let lon = w.accDrive + brake;
        const maxF = mu * w.normalForce * dt;
        const mag = Math.hypot(lon, lat);
        if (mag > maxF) {
          const k = maxF / mag;
          lon *= k;
          lat *= k;
          w.slipping = true;
          brake = lon - w.accDrive;
        }
        const dLon = lon - w.appliedLong;
        const dLat = lat - w.appliedLat;
        const J = _v3.copy(w.fwd).multiplyScalar(dLon).addScaledVector(w.lat, dLat);
        this.chassis.applyImpulseAtPoint(J, w.point, true);
        if (w.groundBody && w.groundBody.isDynamic()) w.groundBody.applyImpulseAtPoint(J.clone().negate(), w.point, true);
        w.appliedLong = lon;
        w.appliedLat = lat;
        w.accLat = lat;
        w.accBrake = brake;
      }
    }
    // giro visual de las ruedas
    for (const w of this.wheels) {
      if (!w.contact) continue;
      const vRel = this.relVel(w, _v2);
      w.spin += (vRel.dot(w.fwd) / w.def.radius) * dt;
    }
  }

  private groundInvMass(w: WheelState, dir: THREE.Vector3): number {
    const b = w.groundBody;
    if (!b || !b.isDynamic()) return 0;
    const com = b.worldCom();
    const r = _v3.set(w.point.x - com.x, w.point.y - com.y, w.point.z - com.z);
    const rxd = r.cross(dir);
    const inv = b.effectiveWorldInvInertia();
    const x = inv.m11 * rxd.x + inv.m12 * rxd.y + inv.m13 * rxd.z;
    const y = inv.m21 * rxd.x + inv.m22 * rxd.y + inv.m23 * rxd.z;
    const z = inv.m31 * rxd.x + inv.m32 * rxd.y + inv.m33 * rxd.z;
    return b.invMass() + rxd.x * x + rxd.y * y + rxd.z * z;
  }

  /** Velocidad relativa del chasis respecto del suelo en el punto de contacto de la rueda. */
  private relVel(w: WheelState, out: THREE.Vector3): THREE.Vector3 {
    const v = this.chassis.velocityAtPoint(w.point);
    out.set(v.x, v.y, v.z);
    if (w.groundBody) {
      const g = w.groundBody.velocityAtPoint(w.point);
      out.x -= g.x;
      out.y -= g.y;
      out.z -= g.z;
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Báscula de horquillas: suma de impulsos de contacto con las cargas
  // ------------------------------------------------------------------
  /** Cuerpos (pallets/props) que las horquillas sostienen por completo en este momento. */
  readonly carried = new Set<number>();
  /** Cuerpos que tocan las horquillas (aunque estén apoyados en otro lado). */
  readonly touchingForks = new Set<number>();

  private measureForkLoad(dt: number) {
    const { world, tags } = this.pw;
    const n = new THREE.Vector3();
    const qf = this.rot(this.forks, new THREE.Quaternion());
    const qfInv = qf.clone().invert();
    const pf = this.pos(this.forks, new THREE.Vector3());
    const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rot(this.chassis, _q1));
    const touching = new Map<number, { body: RAPIER.RigidBody; up: number; cx: number; cy: number; cz: number; w: number }>();
    for (const fc of this.loadSensingColliders) {
      world.contactPairsWith(fc, (other) => {
        const tag = tags.get(other.handle);
        if (!tag || (tag.kind !== 'pallet' && tag.kind !== 'prop')) return;
        const body = other.parent();
        if (!body) return;
        world.contactPair(fc, other, (manifold, flipped) => {
          const k = manifold.numContacts();
          if (k === 0) return;
          let imp = 0;
          let minDist = Infinity;
          for (let i = 0; i < k; i++) {
            imp += manifold.contactImpulse(i);
            minDist = Math.min(minDist, manifold.contactDist(i));
          }
          if (imp <= 0 && minDist > 0.004) return;
          const nn = manifold.normal();
          n.set(nn.x, nn.y, nn.z);
          if (flipped) n.negate();
          let e = touching.get(body.handle);
          if (!e) {
            e = { body, up: 0, cx: 0, cy: 0, cz: 0, w: 0 };
            touching.set(body.handle, e);
          }
          const f = (imp * n.dot(upDir)) / dt;
          if (f <= 0) return;
          e.up += f;
          // centroide ponderado por el impulso de cada punto (en el colisionador de la horquilla)
          const ft = fc.translation();
          const fr = fc.rotation();
          _qc.set(fr.x, fr.y, fr.z, fr.w);
          for (let i = 0; i < k; i++) {
            const ii = manifold.contactImpulse(i);
            if (ii <= 0) continue;
            const lp = flipped ? manifold.localContactPoint2(i) : manifold.localContactPoint1(i);
            if (!lp) continue;
            _vc.set(lp.x, lp.y, lp.z).applyQuaternion(_qc);
            e.cx += (_vc.x + ft.x) * ii;
            e.cy += (_vc.y + ft.y) * ii;
            e.cz += (_vc.z + ft.z) * ii;
            e.w += ii;
          }
        });
      });
    }

    this.carried.clear();
    this.touchingForks.clear();
    let total = 0;
    const centroid = _v4.set(0, 0, 0);
    let wsum = 0;
    const visited = new Set<number>();
    for (const e of touching.values()) {
      this.touchingForks.add(e.body.handle);
      if (visited.has(e.body.handle)) continue;
      const stack = this.collectStack(e.body, visited);
      const supported = stack.some((b) => this.touchesStatic(b));
      if (!supported) {
        // la carga está sólo sobre las horquillas: la báscula lee la masa completa de la pila
        for (const b of stack) {
          const m = b.mass();
          const c = b.worldCom();
          total += m;
          centroid.x += c.x * m;
          centroid.y += c.y * m;
          centroid.z += c.z * m;
          wsum += m;
          this.carried.add(b.handle);
        }
      } else {
        // apoyada en parte en otro lado (rack, piso): medimos la fuerza de contacto
        let stackMass = 0;
        for (const b of stack) stackMass += b.mass();
        const m = Math.min(stackMass, e.up / GRAV);
        total += m;
        if (e.w > 0 && m > 0) {
          centroid.x += (e.cx / e.w) * m;
          centroid.y += (e.cy / e.w) * m;
          centroid.z += (e.cz / e.w) * m;
          wsum += m;
        }
      }
    }
    this.forkLoadKg = total;
    const a = 1 - Math.exp(-dt / 0.12);
    this.forkLoadSmoothed += (this.forkLoadKg - this.forkLoadSmoothed) * a;
    if (wsum > 0) {
      centroid.multiplyScalar(1 / wsum);
      const local = centroid.sub(pf).applyQuaternion(qfInv);
      this.loadCentroidLocal.lerp(local, a);
    }
  }

  /** Cuerpo + los que están apilados encima (apoyados en él). */
  private collectStack(root: RAPIER.RigidBody, visited: Set<number>): RAPIER.RigidBody[] {
    const { world, tags } = this.pw;
    const out: RAPIER.RigidBody[] = [];
    const queue = [root];
    visited.add(root.handle);
    while (queue.length) {
      const b = queue.shift()!;
      out.push(b);
      const by = b.worldCom().y;
      for (let i = 0; i < b.numColliders(); i++) {
        const col = b.collider(i);
        world.contactPairsWith(col, (other) => {
          const ob = other.parent();
          if (!ob || visited.has(ob.handle) || !ob.isDynamic()) return;
          const tag = tags.get(other.handle);
          if (!tag || (tag.kind !== 'pallet' && tag.kind !== 'prop')) return;
          if (ob.worldCom().y < by + 0.05) return;
          let touchingPair = false;
          world.contactPair(col, other, (m) => {
            for (let k = 0; k < m.numContacts(); k++) if (m.contactImpulse(k) > 0) touchingPair = true;
          });
          if (touchingPair) {
            visited.add(ob.handle);
            queue.push(ob);
          }
        });
      }
    }
    return out;
  }

  /** ¿El cuerpo toca algo estático (piso, rack, camión) con fuerza? */
  private touchesStatic(b: RAPIER.RigidBody): boolean {
    const { world } = this.pw;
    let found = false;
    for (let i = 0; i < b.numColliders() && !found; i++) {
      const col = b.collider(i);
      world.contactPairsWith(col, (other) => {
        if (found) return;
        const ob = other.parent();
        if (ob && !ob.isFixed()) return;
        world.contactPair(col, other, (m) => {
          for (let k = 0; k < m.numContacts(); k++) if (m.contactImpulse(k) > 1e-3) found = true;
        });
      });
    }
    return found;
  }

  // ------------------------------------------------------------------
  // Telemetría
  // ------------------------------------------------------------------
  private emptyTelemetry(): ForkliftTelemetry {
    return {
      speed: 0, speedKmh: 0, rpm: 0, engineLoad: 0, engineRunning: false, cranking: false,
      energy: 0, energyFrac: 1, hourMeter: 0, forkHeight: 0, liftPos: 0, liftCmd: 0, tiltDeg: 0,
      sideShift: 0, spread: 0, forkLoadKg: 0, loadCenter: 0, innerMastRise: 0, intermediateRise: 0,
      steerDeg: 0, rearAxleDeg: 0, wheelLoads: [0, 0, 0, 0], rearLoadFrac: 0.5, lateralBalance: 0,
      copX: 0, copZ: 0, reliefActive: false, liftActive: 0, tiltActive: 0, shiftActive: 0,
      accelLong: 0, accelLat: 0, rollDeg: 0, pitchDeg: 0, tippedOver: false, wheelsSlipping: false,
      driveForce: 0,
    };
  }

  private updateTelemetry(dt: number) {
    const t = this.telemetry;
    const spec = this.spec;
    const v = this.forwardSpeed();
    t.speed = v;
    t.speedKmh = v * 3.6;
    t.rpm = this.isElectric ? this.engineOmega * 60 / (2 * Math.PI) : this.engineOmega * 60 / (2 * Math.PI);
    t.engineRunning = this.running;
    t.cranking = this.crankTimer > 0;
    t.engineLoad = this.isElectric
      ? clamp(Math.abs(this.driveForce) / spec.maxDriveForce, 0, 1)
      : clamp(this.enginePower / (this.engineTmax * this.omegaMax * 0.85), 0, 1);
    t.energy = this.energy;
    t.energyFrac = this.energy / spec.energyCapacity;
    t.hourMeter = this.hourMeter;
    t.liftPos = this.liftActual;
    t.liftCmd = this.liftCmd;
    t.tiltDeg = this.tiltActual;
    t.sideShift = this.shiftActual;
    t.spread = this.spread;
    t.forkLoadKg = Math.max(0, this.forkLoadSmoothed);
    t.loadCenter = Math.max(0, this.loadCentroidLocal.z);
    const st = mastStages(spec, Math.max(0, this.liftActual));
    t.innerMastRise = st.inner;
    t.intermediateRise = st.intermediate;
    t.steerDeg = this.steerAngle / DEG;
    t.rearAxleDeg = this.rearAxleAngle / DEG;
    t.reliefActive = this.reliefActive;
    t.liftActive = this.controls.lift;
    t.tiltActive = this.controls.tilt;
    t.shiftActive = this.controls.sideShift;
    t.driveForce = this.driveForce;

    // altura de horquillas respecto del plano del chasis
    const qc = this.rot(this.chassis, _q1).clone();
    const pc = this.pos(this.chassis, _v1).clone();
    const pf = this.pos(this.forks, _v2).clone();
    const local = pf.sub(pc).applyQuaternion(qc.clone().invert());
    t.forkHeight = local.y;

    // Cargas en ruedas y centro de presión
    let sum = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      t.wheelLoads[i] = w.normalForce;
      sum += w.normalForce;
      cx += w.normalForce * w.def.local.x;
      cz += w.normalForce * w.def.local.z;
    }
    if (sum > 1) {
      const a = 1 - Math.exp(-dt / 0.12);
      this.copSmoothed.x += (cx / sum - this.copSmoothed.x) * a;
      this.copSmoothed.y += (cz / sum - this.copSmoothed.y) * a;
      t.rearLoadFrac = (this.wheels[2].normalForce + this.wheels[3].normalForce) / sum;
      const ff = this.wheels[0].normalForce + this.wheels[1].normalForce;
      t.lateralBalance = ff > 1 ? (this.wheels[0].normalForce - this.wheels[1].normalForce) / ff : 0;
    }
    t.copX = this.copSmoothed.x;
    t.copZ = this.copSmoothed.y;

    // Aceleraciones (marco del chasis)
    const lv = this.chassis.linvel();
    const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    const acc = vel.clone().sub(this.prevVel).multiplyScalar(1 / dt);
    this.prevVel.copy(vel);
    this.accelSmoothed.lerp(acc, 1 - Math.exp(-dt / 0.2));
    const accLocal = this.accelSmoothed.clone().applyQuaternion(qc.clone().invert());
    t.accelLong = accLocal.z;
    t.accelLat = accLocal.x;

    // Inclinación del chasis
    const upC = new THREE.Vector3(0, 1, 0).applyQuaternion(qc);
    const fwdC = new THREE.Vector3(0, 0, 1).applyQuaternion(qc);
    const leftC = new THREE.Vector3(1, 0, 0).applyQuaternion(qc);
    t.pitchDeg = Math.asin(clamp(fwdC.y, -1, 1)) / DEG;
    t.rollDeg = Math.asin(clamp(leftC.y, -1, 1)) / DEG;
    t.tippedOver = upC.y < 0.6;
    t.wheelsSlipping = this.wheels.some((w) => w.slipping);
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  pos(b: RAPIER.RigidBody, out: THREE.Vector3): THREE.Vector3 {
    const t = b.translation();
    return out.set(t.x, t.y, t.z);
  }
  rot(b: RAPIER.RigidBody, out: THREE.Quaternion): THREE.Quaternion {
    const r = b.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }

  /** Posición del punto de referencia del chasis (piso bajo el eje delantero). */
  get position(): THREE.Vector3 {
    return this.pos(this.chassis, new THREE.Vector3());
  }
  get quaternion(): THREE.Quaternion {
    return this.rot(this.chassis, new THREE.Quaternion());
  }
  get yaw(): number {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
    return Math.atan2(f.x, f.z);
  }

  /** Teletransporta el autoelevador (endereza, baja horquillas). */
  reset(position: THREE.Vector3, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const place = (b: RAPIER.RigidBody, local: THREE.Vector3) => {
      const p = local.clone().applyQuaternion(q).add(position);
      b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    };
    this.liftCmd = 0;
    this.tiltCmd = 0;
    this.shiftCmd = 0;
    this.liftActual = 0;
    this.tiltActual = 0;
    this.steerAngle = 0;
    this.controls.handwheel = 0;
    place(this.chassis, new THREE.Vector3(0, 0.02, 0));
    place(this.mast, this.geo.pivot.clone().add(new THREE.Vector3(0, 0.02, 0)));
    place(this.carriage, new THREE.Vector3(0, this.geo.forkTop0 + 0.02, this.geo.forkFace));
    place(this.forks, new THREE.Vector3(0, this.geo.forkTop0 + 0.02, this.geo.forkFace));
    this.tiltJoint.configureMotor(0, 0, TILT_K, TILT_C);
    this.liftJoint.configureMotor(0, 0, LIFT_K, LIFT_C);
    this.shiftJoint.configureMotor(0, 0, SHIFT_K, SHIFT_C);
    this.prevVel.set(0, 0, 0);
  }

  /** Deja el motor en marcha sin pasar por el arranque (inicio de lecciones). */
  startEngineImmediately() {
    this.controls.ignition = true;
    this.ignitionPrev = true;
    this.running = true;
    this.crankTimer = 0;
    this.engineOmega = this.omegaIdle;
  }

  /** Recarga combustible/batería. */
  refuel(fraction = 1) {
    this.energy = Math.min(this.spec.energyCapacity, this.energy + this.spec.energyCapacity * fraction);
  }

  destroy() {
    const { world, tags } = this.pw;
    for (const c of this.allColliders) tags.delete(c);
    for (const b of this.bodies) world.removeRigidBody(b);
  }
}
