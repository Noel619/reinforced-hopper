import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALLET_TYPES, type PalletType, type CargoType } from '../sim/pallet.ts';
import { materials } from '../render/materials.ts';
import { labelTexture } from '../render/textures.ts';

const palletGeoCache = new Map<string, THREE.BufferGeometry>();
const cargoGeoCache = new Map<string, THREE.BufferGeometry>();

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Geometría combinada del pallet de madera (tablas superiores, tacos). */
export function palletGeometry(pt: PalletType): THREE.BufferGeometry {
  const cached = palletGeoCache.get(pt.id);
  if (cached) return cached;
  const parts: THREE.BufferGeometry[] = [];
  const top = pt.blockHeight + pt.deckThickness;
  const boardT = pt.deckThickness / 2;
  // tablas transversales (debajo del tablero) sobre los tacos
  const xs = [-pt.width / 2 + pt.blockWX[0] / 2, 0, pt.width / 2 - pt.blockWX[0] / 2];
  const wx = [pt.blockWX[0], pt.blockWX[1], pt.blockWX[0]];
  for (let i = 0; i < 3; i++) parts.push(boxAt(wx[i], boardT, pt.length, xs[i], pt.blockHeight + boardT / 2, 0));
  // tablas superiores con separaciones (a lo ancho)
  const n = 5;
  const bw = (pt.length - 0.08 * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z = -pt.length / 2 + bw / 2 + i * (bw + 0.08);
    parts.push(boxAt(pt.width, boardT, bw, 0, top - boardT / 2, z));
  }
  // tacos
  const zs = [-pt.length / 2 + pt.blockWZ / 2, 0, pt.length / 2 - pt.blockWZ / 2];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) parts.push(boxAt(wx[i] - 0.004, pt.blockHeight, pt.blockWZ, xs[i], pt.blockHeight / 2, zs[j]));
  const g = mergeGeometries(parts)!;
  palletGeoCache.set(pt.id, g);
  return g;
}

function cargoMaterial(style: CargoType['style']): THREE.Material {
  const M = materials();
  switch (style) {
    case 'boxes':
      return M.cardboard;
    case 'drinks':
      return M.drinks;
    case 'sacks':
      return M.sacks;
    case 'bricks':
      return M.bricks;
    case 'tiles':
      return M.tiles;
    case 'machine':
      return M.crate;
    case 'coil':
      return M.steel;
    default:
      return M.cardboard;
  }
}

/** Construye la malla visual de un pallet con su carga. */
export function buildPalletMesh(typeId: PalletType['id'], cargo: CargoType, cargoSize: THREE.Vector3, label?: { text: string; color: string }): THREE.Group {
  const pt = PALLET_TYPES[typeId];
  const M = materials();
  const g = new THREE.Group();
  const wood = new THREE.Mesh(palletGeometry(pt), M.wood);
  wood.castShadow = true;
  wood.receiveShadow = true;
  g.add(wood);
  const deckTop = pt.blockHeight + pt.deckThickness;
  const { x: cw, y: ch, z: cl } = cargoSize;
  if (cargo.style === 'empty' || ch <= 0) return g;

  let cargoMesh: THREE.Object3D;
  const key = `${cargo.style}:${cw.toFixed(3)}:${ch.toFixed(3)}:${cl.toFixed(3)}`;
  switch (cargo.style) {
    case 'drums': {
      const grp = new THREE.Group();
      const drumMat = new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: 0.45, metalness: 0.4 });
      const r = Math.min(cw, cl) / 4 - 0.01;
      const geo = new THREE.CylinderGeometry(r, r, ch, 20);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const d = new THREE.Mesh(geo, drumMat);
        d.position.set((sx * cw) / 4, deckTop + ch / 2, (sz * cl) / 4);
        d.castShadow = true;
        grp.add(d);
        const ringGeo = new THREE.TorusGeometry(r, 0.012, 6, 20);
        for (const hy of [0.3, 0.7]) {
          const ring = new THREE.Mesh(ringGeo, drumMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.set((sx * cw) / 4, deckTop + ch * hy, (sz * cl) / 4);
          grp.add(ring);
        }
      }
      cargoMesh = grp;
      break;
    }
    case 'coil': {
      const grp = new THREE.Group();
      const r = Math.min(ch / 2, cw / 2);
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(r, r, cl * 0.95, 28, 1, false), M.steel);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0, deckTop + r, 0);
      coil.castShadow = true;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.38, cl * 0.96, 20), M.black);
      hole.rotation.x = Math.PI / 2;
      hole.position.copy(coil.position);
      // cunas de madera
      const chock1 = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.08, 0.12), M.woodDark);
      chock1.position.set(0, deckTop + 0.04, -cl * 0.3);
      const chock2 = chock1.clone();
      chock2.position.z = cl * 0.3;
      grp.add(coil, hole, chock1, chock2);
      cargoMesh = grp;
      break;
    }
    case 'pallets': {
      const grp = new THREE.Group();
      const n = Math.max(1, Math.floor(ch / (pt.blockHeight + pt.deckThickness)));
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(palletGeometry(pt), M.wood);
        p.position.y = deckTop + i * (pt.blockHeight + pt.deckThickness);
        p.castShadow = true;
        grp.add(p);
      }
      cargoMesh = grp;
      break;
    }
    default: {
      let geo = cargoGeoCache.get(key);
      if (!geo) {
        geo = cargo.style === 'sacks' ? new RoundedBoxGeometry(cw, ch, cl, 2, 0.05) : new THREE.BoxGeometry(cw, ch, cl);
        cargoGeoCache.set(key, geo);
      }
      const m = new THREE.Mesh(geo, cargoMaterial(cargo.style));
      m.position.y = deckTop + ch / 2;
      m.castShadow = true;
      m.receiveShadow = true;
      const grp = new THREE.Group();
      grp.add(m);
      // film stretch
      if (cargo.style === 'boxes' || cargo.style === 'drinks' || cargo.style === 'tiles') {
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.02, ch * 0.92, cl + 0.02), M.wrap);
        wrap.position.y = deckTop + ch * 0.5;
        grp.add(wrap);
      }
      // zunchos en ladrillos/cerámicos
      if (cargo.style === 'bricks' || cargo.style === 'tiles') {
        const strapMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.5 });
        for (const sz of [-0.25, 0.25]) {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.012, ch + 0.012, 0.025), strapMat);
          strap.position.set(0, deckTop + ch / 2, sz * cl);
          grp.add(strap);
        }
      }
      cargoMesh = grp;
    }
  }
  g.add(cargoMesh);

  if (label) {
    const tex = labelTexture(label.text, { bg: '#ffffff', fg: '#111111', w: 256, h: 128, font: 'bold 40px sans-serif', border: label.color });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const h = Math.min(0.28, ch * 0.4);
    for (const sx of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(h * 2, h), mat);
      plane.position.set(0, deckTop + ch * 0.6, sx * (cl / 2 + 0.015));
      plane.rotation.y = sx > 0 ? 0 : Math.PI;
      g.add(plane);
    }
  }
  return g;
}
