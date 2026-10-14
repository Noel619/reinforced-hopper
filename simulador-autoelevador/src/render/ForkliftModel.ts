import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ForkliftSpec } from '../sim/specs.ts';
import { computeGeometry, type ForkliftGeometry, type ForkliftControls, type ForkliftTelemetry, type WheelState } from '../sim/forklift.ts';
import { materials, paint } from './materials.ts';
import { labelTexture } from './textures.ts';

export type CabControlId =
  | 'lift'
  | 'tilt'
  | 'shift'
  | 'spread'
  | 'direction'
  | 'key'
  | 'parking'
  | 'horn'
  | 'belt'
  | 'lights'
  | 'wheel';

export interface CabControl {
  id: CabControlId;
  /** Objetos que reciben el rayo del ratón. */
  targets: THREE.Object3D[];
  /** Pivote que se anima. */
  pivot: THREE.Object3D;
  label: string;
}

const MODEL_COLORS: Record<string, number> = {
  toro15: 0xc7362b,
  puma25: 0xf2b705,
  volt18: 0x1f8a70,
  titan35: 0xe8701a,
  condor20: 0x9ccf2a,
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, mat: THREE.Material, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.castShadow = true;
  return m;
}

/** Barra entre dos puntos (para parantes del techo, varillas, etc.). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, square = true): THREE.Mesh {
  const len = a.distanceTo(b);
  const g = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, 10);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

export class ForkliftModel {
  readonly spec: ForkliftSpec;
  readonly geo: ForkliftGeometry;
  readonly root = new THREE.Group();
  readonly chassis = new THREE.Group();
  readonly mast = new THREE.Group();
  readonly carriage = new THREE.Group();
  readonly forks = new THREE.Group();
  readonly controls: CabControl[] = [];
  readonly eye: THREE.Vector3;
  readonly paintMat: THREE.MeshStandardMaterial;
  /** Pantalla del tablero (canvas). */
  readonly dashCanvas: HTMLCanvasElement;
  readonly dashTexture: THREE.CanvasTexture;
  private innerMast = new THREE.Group();
  private intermediateMast = new THREE.Group();
  private liftRods: THREE.Mesh[] = [];
  private frontWheels: THREE.Object3D[] = [];
  private rearKnuckles: THREE.Object3D[] = [];
  private rearWheels: THREE.Object3D[] = [];
  private rearAxle = new THREE.Group();
  private steeringWheel = new THREE.Group();
  private levers: Partial<Record<CabControlId, THREE.Object3D>> = {};
  private pedals: { acc?: THREE.Object3D; brake?: THREE.Object3D; inch?: THREE.Object3D } = {};
  private beacon!: THREE.Mesh;
  private beaconLight!: THREE.PointLight;
  private headLights: THREE.SpotLight[] = [];
  private headLensMats: THREE.MeshStandardMaterial[] = [];
  private brakeLightMat!: THREE.MeshStandardMaterial;
  private reverseLightMat!: THREE.MeshStandardMaterial;
  private tiltCyl: { barrel: THREE.Mesh; rod: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private chains: THREE.Mesh[] = [];
  private beltMesh!: THREE.Mesh;
  private forkMeshes: THREE.Group[] = [];
  private blueSpot: THREE.SpotLight | null = null;
  private blueSpotMarker: THREE.Mesh | null = null;
  readonly cabOnly: THREE.Object3D[] = [];
  private highlight: THREE.Mesh | null = null;

  constructor(spec: ForkliftSpec) {
    this.spec = spec;
    this.geo = computeGeometry(spec);
    this.paintMat = paint(MODEL_COLORS[spec.id] ?? 0xf2b705);
    this.eye = new THREE.Vector3(0, spec.seatHeight + 0.8, -spec.wheelbase * 0.6 + 0.13);
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTexture.colorSpace = THREE.SRGBColorSpace;
    this.root.add(this.chassis, this.mast, this.carriage, this.forks);
    this.buildChassis();
    this.buildCab();
    this.buildWheels();
    this.buildMast();
    this.buildCarriage();
    this.buildForks();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
  }

  // ---------------------------------------------------------------- chasis
  private buildChassis() {
    const s = this.spec;
    const M = materials();
    const W = s.bodyWidth;
    const wb = s.wheelbase;
    const P = this.paintMat;
    const g = this.chassis;
    const floorY = s.frontWheelRadius * 2 - 0.05;
    const seatZ = -wb * 0.6;
    const cwEnd = -wb - s.rearOverhang;

    // bastidor delantero (entre ruedas) y piso de la cabina
    g.add(box(s.frontTrack - s.frontWheelWidth - 0.04, floorY - 0.14, 0.55, M.darkMetal, 0, 0.14 + (floorY - 0.14) / 2, -0.15));
    g.add(box(W - 0.02, 0.06, 0.62, M.black, 0, floorY, -0.22 + -0.05));
    // guardabarros / estribos sobre ruedas delanteras
    for (const sx of [-1, 1]) {
      const fx = sx * (s.frontTrack / 2);
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(s.frontWheelRadius + 0.06, s.frontWheelRadius + 0.06, s.frontWheelWidth + 0.06, 20, 1, true, Math.PI * 0.05, Math.PI * 0.75), P);
      fender.rotation.z = Math.PI / 2;
      fender.rotation.x = -Math.PI * 0.42;
      fender.position.set(fx, s.frontWheelRadius, 0);
      fender.material = P;
      (fender.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(fender);
    }
    // laterales de la carrocería
    g.add(box(W, floorY - 0.2, wb - 0.45, P, 0, 0.2 + (floorY - 0.2) / 2, -0.4 - (wb - 0.45) / 2));
    // cubierta del motor / capó (debajo del asiento)
    const hoodTop = s.seatHeight - 0.12;
    const hood = new THREE.Mesh(new RoundedBoxGeometry(W - 0.06, hoodTop - floorY + 0.05, wb * 0.72, 3, 0.05), P);
    hood.position.set(0, floorY + (hoodTop - floorY) / 2, seatZ - 0.08);
    g.add(hood);
    // contrapeso
    const cwLen = s.rearOverhang + 0.25;
    const cwH = 1.0;
    const cw = new THREE.Mesh(new RoundedBoxGeometry(W, cwH, cwLen, 4, 0.12), s.power === 'electrico' ? M.darkMetal : P);
    cw.position.set(0, 0.2 + cwH / 2, cwEnd + cwLen / 2);
    g.add(cw);
    const cwTop = box(W - 0.12, 0.06, cwLen - 0.1, M.darkMetal, 0, 0.2 + cwH + 0.02, cwEnd + cwLen / 2 + 0.03);
    g.add(cwTop);
    // franja de seguridad en el contrapeso
    const stripe = box(W + 0.005, 0.1, 0.02, M.stripes, 0, 0.32, cwEnd + 0.02);
    g.add(stripe);
    // nombre del modelo
    const nameTex = labelTexture(s.name.split(' ')[0].toUpperCase(), { bg: '#00000000', fg: '#111111', w: 256, h: 64 });
    const name = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, roughness: 0.5 }));
    name.position.set(0, 0.85, cwEnd - 0.005);
    name.rotation.y = Math.PI;
    g.add(name);
    // luces traseras
    this.brakeLightMat = M.glassRed.clone();
    this.reverseLightMat = M.glassWhite.clone();
    for (const sx of [-1, 1]) {
      const l = box(0.1, 0.06, 0.03, this.brakeLightMat, sx * (W / 2 - 0.1), 1.05, cwEnd - 0.01);
      const r = box(0.06, 0.06, 0.03, this.reverseLightMat, sx * (W / 2 - 0.22), 1.05, cwEnd - 0.01);
      g.add(l, r);
    }
    // extras según energía
    if (s.power === 'glp') {
      const tank = cyl(0.17, 0.75, new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.4, metalness: 0.5 }));
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 1.42, cwEnd + 0.3);
      g.add(tank);
      const bracket = box(0.06, 0.2, 0.06, M.darkMetal, 0, 1.28, cwEnd + 0.3);
      g.add(bracket);
    } else if (s.power === 'diesel') {
      const exhaust = rod(new THREE.Vector3(W / 2 - 0.12, 1.1, -wb * 0.95 - 0.02), new THREE.Vector3(W / 2 - 0.12, s.overheadGuardHeight + 0.05, -wb * 0.95 - 0.02), 0.035, M.darkMetal, false);
      g.add(exhaust);
    } else {
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.14),
        new THREE.MeshStandardMaterial({ map: labelTexture('⚡ ELÉCTRICO', { bg: '#1f8a70', fg: '#ffffff', w: 256, h: 64 }), roughness: 0.5 }),
      );
      decal.position.set(W / 2 + 0.002, 0.5, seatZ - 0.1);
      decal.rotation.y = Math.PI / 2;
      g.add(decal);
    }

    // Techo protector
    const gH = s.overheadGuardHeight;
    const gz0 = -wb * 0.95;
    const gz1 = 0.02;
    const px = W / 2 - 0.07;
    for (const sx of [-1, 1]) {
      g.add(rod(new THREE.Vector3(sx * px, floorY + 0.35, -0.02), new THREE.Vector3(sx * px, gH, gz1), 0.035, M.darkMetal));
      g.add(rod(new THREE.Vector3(sx * px, 1.1, gz0 + 0.05), new THREE.Vector3(sx * px, gH, gz0), 0.035, M.darkMetal));
      // espejos
      const mirrorArm = rod(new THREE.Vector3(sx * px, gH - 0.25, gz1 - 0.01), new THREE.Vector3(sx * (px + 0.16), gH - 0.2, gz1 - 0.02), 0.008, M.darkMetal, false);
      const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 18), new THREE.MeshStandardMaterial({ color: 0xc9d6e2, roughness: 0.05, metalness: 0.9 }));
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(sx * (px + 0.19), gH - 0.19, gz1 - 0.02);
      g.add(mirrorArm, mirror);
    }
    // marco del techo y rejilla
    for (const sx of [-1, 1]) g.add(box(0.06, 0.06, gz1 - gz0 + 0.06, M.darkMetal, sx * px, gH, (gz0 + gz1) / 2));
    g.add(box(2 * px + 0.06, 0.06, 0.06, M.darkMetal, 0, gH, gz1));
    g.add(box(2 * px + 0.06, 0.06, 0.06, M.darkMetal, 0, gH, gz0));
    for (let i = 1; i < 7; i++) {
      const z = gz0 + ((gz1 - gz0) * i) / 7;
      g.add(box(2 * px, 0.03, 0.04, M.darkMetal, 0, gH + 0.01, z));
    }
    // baliza (luz giratoria)
    const beaconMat = M.glassOrange.clone();
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.11, 14), beaconMat);
    this.beacon.position.set(-px + 0.12, gH + 0.09, gz0 + 0.08);
    g.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0xff8a00, 0, 6, 2);
    this.beaconLight.position.copy(this.beacon.position).add(new THREE.Vector3(0, 0.1, 0));
    g.add(this.beaconLight);
    // faros de trabajo delanteros
    for (const sx of [-1, 1]) {
      const lensMat = M.glassWhite.clone();
      this.headLensMats.push(lensMat);
      const housing = box(0.12, 0.09, 0.08, M.black, sx * (px - 0.02), gH - 0.12, gz1 + 0.06);
      const lens = box(0.1, 0.07, 0.01, lensMat, sx * (px - 0.02), gH - 0.12, gz1 + 0.105);
      g.add(housing, lens);
      const spot = new THREE.SpotLight(0xfff4dd, 0, 22, 0.55, 0.5, 1.5);
      spot.position.set(sx * (px - 0.02), gH - 0.12, gz1 + 0.12);
      spot.target.position.set(sx * 0.3, 0, 6);
      spot.castShadow = false;
      g.add(spot, spot.target);
      this.headLights.push(spot);
    }
  }

  // ---------------------------------------------------------------- cabina
  private buildCab() {
    const s = this.spec;
    const M = materials();
    const wb = s.wheelbase;
    const g = this.chassis;
    const floorY = s.frontWheelRadius * 2 - 0.05;
    const seatZ = -wb * 0.6;
    const cowlTop = s.seatHeight + 0.04;

    // Asiento
    const seatBase = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.46, 3, 0.04), M.seat);
    seatBase.position.set(0, s.seatHeight - 0.05, seatZ);
    const seatBack = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.52, 0.1, 3, 0.04), M.seat);
    seatBack.position.set(0, s.seatHeight + 0.24, seatZ - 0.25);
    seatBack.rotation.x = -0.18;
    const armrest = box(0.07, 0.06, 0.3, M.seat, -0.29, s.seatHeight + 0.17, seatZ - 0.02);
    g.add(seatBase, seatBack, armrest);
    // Cinturón (visible cuando está abrochado)
    this.beltMesh = box(0.46, 0.05, 0.02, new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.7 }), 0, s.seatHeight + 0.12, seatZ + 0.2);
    this.beltMesh.visible = false;
    g.add(this.beltMesh);
    const buckle = box(0.06, 0.06, 0.06, M.chrome, -0.26, s.seatHeight + 0.06, seatZ + 0.1);
    buckle.name = 'belt';
    g.add(buckle);
    this.registerControl('belt', [buckle, this.beltMesh], buckle, 'Cinturón de seguridad (clic)');

    // Capot delantero / tablero (cowl)
    const cowl = new THREE.Mesh(new RoundedBoxGeometry(s.bodyWidth - 0.16, cowlTop - floorY, 0.32, 3, 0.04), this.paintMat);
    cowl.position.set(0, floorY + (cowlTop - floorY) / 2, -0.12);
    g.add(cowl);
    const dashPanel = box(0.62, 0.05, 0.3, M.black, 0, cowlTop + 0.01, -0.14);
    g.add(dashPanel);

    // Pantalla del tablero
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), new THREE.MeshBasicMaterial({ map: this.dashTexture, toneMapped: false }));
    // pantalla a la izquierda de la columna, visible al costado del volante
    const scrX = 0.2;
    const scrY = cowlTop + 0.13;
    const scrZ = -0.26;
    const screenHousing = box(0.29, 0.16, 0.05, M.black, scrX, scrY, scrZ);
    screenHousing.rotation.order = 'YXZ';
    screenHousing.rotation.set(0.5, 0.25, 0);
    // la pantalla mira hacia el operador (atrás y arriba)
    screen.rotation.order = 'YXZ';
    screen.rotation.set(-0.5, Math.PI + 0.25, 0);
    const nrm = new THREE.Vector3(0, 0, 1).applyEuler(screen.rotation);
    screen.position.set(scrX, scrY, scrZ).addScaledVector(nrm, 0.027);
    const stem = rod(new THREE.Vector3(scrX, cowlTop, scrZ + 0.02), new THREE.Vector3(scrX, scrY - 0.05, scrZ), 0.02, M.black);
    g.add(stem, screenHousing, screen);

    // Columna de dirección y volante
    const colBase = new THREE.Vector3(0, cowlTop - 0.05, -0.2);
    const wheelCenter = new THREE.Vector3(0, s.seatHeight + 0.3, seatZ + 0.5);
    g.add(rod(colBase, wheelCenter, 0.03, M.black, false));
    const sw = this.steeringWheel;
    sw.position.copy(wheelCenter);
    const colDir = wheelCenter.clone().sub(colBase).normalize();
    sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), colDir);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.017, 10, 32), M.black);
    ring.rotation.x = Math.PI / 2;
    sw.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const spoke = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.155, 0, Math.sin(a) * 0.155), 0.012, M.black, false);
      sw.add(spoke);
    }
    const hub = cyl(0.05, 0.05, M.black);
    hub.position.y = 0.01;
    const hornBtn = cyl(0.035, 0.02, new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.4 }));
    hornBtn.position.y = 0.04;
    sw.add(hub, hornBtn);
    // pomo giratorio (spinner)
    const knob = cyl(0.022, 0.07, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 }));
    knob.position.set(0.15, 0.04, -0.03);
    sw.add(knob);
    g.add(sw);
    this.registerControl('horn', [hornBtn], hornBtn, 'Bocina (mantener)');
    this.registerControl('wheel', [ring, knob], sw, 'Volante: arrastrá el pomo para girar');

    // Palanca de marcha (izquierda de la columna)
    const dirPivot = new THREE.Group();
    dirPivot.position.set(0.07, s.seatHeight + 0.18, seatZ + 0.6);
    const dirStick = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.14, 0.02, 0), 0.008, M.chrome, false);
    const dirKnob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    dirKnob.position.set(0.15, 0.02, 0);
    dirPivot.add(dirStick, dirKnob);
    g.add(dirPivot);
    this.levers.direction = dirPivot;
    this.registerControl('direction', [dirKnob, dirStick], dirPivot, 'Palanca de marcha F / N / R (arrastrar arriba/abajo)');

    // Palancas hidráulicas (a la derecha)
    const leverDefs: { id: CabControlId; color: number; label: string; icon: string }[] = [
      { id: 'lift', color: 0x1b1b1b, label: 'Elevación: tirar = subir, empujar = bajar', icon: '⇕' },
      { id: 'tilt', color: 0x1b1b1b, label: 'Inclinación: tirar = atrás, empujar = adelante', icon: '⤸' },
    ];
    if (s.sideShift) leverDefs.push({ id: 'shift', color: 0x1b1b1b, label: 'Desplazador lateral: tirar = izquierda, empujar = derecha', icon: '⇔' });
    if (s.forkPositioner) leverDefs.push({ id: 'spread', color: 0x1b1b1b, label: 'Posicionador: tirar = abrir, empujar = cerrar', icon: '⇹' });
    const valve = box(0.075 * leverDefs.length + 0.04, 0.07, 0.12, M.darkMetal, -0.17 - 0.0375 * (leverDefs.length - 1), cowlTop + 0.03, -0.24);
    g.add(valve);
    leverDefs.forEach((d, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(-0.17 - i * 0.075, cowlTop + 0.06, -0.26);
      const stick = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.24, -0.08), 0.009, M.chrome, false);
      const knobMat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.35 });
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), knobMat);
      kn.position.set(0, 0.27, -0.09);
      kn.rotation.x = -0.3;
      pivot.add(stick, kn);
      // calcomanía con el símbolo de la función, sobre el capot delante de la palanca
      const icon = new THREE.Mesh(
        new THREE.PlaneGeometry(0.055, 0.055),
        new THREE.MeshBasicMaterial({ map: labelTexture(d.icon, { bg: '#ffd400', fg: '#000000', w: 64, h: 64, font: 'bold 46px sans-serif' }), toneMapped: false }),
      );
      icon.position.set(-0.17 - i * 0.075, cowlTop + 0.03, -0.31);
      icon.rotation.order = 'YXZ';
      icon.rotation.set(-1.15, Math.PI, 0);
      g.add(icon);
      g.add(pivot);
      this.levers[d.id] = pivot;
      this.registerControl(d.id, [kn, stick], pivot, d.label);
    });

    // Llave de contacto
    const keyPivot = new THREE.Group();
    keyPivot.position.set(-0.3, cowlTop - 0.06, -0.3);
    keyPivot.rotation.x = -Math.PI / 2 + 0.4;
    const keyBarrel = cyl(0.025, 0.03, M.chrome);
    const keyHead = box(0.05, 0.012, 0.025, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }), 0, 0.03, 0);
    keyPivot.add(keyBarrel, keyHead);
    g.add(keyPivot);
    this.levers.key = keyPivot;
    this.registerControl('key', [keyBarrel, keyHead], keyPivot, 'Llave de contacto: clic para arrancar / apagar');

    // Interruptor de luces
    const lightSw = box(0.04, 0.025, 0.02, new THREE.MeshStandardMaterial({ color: 0x3355aa, roughness: 0.4 }), 0.22, cowlTop + 0.045, -0.3);
    g.add(lightSw);
    this.levers.lights = lightSw;
    this.registerControl('lights', [lightSw], lightSw, 'Luces de trabajo (clic)');

    // Freno de mano (izquierda)
    const pbPivot = new THREE.Group();
    pbPivot.position.set(0.3, floorY + 0.25, -0.3);
    const pbStick = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.32, -0.1), 0.012, M.darkMetal, false);
    const pbGrip = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.08, 6, 10), new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 }));
    pbGrip.position.set(0, 0.35, -0.11);
    pbGrip.rotation.x = -0.3;
    pbPivot.add(pbStick, pbGrip);
    g.add(pbPivot);
    this.levers.parking = pbPivot;
    this.registerControl('parking', [pbGrip, pbStick], pbPivot, 'Freno de mano (clic)');

    // Pedales
    const mkPedal = (x: number, w: number) => {
      const pv = new THREE.Group();
      pv.position.set(x, floorY + 0.04, -0.26);
      const pad = box(w, 0.012, 0.13, M.black, 0, 0.06, -0.05);
      pad.rotation.x = 0.5;
      pv.add(pad);
      g.add(pv);
      return pv;
    };
    this.pedals.acc = mkPedal(-0.17, 0.07);
    this.pedals.brake = mkPedal(0.0, 0.11);
    if (s.power !== 'electrico') this.pedals.inch = mkPedal(0.14, 0.08);

    // Placa de capacidad (calcomanía)
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.1),
      new THREE.MeshStandardMaterial({ map: labelTexture(`${s.capacityKg} kg\n@ ${s.loadCenter * 1000} mm`, { bg: '#e8e8e8', fg: '#111', w: 160, h: 100, font: 'bold 30px sans-serif', border: '#333' }), roughness: 0.6 }),
    );
    plate.position.set(0.18, cowlTop + 0.065, -0.29);
    plate.rotation.order = 'YXZ';
    plate.rotation.set(-0.5, Math.PI, 0);
    g.add(plate);
  }

  private registerControl(id: CabControlId, targets: THREE.Object3D[], pivot: THREE.Object3D, label: string) {
    for (const t of targets) t.userData.cabControl = id;
    this.controls.push({ id, targets, pivot, label });
  }

  // ---------------------------------------------------------------- ruedas
  private makeWheel(radius: number, width: number, rimColor: number): THREE.Group {
    const M = materials();
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 28), M.rubber);
    tire.rotation.z = Math.PI / 2;
    // dibujo de la banda: tacos
    const treadGroup = new THREE.Group();
    const lugGeo = new THREE.BoxGeometry(width * 0.95, 0.025, 0.05);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const lug = new THREE.Mesh(lugGeo, M.rubber);
      lug.position.set(0, Math.cos(a) * (radius + 0.005), Math.sin(a) * (radius + 0.005));
      lug.rotation.x = a;
      treadGroup.add(lug);
    }
    const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.45, metalness: 0.3 });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.01, 18), rimMat);
    rim.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, width + 0.03, 10), M.darkMetal);
    hub.rotation.z = Math.PI / 2;
    // marcas para ver la rotación
    const mark = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, radius * 0.9, radius * 0.08), M.darkMetal);
    w.add(tire, treadGroup, rim, hub, mark);
    return w;
  }

  private buildWheels() {
    const s = this.spec;
    for (const sx of [1, -1]) {
      const w = this.makeWheel(s.frontWheelRadius, s.frontWheelWidth, 0xe9e9e2);
      w.position.set((sx * s.frontTrack) / 2, s.frontWheelRadius, 0);
      this.chassis.add(w);
      this.frontWheels.push(w);
    }
    // eje trasero pivotante
    this.rearAxle.position.set(0, s.rearWheelRadius, -s.wheelbase);
    const beam = box(s.rearTrack - 0.2, 0.1, 0.12, materials().darkMetal);
    this.rearAxle.add(beam);
    for (const sx of [1, -1]) {
      const knuckle = new THREE.Group();
      knuckle.position.set((sx * s.rearTrack) / 2, 0, 0);
      const w = this.makeWheel(s.rearWheelRadius, s.rearWheelWidth, 0xe9e9e2);
      knuckle.add(w);
      this.rearAxle.add(knuckle);
      this.rearKnuckles.push(knuckle);
      this.rearWheels.push(w);
    }
    this.chassis.add(this.rearAxle);
  }

  // ---------------------------------------------------------------- mástil
  private buildMast() {
    const s = this.spec;
    const geo = this.geo;
    const M = materials();
    const g = this.mast;
    const y0 = 0.1 - geo.pivot.y;
    const z = geo.mastZ - geo.pivot.z;
    const H = geo.outerMastHeight;
    const chW = 0.07;
    for (const sx of [-1, 1]) {
      // canal exterior en "C"
      const web = box(0.025, H, geo.mastDepth, M.mastMetal, sx * (geo.outerChannelX + 0.022), y0 + H / 2, z);
      const flangeF = box(chW, H, 0.022, M.mastMetal, sx * geo.outerChannelX, y0 + H / 2, z + geo.mastDepth / 2 - 0.011);
      const flangeB = box(chW, H, 0.022, M.mastMetal, sx * geo.outerChannelX, y0 + H / 2, z - geo.mastDepth / 2 + 0.011);
      g.add(web, flangeF, flangeB);
    }
    g.add(box(geo.outerChannelX * 2 + 0.1, 0.07, 0.06, M.mastMetal, 0, y0 + H - 0.035, z - 0.05));
    g.add(box(geo.outerChannelX * 2 + 0.1, 0.09, 0.06, M.mastMetal, 0, y0 + 0.5, z - 0.05));
    // soportes del pivote
    for (const sx of [-1, 1]) g.add(box(0.06, 0.16, 0.16, M.darkMetal, sx * geo.outerChannelX, 0, 0));
    // cilindros de elevación detrás de los canales exteriores (mástil de visibilidad libre)
    const barrelH = H * 0.9;
    this.liftRods = [];
    for (const sx of [-1, 1]) {
      const barrel = cyl(0.045, barrelH, M.darkMetal);
      barrel.position.set(sx * (geo.outerChannelX - 0.02), y0 + 0.05 + barrelH / 2, z - 0.11);
      g.add(barrel);
      const rodM = cyl(0.026, barrelH, M.chrome);
      rodM.position.set(sx * (geo.outerChannelX - 0.02), y0 + 0.05 + barrelH / 2 + 0.05, z - 0.11);
      g.add(rodM);
      this.liftRods.push(rodM);
    }

    // mástil intermedio (triplex)
    if (s.mastType === 'triplex') {
      for (const sx of [-1, 1]) {
        this.intermediateMast.add(box(0.05, H - 0.02, geo.mastDepth - 0.02, M.mastMetal, sx * (geo.innerChannelX + 0.04), y0 + 0.02 + (H - 0.02) / 2, z));
      }
      this.intermediateMast.add(box(geo.innerChannelX * 2 + 0.12, 0.06, 0.05, M.mastMetal, 0, y0 + H - 0.03, z - 0.04));
      g.add(this.intermediateMast);
    }
    // mástil interior
    const innerH = H - 0.02;
    for (const sx of [-1, 1]) {
      this.innerMast.add(box(0.05, innerH, geo.mastDepth - 0.03, M.mastMetal, sx * geo.innerChannelX, y0 + 0.03 + innerH / 2, z + 0.01));
    }
    this.innerMast.add(box(geo.innerChannelX * 2 + 0.05, 0.07, geo.mastDepth - 0.03, M.mastMetal, 0, y0 + 0.03 + innerH - 0.035, z + 0.01));
    // poleas de cadena
    for (const sx of [-1, 1]) {
      const sheave = cyl(0.06, 0.04, M.darkMetal);
      sheave.rotation.z = Math.PI / 2;
      sheave.position.set(sx * (geo.innerChannelX - 0.07), y0 + innerH + 0.04, z + 0.01);
      this.innerMast.add(sheave);
    }
    g.add(this.innerMast);
    // cadenas (se actualizan cada cuadro)
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.7 });
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1, 0.012), chainMat);
      c.castShadow = true;
      g.add(c);
      this.chains.push(c);
    }
    // cilindros de inclinación (entre chasis y mástil)
    for (const sx of [-1, 1]) {
      const barrelT = cyl(0.04, 0.4, M.darkMetal);
      const rodT = cyl(0.022, 0.4, M.chrome);
      this.root.add(barrelT, rodT);
      this.tiltCyl.push({
        barrel: barrelT,
        rod: rodT,
        a: new THREE.Vector3(sx * (geo.outerChannelX - 0.06), s.frontWheelRadius * 2 + 0.05, -0.35),
        b: new THREE.Vector3(sx * (geo.outerChannelX - 0.06), 1.05 - geo.pivot.y, z - 0.06),
      });
    }
  }

  // ---------------------------------------------------------------- carro
  private buildCarriage() {
    const s = this.spec;
    const geo = this.geo;
    const M = materials();
    const g = this.carriage;
    const T = s.forkThickness;
    const cw = geo.carriageWidth;
    // placas superior e inferior del carro
    g.add(box(cw, 0.1, 0.045, M.darkMetal, 0, -T + 0.37, -T - 0.05));
    g.add(box(cw, 0.08, 0.045, M.darkMetal, 0, -T + 0.04, -T - 0.05));
    for (const sx of [-1, 1]) g.add(box(0.05, geo.carriageHeight, 0.06, M.darkMetal, sx * (cw / 2 - 0.025), -T + geo.carriageHeight / 2, -T - 0.07));
    // respaldo de carga (rejilla)
    const bh = s.backrestHeight - geo.carriageHeight;
    const by0 = -T + geo.carriageHeight;
    g.add(box(cw, 0.04, 0.035, M.darkMetal, 0, by0 + bh, -T - 0.05));
    for (let i = 0; i <= 6; i++) {
      const x = -cw / 2 + 0.02 + ((cw - 0.04) * i) / 6;
      g.add(box(0.025, bh, 0.025, M.darkMetal, x, by0 + bh / 2, -T - 0.05));
    }
    g.add(box(cw, 0.03, 0.03, M.darkMetal, 0, by0 + bh * 0.5, -T - 0.05));
    // rodillos laterales
    for (const sx of [-1, 1]) {
      const roller = cyl(0.04, 0.04, M.chrome);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(sx * (geo.innerChannelX - 0.04), -T + 0.3, -T - 0.12);
      g.add(roller);
    }
  }

  private buildForks() {
    const s = this.spec;
    const M = materials();
    const T = s.forkThickness;
    const L = s.forkLength;
    const w = s.forkWidth;
    const forkMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.5 });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.3, metalness: 0.8 });
    // barra del desplazador
    this.forks.add(box(this.geo.carriageWidth - 0.04, 0.1, 0.04, M.darkMetal, 0, 0.12, -T - 0.005));
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Group();
      // hoja con punta afinada
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(L - 0.22, 0);
      shape.lineTo(L, -T + T * 0.3);
      shape.lineTo(L, -T);
      shape.lineTo(0, -T);
      shape.closePath();
      const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      bladeGeo.translate(0, 0, -w / 2);
      bladeGeo.rotateY(-Math.PI / 2);
      const blade = new THREE.Mesh(bladeGeo, forkMat);
      f.add(blade);
      const tip = box(w * 0.9, 0.006, 0.18, tipMat, 0, -T * 0.55, L - 0.11);
      tip.rotation.x = -0.1;
      // caña vertical
      const shank = box(w, 0.48, T, forkMat, 0, -T + 0.24, -T / 2);
      const hook = box(w, 0.05, 0.05, forkMat, 0, 0.18, -T - 0.025);
      f.add(tip, shank, hook);
      this.forks.add(f);
      this.forkMeshes.push(f);
    }
    this.setSpread(s.forkSpreadDefault);
  }

  setSpread(spread: number) {
    this.forkMeshes.forEach((f, i) => (f.position.x = ((i === 0 ? -1 : 1) * spread) / 2));
  }

  // ---------------------------------------------------------------- animación
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();

  /** Actualiza las partes móviles a partir del estado físico. */
  updateParts(t: ForkliftTelemetry, c: ForkliftControls, wheels: WheelState[], spread: number, time: number, liftPosMastLocal: number) {
    const s = this.spec;
    const geo = this.geo;
    // ruedas
    for (let i = 0; i < 2; i++) this.frontWheels[i].rotation.x = wheels[i].spin;
    this.rearAxle.rotation.z = (t.rearAxleDeg * Math.PI) / 180;
    for (let i = 0; i < 2; i++) {
      this.rearKnuckles[i].rotation.y = wheels[i + 2].steer;
      this.rearWheels[i].rotation.x = wheels[i + 2].spin;
    }
    // volante
    const turns = c.handwheel * (s.steeringTurns / 2) * Math.PI * 2;
    const base = this.steeringWheelBaseQuat ?? (this.steeringWheelBaseQuat = this.steeringWheel.quaternion.clone());
    this.steeringWheel.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turns));
    // palancas
    const lv = (id: CabControlId, v: number, max = 0.35) => {
      const p = this.levers[id];
      if (p) p.rotation.x = v * max;
    };
    lv('lift', -c.lift);
    lv('tilt', -c.tilt);
    lv('shift', -c.sideShift);
    lv('spread', -c.spread);
    const d = this.levers.direction;
    if (d) d.rotation.z = c.direction * 0.35;
    const key = this.levers.key;
    if (key) key.rotation.y = c.ignition ? -0.9 : 0;
    const pb = this.levers.parking;
    if (pb) pb.rotation.x = c.parkingBrake ? 0.0 : 0.6;
    const ls = this.levers.lights;
    if (ls) (ls as THREE.Mesh).scale.y = c.lights ? 0.6 : 1;
    this.beltMesh.visible = c.seatbelt;
    if (this.pedals.acc) this.pedals.acc.rotation.x = c.throttle * 0.35;
    if (this.pedals.brake) this.pedals.brake.rotation.x = c.brake * 0.35;
    if (this.pedals.inch) this.pedals.inch.rotation.x = c.inching * 0.35;

    // mástil interior / intermedio / cilindro / cadenas
    this.innerMast.position.y = t.innerMastRise;
    this.intermediateMast.position.y = t.intermediateRise;
    for (const r of this.liftRods) r.position.y = 0.1 - geo.pivot.y + 0.05 + (geo.outerMastHeight * 0.9) / 2 + 0.05 + (s.mastType === 'triplex' ? t.intermediateRise : t.innerMastRise);
    const sheaveY = 0.1 - geo.pivot.y + 0.03 + (geo.outerMastHeight - 0.02) + 0.04 + t.innerMastRise;
    const carTopY = geo.forkTop0 - geo.pivot.y + liftPosMastLocal + 0.33;
    const z = geo.forkFace - geo.pivot.z - s.forkThickness - 0.08;
    for (let i = 0; i < 2; i++) {
      const ch = this.chains[i];
      const len = Math.max(0.05, sheaveY - carTopY);
      ch.scale.y = len;
      ch.position.set((i === 0 ? -1 : 1) * (geo.innerChannelX - 0.07), carTopY + len / 2, z);
    }
    this.setSpread(spread);

    // luces
    const lightsOn = c.lights;
    for (const l of this.headLights) l.intensity = lightsOn ? 40 : 0;
    for (const m of this.headLensMats) m.emissive.setHex(lightsOn ? 0xfff2cc : 0x222222);
    const braking = c.brake > 0.1 || c.inching > 0.6;
    this.brakeLightMat.emissive.setHex(braking ? 0xff2200 : 0x330000);
    this.reverseLightMat.emissive.setHex(c.direction < 0 && t.engineRunning ? 0xffffff : 0x222222);
    const beaconOn = c.beacon && (t.engineRunning || c.ignition);
    const phase = (time * 4) % 1;
    const flash = beaconOn ? (phase < 0.5 ? 1 : 0.15) : 0;
    (this.beacon.material as THREE.MeshStandardMaterial).emissive.setRGB(flash, flash * 0.5, 0);
    this.beaconLight.intensity = flash * 3;
    if (this.blueSpot) this.blueSpot.intensity = t.engineRunning ? 30 : 0;
    if (this.blueSpotMarker) this.blueSpotMarker.visible = t.engineRunning;
  }
  private steeringWheelBaseQuat: THREE.Quaternion | null = null;

  /** Actualiza los cilindros de inclinación que unen chasis y mástil (en coordenadas de mundo). */
  updateTiltCylinders() {
    this.chassis.updateMatrixWorld();
    this.mast.updateMatrixWorld();
    for (const tc of this.tiltCyl) {
      const a = this._v.copy(tc.a).applyMatrix4(this.chassis.matrixWorld);
      const b = this._v2.copy(tc.b).applyMatrix4(this.mast.matrixWorld);
      const len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const bl = Math.min(0.45, len * 0.6);
      tc.barrel.scale.y = bl / 0.4;
      tc.barrel.position.copy(a).addScaledVector(dir, bl / 2);
      tc.barrel.quaternion.copy(q);
      const rl = len - bl + 0.05;
      tc.rod.scale.y = rl / 0.4;
      tc.rod.position.copy(b).addScaledVector(dir, -rl / 2);
      tc.rod.quaternion.copy(q);
    }
  }

  /** Luz azul de seguridad proyectada detrás (accesorio). */
  setBlueSpot(on: boolean) {
    if (on && !this.blueSpot) {
      const s = this.spec;
      const spot = new THREE.SpotLight(0x2a7bff, 0, 14, 0.25, 0.6, 1);
      spot.position.set(0, s.overheadGuardHeight, -s.wheelbase * 0.95);
      spot.target.position.set(0, 0, -s.wheelbase - 4.5);
      this.chassis.add(spot, spot.target);
      this.blueSpot = spot;
      const marker = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshBasicMaterial({ color: 0x3a8bff, transparent: true, opacity: 0.55, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(0, 0.02, -s.wheelbase - 4.0);
      this.chassis.add(marker);
      this.blueSpotMarker = marker;
    } else if (!on && this.blueSpot) {
      this.chassis.remove(this.blueSpot, this.blueSpot.target);
      if (this.blueSpotMarker) this.chassis.remove(this.blueSpotMarker);
      this.blueSpot = null;
      this.blueSpotMarker = null;
    }
  }

  /** Resalta un mando de cabina bajo el cursor. */
  setHighlight(id: CabControlId | null) {
    if (this.highlight) {
      this.highlight.parent?.remove(this.highlight);
      this.highlight = null;
    }
    if (!id) return;
    const ctl = this.controls.find((c) => c.id === id);
    if (!ctl) return;
    const target = ctl.targets[0] as THREE.Mesh;
    if (!target.geometry) return;
    const h = new THREE.Mesh(target.geometry, materials().highlight);
    h.scale.setScalar(1.25);
    h.renderOrder = 999;
    target.add(h);
    this.highlight = h;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.dashTexture.dispose();
  }
}
