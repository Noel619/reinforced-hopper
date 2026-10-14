import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALLET_TYPES, type PalletType, type CargoType } from '../sim/pallet.ts';
import { materials } from '../render/materials.ts';
import type { PalletPart } from './palletInstances.ts';

const palletGeoCache = new Map<string, THREE.BufferGeometry>();

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

let drumMat: THREE.Material | null = null;
let strapMat: THREE.Material | null = null;
const partGeoCache = new Map<string, THREE.BufferGeometry>();

/** Geometría cacheada por clave (con las transformaciones locales horneadas). */
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = partGeoCache.get(key);
  if (!g) {
    g = make();
    g.computeBoundingSphere();
    partGeoCache.set(key, g);
  }
  return g;
}

/** Hornea una transformación (posición/rotación) en una copia de la geometría. */
function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  return g.clone().applyMatrix4(m);
}

/** Une geometrías heterogéneas (con o sin índice) en una sola. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = parts.map((g) => {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    return c;
  });
  return mergeGeometries(norm)!;
}

/**
 * Piezas visuales de un pallet con su carga (para dibujarlas instanciadas).
 * Todas las transformaciones locales están horneadas en las geometrías.
 */
export function palletParts(typeId: PalletType['id'], cargo: CargoType, cargoSize: THREE.Vector3, label?: { text: string; color: string }): PalletPart[] {
  const pt = PALLET_TYPES[typeId];
  const M = materials();
  const parts: PalletPart[] = [{ key: `wood:${pt.id}`, geometry: palletGeometry(pt), material: M.wood, castShadow: true, receiveShadow: true }];
  const deckTop = pt.blockHeight + pt.deckThickness;
  const { x: cw, y: ch, z: cl } = cargoSize;
  if (cargo.style === 'empty' || ch <= 0) return parts;
  const sz = `${cw.toFixed(3)}:${ch.toFixed(3)}:${cl.toFixed(3)}:${pt.id}`;
  const part = (key: string, make: () => THREE.BufferGeometry, material: THREE.Material, castShadow = true, receiveShadow = true) =>
    parts.push({ key, geometry: cachedGeo(key, make), material, castShadow, receiveShadow });

  switch (cargo.style) {
    case 'drums': {
      drumMat ??= new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: 0.45, metalness: 0.4 });
      part(`drums:${sz}`, () => {
        const r = Math.min(cw, cl) / 4 - 0.01;
        const body = new THREE.CylinderGeometry(r, r, ch, 20);
        const ring = new THREE.TorusGeometry(r, 0.012, 6, 20);
        const g: THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1])
          for (const sz2 of [-1, 1]) {
            g.push(placed(body, (sx * cw) / 4, deckTop + ch / 2, (sz2 * cl) / 4));
            for (const hy of [0.3, 0.7]) g.push(placed(ring, (sx * cw) / 4, deckTop + ch * hy, (sz2 * cl) / 4, Math.PI / 2));
          }
        return merge(g);
      }, drumMat);
      break;
    }
    case 'coil': {
      const r = Math.min(ch / 2, cw / 2);
      part(`coil:${sz}`, () => placed(new THREE.CylinderGeometry(r, r, cl * 0.95, 28, 1, false), 0, deckTop + r, 0, Math.PI / 2), M.steel);
      part(`coilhole:${sz}`, () => placed(new THREE.CylinderGeometry(r * 0.38, r * 0.38, cl * 0.96, 20), 0, deckTop + r, 0, Math.PI / 2), M.black, false);
      // cuñas de madera
      part(`coilchock:${sz}`, () => {
        const b = new THREE.BoxGeometry(cw, 0.08, 0.12);
        return merge([placed(b, 0, deckTop + 0.04, -cl * 0.3), placed(b, 0, deckTop + 0.04, cl * 0.3)]);
      }, M.woodDark);
      break;
    }
    case 'pallets': {
      const n = Math.max(1, Math.floor(ch / deckTop));
      part(`stack:${pt.id}:${n}`, () => merge(Array.from({ length: n }, (_, i) => placed(palletGeometry(pt), 0, deckTop + i * deckTop, 0))), M.wood);
      break;
    }
    default: {
      part(`${cargo.style}:${sz}`, () => {
        const g = cargo.style === 'sacks' ? new RoundedBoxGeometry(cw, ch, cl, 2, 0.05) : new THREE.BoxGeometry(cw, ch, cl);
        return placed(g, 0, deckTop + ch / 2, 0);
      }, cargoMaterial(cargo.style));
      // film stretch
      if (cargo.style === 'boxes' || cargo.style === 'drinks' || cargo.style === 'tiles') {
        part(`wrap:${sz}`, () => placed(new THREE.BoxGeometry(cw + 0.02, ch * 0.92, cl + 0.02), 0, deckTop + ch * 0.5, 0), M.wrap, false, false);
      }
      // zunchos en ladrillos/cerámicos
      if (cargo.style === 'bricks' || cargo.style === 'tiles') {
        strapMat ??= new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.5 });
        part(`straps:${sz}`, () => {
          const b = new THREE.BoxGeometry(cw + 0.012, ch + 0.012, 0.025);
          return merge([placed(b, 0, deckTop + ch / 2, -0.25 * cl), placed(b, 0, deckTop + ch / 2, 0.25 * cl)]);
        }, strapMat, false);
      }
    }
  }

  if (label) {
    const h = Math.min(0.28, ch * 0.4);
    const key = `label:${sz}`;
    const geometry = cachedGeo(key, () => {
      const pl = new THREE.PlaneGeometry(h * 2, h);
      return merge([placed(pl, 0, deckTop + ch * 0.6, cl / 2 + 0.015), placed(pl, 0, deckTop + ch * 0.6, -(cl / 2 + 0.015), 0, Math.PI)]);
    });
    parts.push({ key, geometry, castShadow: false, receiveShadow: true, label });
  }
  return parts;
}
