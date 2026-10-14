import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, addStaticBox, GROUPS } from '../sim/physics.ts';
import { materials } from '../render/materials.ts';
import { labelTexture, LabelAtlas } from '../render/textures.ts';
import type { World, Slot, Zone, TruckInfo } from './World.ts';

const UP = new THREE.Vector3(0, 1, 0);

/** Materiales compartidos: las mallas con el mismo material se pueden fusionar en una sola llamada de dibujo. */
const matCache = new Map<string, THREE.Material>();
function sharedMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

/** Transforma un punto local (x, z) con yaw y origen. */
function local(origin: THREE.Vector3, yaw: number, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyAxisAngle(UP, yaw).add(origin);
}

function quatYaw(yaw: number) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

/** Caja estática visual + colisionador. */
export function staticBox(
  world: World,
  center: THREE.Vector3,
  size: THREE.Vector3,
  yaw: number,
  mat: THREE.Material | null,
  what: 'floor' | 'wall' | 'rack' | 'truck' | 'ramp' | 'dock' | 'other' = 'other',
  opts: { friction?: number; occluder?: boolean; noCollider?: boolean; castShadow?: boolean; id?: number } = {},
): THREE.Mesh | null {
  if (!opts.noCollider) {
    addStaticBox(world.pw, center.x, center.y, center.z, size.x / 2, size.y / 2, size.z / 2, { rotY: yaw, friction: opts.friction, tag: { kind: 'static', what, id: opts.id } });
  }
  if (!mat) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  m.position.copy(center);
  m.rotation.y = yaw;
  m.castShadow = opts.castShadow ?? true;
  m.receiveShadow = true;
  world.staticGroup.add(m);
  if (opts.occluder) {
    m.userData.occluder = true;
    world.occluders.push(m);
  }
  return m;
}

// ------------------------------------------------------------------ suelo
export function ground(world: World, opts: { size: number; inside?: { x0: number; z0: number; x1: number; z1: number } }) {
  const M = materials();
  const s = opts.size;
  addStaticBox(world.pw, 0, -0.5, 0, s / 2, 0.5, s / 2, { friction: 0.9, tag: { kind: 'static', what: 'floor' } });
  const asphalt = M.asphalt.clone();
  asphalt.map = M.asphalt.map!.clone();
  asphalt.map.repeat.set(s / 6, s / 6);
  asphalt.map.needsUpdate = true;
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(s, s), asphalt);
  yard.rotation.x = -Math.PI / 2;
  yard.position.y = -0.004;
  yard.receiveShadow = true;
  world.staticGroup.add(yard);
  if (opts.inside) {
    const { x0, z0, x1, z1 } = opts.inside;
    const conc = M.concrete.clone();
    conc.map = M.concrete.map!.clone();
    conc.map.repeat.set((x1 - x0) / 6, (z1 - z0) / 6);
    conc.map.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), conc);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2);
    floor.receiveShadow = true;
    world.staticGroup.add(floor);
  }
  // pasto lejano
  const grass = new THREE.Mesh(new THREE.RingGeometry(s * 0.5, s * 2.5, 32), M.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.01;
  world.staticGroup.add(grass);
}

