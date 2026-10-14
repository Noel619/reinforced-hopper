import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Firma de atributos (sólo se pueden fusionar geometrías con los mismos atributos). */
function attrSignature(g: THREE.BufferGeometry): string {
  return Object.keys(g.attributes).sort().join(',') + (g.index ? ':i' : ':n');
}

function prepare(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  let c = g.clone();
  c.applyMatrix4(m);
  // homogeneizar: todas indexadas o todas no indexadas
  if (c.index) c = c.toNonIndexed();
  for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
  if (!c.attributes.uv) {
    c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((c.attributes.position.count) * 2), 2));
  }
  if (!c.attributes.normal) c.computeVertexNormals();
  return c;
}

/**
 * Fusiona las mallas estáticas de un grupo (con sus transformaciones horneadas)
 * agrupando por material, capas y sombras. Reduce drásticamente las llamadas de dibujo.
 * @param root      grupo cuyas mallas se fusionan (las transformaciones se expresan respecto de él)
 * @param exclude   objetos que no se tocan (y tampoco sus hijos)
 */
export function batchStatic(root: THREE.Object3D, exclude: Set<THREE.Object3D> = new Set(), opts: { minCount?: number } = {}): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[]; layers: number; cast: boolean; receive: boolean; occluder: boolean; renderOrder: number }>();
  const visit = (o: THREE.Object3D) => {
    if (exclude.has(o)) return;
    for (const ch of [...o.children]) visit(ch);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.noBatch || !m.visible) return;
    if (m.children.length) return;
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}|${m.layers.mask}|${m.castShadow}|${m.receiveShadow}|${!!m.userData.occluder}|${m.renderOrder}|${attrSignature(m.geometry)}`;
    let b = buckets.get(key);
    if (!b) {
      b = { mat, meshes: [], layers: m.layers.mask, cast: m.castShadow, receive: m.receiveShadow, occluder: !!m.userData.occluder, renderOrder: m.renderOrder };
      buckets.set(key, b);
    }
    b.meshes.push(m);
  };
  visit(root);
  const out: THREE.Mesh[] = [];
  const tmp = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < (opts.minCount ?? 2)) continue;
    const geos = b.meshes.map((m) => prepare(m.geometry, tmp.multiplyMatrices(rootInv, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.layers.mask = b.layers;
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.renderOrder;
    if (b.occluder) mesh.userData.occluder = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}