// ------------------------------------------------------------------ pintura en el piso
export function paintLine(world: World, x1: number, z1: number, x2: number, z2: number, width: number, color: number, y = 0.006) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const mat = sharedMat(`paint:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.PI / 2, Math.atan2(x2 - x1, z2 - z1), 0);
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.receiveShadow = true;
  world.staticGroup.add(m);
  return m;
}

export function paintText(world: World, text: string, x: number, z: number, yaw: number, w: number, h: number, color = '#f2c200') {
  const tex = labelTexture(text, { bg: '#00000000', fg: color, w: 512, h: Math.round((512 * h) / w), font: `bold ${Math.round(((512 * h) / w) * 0.7)}px sans-serif` });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
  m.rotation.order = 'YXZ';
  m.rotation.set(-Math.PI / 2, yaw, 0);
  m.position.set(x, 0.008, z);
  world.staticGroup.add(m);
  return m;
}

/** Zona rectangular marcada en el piso. */
export function zone(world: World, z: Omit<Zone, 'mesh'>, opts: { dashed?: boolean; fill?: boolean; text?: boolean } = {}): Zone {
  const grp = new THREE.Group();
  const w = z.width;
  const d = z.depth;
  const lw = 0.1;
  const mat = sharedMat(`zone:${z.color}`, () => new THREE.MeshStandardMaterial({ color: z.color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  const edges: [number, number, number, number][] = [
    [-w / 2, -d / 2, w / 2, -d / 2],
    [w / 2, -d / 2, w / 2, d / 2],
    [w / 2, d / 2, -w / 2, d / 2],
    [-w / 2, d / 2, -w / 2, -d / 2],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const segs = opts.dashed ? Math.floor(len / 0.6) : 1;
    for (let i = 0; i < segs; i++) {
      if (opts.dashed && i % 2) continue;
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const sl = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(bx - ax) > 0.001 ? sl : lw, Math.abs(bx - ax) > 0.001 ? lw : sl), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.007, (z0 + z1) / 2);
      grp.add(m);
    }
  }
  if (opts.fill) {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sharedMat(`zonefill:${z.color}`, () => new THREE.MeshStandardMaterial({ color: z.color, transparent: true, opacity: 0.16, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.005;
    grp.add(fill);
  }
  if (opts.text !== false && z.label) {
    const hex = '#' + new THREE.Color(z.color).getHexString();
    const tw = Math.min(w * 0.9, z.label.length * 0.5);
    const tex = labelTexture(z.label, { bg: '#00000000', fg: hex, w: 512, h: 96, font: 'bold 64px sans-serif' });
    const t = new THREE.Mesh(new THREE.PlaneGeometry(tw, (tw * 96) / 512), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    // legible para quien llega desde el lado −Z local
    t.rotation.order = 'YXZ';
    t.rotation.set(-Math.PI / 2, Math.PI, 0);
    t.position.set(0, 0.009, -d / 2 + (tw * 96) / 512 / 2 + 0.15);
    grp.add(t);
  }
  grp.position.copy(z.center);
  grp.rotation.y = z.yaw;
  world.staticGroup.add(grp);
  const full: Zone = { ...z, mesh: grp };
  world.zones.push(full);
  return full;
}

// ------------------------------------------------------------------ galpón
export interface Opening {
  wall: 'n' | 's' | 'e' | 'w';
  /** Centro de la abertura a lo largo de la pared (coordenada x para n/s, z para e/w). */
  at: number;
  width: number;
  height: number;
}

export function building(world: World, x0: number, z0: number, x1: number, z1: number, height: number, openings: Opening[]) {
  const M = materials();
  const t = 0.3;
  const wallH = height;
  const wall = (wallId: Opening['wall'], a0: number, a1: number, fixed: number) => {
    // segmentos con aberturas
    const ops = openings.filter((o) => o.wall === wallId).sort((a, b) => a.at - b.at);
    let cursor = a0;
    const pieces: [number, number, number, number][] = []; // a, b, y0, y1
    for (const o of ops) {
      const oa = o.at - o.width / 2;
      const ob = o.at + o.width / 2;
      if (oa > cursor) pieces.push([cursor, oa, 0, wallH]);
      pieces.push([oa, ob, o.height, wallH]); // dintel
      cursor = ob;
    }
    if (cursor < a1) pieces.push([cursor, a1, 0, wallH]);
    for (const [a, b, y0, y1] of pieces) {
      const len = b - a;
      const mid = (a + b) / 2;
      const isNS = wallId === 'n' || wallId === 's';
      const center = isNS ? new THREE.Vector3(mid, (y0 + y1) / 2, fixed) : new THREE.Vector3(fixed, (y0 + y1) / 2, mid);
      const size = isNS ? new THREE.Vector3(len, y1 - y0, t) : new THREE.Vector3(t, y1 - y0, len);
      const m = staticBox(world, center, size, 0, M.wall, 'wall', { occluder: true });
      if (m && y0 === 0) {
        // zócalo oscuro
        const lower = new THREE.Mesh(new THREE.BoxGeometry(isNS ? len : t + 0.02, 1.2, isNS ? t + 0.02 : len), M.wallLower);
        lower.position.set(center.x, 0.6, center.z);
        world.staticGroup.add(lower);
      }
      if (y0 > 0) {
        // franja de advertencia en el dintel
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(isNS ? len : t + 0.03, 0.25, isNS ? t + 0.03 : len), M.stripes);
        stripe.position.set(center.x, y0 + 0.125, center.z);
        world.staticGroup.add(stripe);
      }
    }
  };
  wall('n', x0, x1, z1);
  wall('s', x0, x1, z0);
  wall('w', z0, z1, x0);
  wall('e', z0, z1, x1);

  // techo (visible sólo desde abajo) y cabriadas
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.roof);
  roof.rotation.x = Math.PI / 2;
  roof.position.set((x0 + x1) / 2, height + 0.6, (z0 + z1) / 2);
  roof.layers.set(1);
  world.staticGroup.add(roof);
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x6d747a, roughness: 0.6, metalness: 0.5 });
  const trussGeos: THREE.BufferGeometry[] = [];
  for (let x = x0 + 6; x < x1 - 1; x += 6) {
    const g = new THREE.BoxGeometry(0.2, 0.5, z1 - z0);
    g.translate(x, height + 0.3, (z0 + z1) / 2);
    trussGeos.push(g);
  }
  if (trussGeos.length) {
    const trusses = new THREE.Mesh(mergeGeometries(trussGeos)!, trussMat);
    trusses.layers.set(1);
    world.staticGroup.add(trusses);
  }
  // lámparas colgantes
  const lampGeo = new THREE.BoxGeometry(1.4, 0.08, 0.3);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.2 });
  const lamps: THREE.BufferGeometry[] = [];
  for (let x = x0 + 4; x < x1 - 2; x += 8) {
    for (let z = z0 + 4; z < z1 - 2; z += 8) {
      const g = lampGeo.clone();
      g.translate(x, height - 0.2, z);
      lamps.push(g);
    }
  }
  if (lamps.length) {
    const lampMesh = new THREE.Mesh(mergeGeometries(lamps)!, lampMat);
    lampMesh.layers.set(1);
    world.staticGroup.add(lampMesh);
  }
}

/** Columna de estructura con protector. */
export function column(world: World, x: number, z: number, height: number) {
  const M = materials();
  staticBox(world, new THREE.Vector3(x, height / 2, z), new THREE.Vector3(0.35, height, 0.35), 0, sharedMat('column', () => new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6, metalness: 0.4 })), 'wall', { occluder: true });
  staticBox(world, new THREE.Vector3(x, 0.5, z), new THREE.Vector3(0.6, 1.0, 0.6), 0, M.stripes, 'wall');
}

// ------------------------------------------------------------------ racks
export interface RackOptions {
  id: number;
  name: string;
  origin: THREE.Vector3;
  yaw: number;
  bays: number;
  levels: number[];
  bayWidth?: number;
  depth?: number;
  slotsPerBay?: number;
  color?: 'orange' | 'blue';
}

/**
 * Estantería selectiva. El frente (lado de entrada) mira hacia +Z local.
 * origin = esquina frontal izquierda a nivel del piso.
 */
export function rack(world: World, o: RackOptions): Slot[] {
  const M = materials();
  const bayW = o.bayWidth ?? 2.55;
  const depth = o.depth ?? 1.05;
  const perBay = o.slotsPerBay ?? 2;
  const upW = 0.09;
  const topLevel = Math.max(...o.levels);
  const upH = topLevel + 1.0;
  const uprights: THREE.BufferGeometry[] = [];
  const beams: THREE.BufferGeometry[] = [];
  const guards: THREE.BufferGeometry[] = [];
  const braces: THREE.BufferGeometry[] = [];
  const pitch = bayW + upW;
  const slots: Slot[] = [];
  const atlas = new LabelAtlas(4, Math.ceil((o.bays * perBay * o.levels.length) / 4) + 1);
  const addGeo = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, rotX = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotX) g.rotateX(rotX);
    g.translate(x, y, z);
    arr.push(g);
  };
  for (let i = 0; i <= o.bays; i++) {
    const x = i * pitch + upW / 2;
    for (const z of [depth / 2, -depth / 2]) {
      addGeo(uprights, upW, upH, 0.075, x, upH / 2, z);
      const c = local(o.origin, o.yaw, x, upH / 2, z - depth / 2);
      addStaticBox(world.pw, c.x, c.y, c.z, upW / 2, upH / 2, 0.0375, { rotY: o.yaw, tag: { kind: 'static', what: 'rack', id: o.id } });
    }
    // arriostramiento del bastidor (en zigzag)
    let alt = 1;
    for (let y = 0.3; y < upH - 0.6; y += 0.9) {
      const len = Math.hypot(0.9, depth);
      addGeo(braces, 0.03, len, 0.03, x, y + 0.45, 0, alt * Math.atan2(depth, 0.9));
      alt = -alt;
    }
    for (let y = 0.15; y < upH; y += 1.8) addGeo(braces, 0.03, 0.03, depth, x, y, 0);
    // protector de columna (lado del pasillo)
    addGeo(guards, 0.22, 0.4, 0.16, x, 0.2, depth / 2 + 0.13);
    const gc = local(o.origin, o.yaw, x, 0.2, depth / 2 + 0.13 - depth / 2);
    addStaticBox(world.pw, gc.x, gc.y, gc.z, 0.11, 0.2, 0.08, { rotY: o.yaw, tag: { kind: 'static', what: 'rack', id: o.id } });
  }
  for (let b = 0; b < o.bays; b++) {
    const xc = b * pitch + upW + bayW / 2;
    o.levels.forEach((h, li) => {
      if (h > 0.01) {
        for (const z of [depth / 2, -depth / 2]) {
          addGeo(beams, bayW, 0.11, 0.05, xc, h - 0.055, z);
          const c = local(o.origin, o.yaw, xc, h - 0.055, z - depth / 2);
          addStaticBox(world.pw, c.x, c.y, c.z, bayW / 2, 0.055, 0.025, { rotY: o.yaw, tag: { kind: 'static', what: 'rack', id: o.id } });
        }
      }
      const next = o.levels[li + 1];
      const clearance = next !== undefined ? next - h - 0.11 - 0.06 : 1.7;
      for (let k = 0; k < perBay; k++) {
        const sx = b * pitch + upW + (bayW / perBay) * (k + 0.5);
        const center = local(o.origin, o.yaw, sx, h > 0.01 ? h + 0.002 : 0, -depth / 2 + 0);
        const id = `${o.name}-${String(b * perBay + k + 1).padStart(2, '0')}-${li + 1}`;
        slots.push({ id, label: id, center, yaw: o.yaw, level: li, rackId: o.id, halfWidth: bayW / perBay / 2, clearance });
      }
      // etiquetas de ubicación en la viga frontal (todas en un atlas por estantería)
      if (h > 0.01 || li === 0) {
        for (let k = 0; k < perBay; k++) {
          if (atlas.full) break;
          const sx = b * pitch + upW + (bayW / perBay) * (k + 0.5);
          const lbl = `${o.name}-${String(b * perBay + k + 1).padStart(2, '0')}-${li + 1}`;
          const pl = atlas.plane(lbl, 0.4, 0.1, { bg: '#ffffff', fg: '#111111', border: '#1f4f9a' });
          const y = h > 0.01 ? h - 0.055 : 0.32;
          const zf = h > 0.01 ? depth / 2 + 0.027 : depth / 2 + 0.215;
          pl.position.copy(local(o.origin, o.yaw, sx, y, zf - depth / 2));
          pl.rotation.y = o.yaw;
          pl.castShadow = false;
          world.staticGroup.add(pl);
        }
      }
    });
  }
  const grp = new THREE.Group();
  const upMat = o.color === 'orange' ? M.rackOrange : M.rackBlue;
  const beamMat = o.color === 'orange' ? M.rackBlue : M.rackOrange;
  const mk = (arr: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!arr.length) return;
    const m = new THREE.Mesh(mergeGeometries(arr)!, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
  };
  mk(uprights, upMat);
  mk(beams, beamMat);
  mk(guards, M.stripes);
  mk(braces, upMat);
  grp.position.copy(o.origin);
  grp.rotation.y = o.yaw;
  // el frente del grupo está en z = +depth/2 local; desplazamos para que origin sea la esquina frontal
  grp.position.add(new THREE.Vector3(0, 0, -depth / 2).applyAxisAngle(UP, o.yaw));
  world.staticGroup.add(grp);
  world.slots.push(...slots);
  return slots;
}

// ------------------------------------------------------------------ camión playo
export function flatbedTruck(world: World, id: number, center: THREE.Vector3, yaw: number, opts: { color?: 'blue' | 'red' | 'white'; label?: string; bedLength?: number } = {}): TruckInfo {
  const M = materials();
  const grp = new THREE.Group();
  const L = opts.bedLength ?? 12;
  const W = 2.5;
  const bedH = 1.3;
  const colliders: RAPIER.Collider[] = [];
  const addCol = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    const c = local(center, yaw, cx, cy, cz);
    const q = quatYaw(yaw);
    const col = world.pw.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(c.x, c.y, c.z).setRotation(q).setFriction(0.7).setCollisionGroups(GROUPS.static),
    );
    world.pw.tags.set(col, { kind: 'static', what: 'truck', id });
    colliders.push(col);
  };
  // plataforma
  const bed = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, L), M.truckBed);
  bed.position.set(0, bedH - 0.08, 0);
  grp.add(bed);
  addCol(0, bedH - 0.08, 0, W / 2, 0.08, L / 2);
  // chasis bajo la plataforma
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, L), M.chassisDark);
  frame.position.set(0, bedH - 0.34, 0);
  grp.add(frame);
  addCol(0, bedH - 0.34, 0, 0.5, 0.18, L / 2);
  // laterales bajos (borde)
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, L), M.darkMetal);
    rail.position.set((sx * W) / 2, bedH - 0.06, 0);
    grp.add(rail);
  }
  // ruedas del semirremolque
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 20);
  for (const zz of [-L / 2 + 1.2, -L / 2 + 2.6, -L / 2 + 4.0]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, M.rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 1.0, 0.5, zz);
      grp.add(w);
    }
  }
  addCol(0, 0.5, -L / 2 + 2.6, 1.2, 0.5, 2.0);
  // patas de apoyo
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, bedH - 0.4, 0.1), M.darkMetal);
    leg.position.set(sx * 0.9, (bedH - 0.4) / 2, L / 2 - 2.5);
    grp.add(leg);
  }
  // tractor
  const cabMat = opts.color === 'red' ? M.truckRed : opts.color === 'white' ? M.truckCab : M.truckBlue;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.6, 2.2), cabMat);
  cab.position.set(0, 1.3 + 1.0, L / 2 + 2.6);
  grp.add(cab);
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.9), sharedMat('windshield', () => new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.6 })));
  windshield.position.set(0, 2.85, L / 2 + 3.71);
  grp.add(windshield);
  const tchassis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 4.4), M.chassisDark);
  tchassis.position.set(0, 0.85, L / 2 + 1.6);
  grp.add(tchassis);
  for (const zz of [L / 2 + 0.6, L / 2 + 3.2]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, M.rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 1.05, 0.5, zz);
      grp.add(w);
    }
  }
  addCol(0, 1.75, L / 2 + 2.6, 1.25, 1.75, 1.15);
  addCol(0, 0.85, L / 2 + 1.2, 0.6, 0.35, 1.2);
  if (opts.label) {
    const tex = labelTexture(opts.label, { bg: '#ffffff', fg: '#1d4f8f', w: 512, h: 128 });
    for (const sx of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      sign.position.set(sx * 1.236, 2.6, L / 2 + 2.6);
      sign.rotation.y = (sx * Math.PI) / 2;
      grp.add(sign);
    }
  }
  grp.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  grp.position.copy(center);
  grp.rotation.y = yaw;
  world.staticGroup.add(grp);
  world.occluders.push(cab);

  // huecos de carga lateral: pallets con el lado de entrada hacia los costados del camión
  const slots: Slot[] = [];
  const n = Math.floor((L - 0.4) / 1.3);
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const z = -L / 2 + 0.2 + 0.65 + i * 1.3;
      const c = local(center, yaw, side * 0.62, bedH + 0.002, z);
      const sid = `C${id}-${side > 0 ? 'I' : 'D'}${i + 1}`;
      slots.push({ id: sid, label: sid, center: c, yaw: yaw + Math.PI / 2, level: 0, rackId: -id, halfWidth: 0.6, clearance: 2.5 });
    }
  }
  const info: TruckInfo = { id, label: opts.label ?? `Camión ${id}`, group: grp, slots, bedHeight: bedH, colliders, center: center.clone(), yaw };
  world.trucks.push(info);
  return info;
}

/** Quita un camión del mundo. */
export function removeTruck(world: World, t: TruckInfo) {
  for (const c of t.colliders) {
    world.pw.tags.delete(c);
    world.pw.world.removeCollider(c, true);
  }
  world.staticGroup.remove(t.group);
  const i = world.trucks.indexOf(t);
  if (i >= 0) world.trucks.splice(i, 1);
}

// ------------------------------------------------------------------ rampa
export function ramp(world: World, base: THREE.Vector3, yaw: number, length: number, width: number, height: number, withPlatform = 0, platformWidth = width) {
  const M = materials();
  const angle = Math.atan2(height, length);
  const slopeLen = Math.hypot(length, height);
  const th = 0.4;
  // caja inclinada: su cara superior va del piso (z=0) a la altura (z=length)
  const centerLocal = new THREE.Vector3(0, height / 2 - (th / 2) * Math.cos(angle), length / 2 + (th / 2) * Math.sin(angle));
  const c = centerLocal.clone().applyAxisAngle(UP, yaw).add(base);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle));
  addStaticBox(world.pw, c.x, c.y, c.z, width / 2, th / 2, slopeLen / 2, { rot: { x: q.x, y: q.y, z: q.z, w: q.w }, friction: 0.9, tag: { kind: 'static', what: 'ramp' } });
  const mat = sharedMat('ramp', () => new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.85, metalness: 0.2 }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, th, slopeLen), mat);
  m.position.copy(c);
  m.quaternion.copy(q);
  m.castShadow = true;
  m.receiveShadow = true;
  world.staticGroup.add(m);
  // bordes de seguridad
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, slopeLen), M.stripes);
    edge.position.copy(c).add(new THREE.Vector3(sx * (width / 2 - 0.06), th / 2 + 0.07, 0).applyQuaternion(q));
    edge.quaternion.copy(q);
    world.staticGroup.add(edge);
    const cc = edge.position;
    addStaticBox(world.pw, cc.x, cc.y, cc.z, 0.06, 0.075, slopeLen / 2, { rot: { x: q.x, y: q.y, z: q.z, w: q.w }, tag: { kind: 'static', what: 'ramp' } });
  }
  if (withPlatform > 0) {
    const pc = local(base, yaw, 0, height / 2, length + withPlatform / 2);
    staticBox(world, pc, new THREE.Vector3(platformWidth, height, withPlatform), yaw, mat, 'dock', { friction: 0.9 });
    // cordones de seguridad en los bordes de la plataforma (menos la entrada de la rampa)
    const ch = 0.16;
    const y = height + ch / 2;
    const side = (platformWidth - width) / 2;
    for (const sx of [-1, 1]) {
      staticBox(world, local(base, yaw, sx * (platformWidth / 2 - 0.08), y, length + withPlatform / 2), new THREE.Vector3(0.16, ch, withPlatform), yaw, M.stripes, 'dock');
      if (side > 0.2) staticBox(world, local(base, yaw, sx * (width / 2 + side / 2), y, length + 0.08), new THREE.Vector3(side, ch, 0.16), yaw, M.stripes, 'dock');
    }
    staticBox(world, local(base, yaw, 0, y, length + withPlatform - 0.08), new THREE.Vector3(platformWidth, ch, 0.16), yaw, M.stripes, 'dock');
  }
  return m;
}

// ------------------------------------------------------------------ conos
export interface ConeEntity {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  id: number;
}

let coneId = 1000;
export function cone(world: World, x: number, z: number): ConeEntity {
  const M = materials();
  const id = coneId++;
  const body = world.pw.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.36, z).setLinearDamping(0.3).setAngularDamping(0.4));
  const col = world.pw.world.createCollider(
    RAPIER.ColliderDesc.cone(0.36, 0.17).setMass(2.5).setFriction(0.8).setCollisionGroups(GROUPS.prop),
    body,
  );
  world.pw.tags.set(col, { kind: 'prop', what: 'cone', id });
  const grp = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.72, 16), M.cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.1, 16), sharedMat('coneband', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })));
  band.position.y = 0.05;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), M.cone);
  base.position.y = -0.34;
  grp.add(c, band, base);
  grp.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  world.dynamicGroup.add(grp);
  const ent: ConeEntity = { body, mesh: grp, home: new THREE.Vector3(x, 0.36, z), id };
  world.updaters.push(() => {
    if (body.isSleeping()) return;
    const t = body.translation();
    const r = body.rotation();
    grp.position.set(t.x, t.y, t.z);
    grp.quaternion.set(r.x, r.y, r.z, r.w);
  });
  grp.position.copy(ent.home);
  return ent;
}

/** ¿El cono fue derribado o movido? */
export function coneDisturbed(c: ConeEntity): boolean {
  const t = c.body.translation();
  const r = c.body.rotation();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
  return up.y < 0.9 || Math.hypot(t.x - c.home.x, t.z - c.home.z) > 0.25;
}

// ------------------------------------------------------------------ carteles
export function sign(world: World, text: string, pos: THREE.Vector3, yaw: number, w: number, h: number, opts: { bg?: string; fg?: string; post?: boolean } = {}) {
  const tex = labelTexture(text, { bg: opts.bg ?? '#1d4f8f', fg: opts.fg ?? '#ffffff', w: Math.round((256 * w) / h), h: 256, font: `bold ${text.includes('\n') ? 80 : 120}px sans-serif` });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  m.position.copy(pos);
  m.rotation.y = yaw;
  world.staticGroup.add(m);
  if (opts.post) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, pos.y - h / 2, 8), materials().darkMetal);
    post.position.set(pos.x, (pos.y - h / 2) / 2, pos.z);
    world.staticGroup.add(post);
  }
  return m;
}

/** Barrera de protección (baranda amarilla). */
export function barrier(world: World, x1: number, z1: number, x2: number, z2: number) {
  const M = materials();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const yaw = Math.atan2(x2 - x1, z2 - z1);
  const c = new THREE.Vector3((x1 + x2) / 2, 0.45, (z1 + z2) / 2);
  staticBox(world, c, new THREE.Vector3(0.12, 0.12, len), yaw, M.stripes, 'wall');
  const n = Math.max(2, Math.ceil(len / 1.5) + 1);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = new THREE.Vector3(x1 + (x2 - x1) * t, 0.25, z1 + (z2 - z1) * t);
    staticBox(world, p, new THREE.Vector3(0.1, 0.5, 0.1), 0, M.lineYellow, 'wall');
  }
}

/** Surtidor / estación de carga (visual). */
export function fuelStation(world: World, pos: THREE.Vector3, yaw: number, electric: boolean) {
  const M = materials();
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.5), new THREE.MeshStandardMaterial({ color: electric ? 0x1f8a70 : 0xc81e1e, roughness: 0.5 }));
  body.position.y = 0.85;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.6), M.darkMetal);
  top.position.y = 1.8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: labelTexture(electric ? '⚡ CARGA' : 'GLP · GASOIL', { bg: '#111', fg: '#7CFC00', w: 256, h: 128 }) }));
  screen.position.set(0, 1.35, 0.251);
  grp.add(body, top, screen);
  grp.position.copy(pos);
  grp.rotation.y = yaw;
  grp.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  world.staticGroup.add(grp);
  addStaticBox(world.pw, pos.x, 0.85, pos.z, 0.4, 0.85, 0.25, { rotY: yaw, tag: { kind: 'static', what: 'other' } });
}
