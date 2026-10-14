import * as THREE from 'three';

/**
 * Pieza visual de un pallet: geometría compartida (con la transformación local horneada)
 * y su material. Todas las piezas iguales de todos los pallets se dibujan en una sola
 * llamada mediante InstancedMesh.
 */
export interface PalletPart {
  key: string;
  geometry: THREE.BufferGeometry;
  /** Material (las etiquetas usan el del atlas del instanciador). */
  material?: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Etiqueta impresa (se dibuja en el atlas). */
  label?: { text: string; color: string };
}

interface Batch {
  mesh: THREE.InstancedMesh;
  owners: PartRef[];
  labelled: boolean;
}

export interface PartRef {
  batch: Batch;
  index: number;
  /** Celda del atlas (etiquetas). */
  cell: number;
}

/** Atlas con las etiquetas de los pallets (texto de cliente/SKU y borde de color). */
class StickerAtlas {
  static readonly COLS = 16;
  static readonly ROWS = 24;
  static readonly CW = 128;
  static readonly CH = 64;
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private free: number[] = [];
  private next = 1; // la celda 0 queda en blanco (si se llena el atlas)

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = StickerAtlas.COLS * StickerAtlas.CW;
    this.canvas.height = StickerAtlas.ROWS * StickerAtlas.CH;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#f4f4f0';
    this.ctx.fillRect(0, 0, StickerAtlas.CW, StickerAtlas.CH);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  alloc(text: string, color: string): number {
    const cell = this.free.pop() ?? (this.next < StickerAtlas.COLS * StickerAtlas.ROWS ? this.next++ : 0);
    if (cell === 0) return 0;
    const { CW, CH, COLS } = StickerAtlas;
    const x = (cell % COLS) * CW;
    const y = Math.floor(cell / COLS) * CH;
    const c = this.ctx;
    c.fillStyle = '#ffffff';
    c.fillRect(x, y, CW, CH);
    c.strokeStyle = color;
    c.lineWidth = 8;
    c.strokeRect(x + 4, y + 4, CW - 8, CH - 8);
    c.fillStyle = '#111111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lines = text.split('\n');
    const fs = lines.length > 1 ? 19 : 26;
    c.font = `bold ${fs}px sans-serif`;
    lines.forEach((l, i) => c.fillText(l, x + CW / 2, y + CH / 2 + (i - (lines.length - 1) / 2) * (fs + 2), CW - 16));
    this.texture.needsUpdate = true;
    return cell;
  }

  release(cell: number) {
    if (cell > 0) this.free.push(cell);
  }

  /** Esquina inferior izquierda de la celda en UV (flipY). */
  uv(cell: number): [number, number] {
    const { COLS, ROWS } = StickerAtlas;
    return [(cell % COLS) / COLS, 1 - (Math.floor(cell / COLS) + 1) / ROWS];
  }

  material(): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.7 });
    const sx = 1 / StickerAtlas.COLS;
    const sy = 1 / StickerAtlas.ROWS;
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 labelUv;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = labelUv + vMapUv * vec2(${sx.toFixed(6)}, ${sy.toFixed(6)});\n#endif`);
    };
    m.customProgramCacheKey = () => 'pallet-sticker';
    return m;
  }

  dispose() {
    this.texture.dispose();
  }
}

/** Dibuja todos los pallets con una llamada por tipo de pieza. */
export class PalletInstancer {
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private atlas = new StickerAtlas();
  private stickerMat = this.atlas.material();
  private tmp = new THREE.Matrix4();

  add(parts: PalletPart[], matrix: THREE.Matrix4): PartRef[] {
    return parts.map((p) => {
      const b = this.batchFor(p);
      if (b.owners.length >= b.mesh.instanceMatrix.count) this.grow(b);
      const ref: PartRef = { batch: b, index: b.owners.length, cell: p.label ? this.atlas.alloc(p.label.text, p.label.color) : 0 };
      b.owners.push(ref);
      b.mesh.count = b.owners.length;
      b.mesh.setMatrixAt(ref.index, matrix);
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.labelled) this.writeCell(b, ref.index, ref.cell);
      return ref;
    });
  }

  setMatrix(refs: PartRef[], matrix: THREE.Matrix4) {
    for (const r of refs) {
      r.batch.mesh.setMatrixAt(r.index, matrix);
      r.batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  remove(refs: PartRef[]) {
    for (const r of refs) {
      const b = r.batch;
      const last = b.owners.length - 1;
      if (r.index !== last) {
        // la última instancia ocupa el lugar libre
        const moved = b.owners[last];
        b.mesh.getMatrixAt(last, this.tmp);
        b.mesh.setMatrixAt(r.index, this.tmp);
        b.owners[r.index] = moved;
        moved.index = r.index;
        if (b.labelled) this.writeCell(b, r.index, moved.cell);
      }
      b.owners.pop();
      b.mesh.count = b.owners.length;
      b.mesh.instanceMatrix.needsUpdate = true;
      this.atlas.release(r.cell);
    }
  }

  dispose() {
    for (const b of this.batches.values()) {
      b.mesh.dispose();
      if (b.labelled) b.mesh.geometry.dispose();
    }
    this.batches.clear();
    this.stickerMat.dispose();
    this.atlas.dispose();
  }

  private batchFor(p: PalletPart): Batch {
    let b = this.batches.get(p.key);
    if (b) return b;
    const labelled = !!p.label;
    const geo = labelled ? p.geometry.clone() : p.geometry;
    const mesh = this.makeMesh(geo, labelled ? this.stickerMat : p.material!, 32);
    mesh.castShadow = p.castShadow;
    mesh.receiveShadow = p.receiveShadow;
    if (labelled) geo.setAttribute('labelUv', new THREE.InstancedBufferAttribute(new Float32Array(32 * 2), 2));
    b = { mesh, owners: [], labelled };
    this.batches.set(p.key, b);
    this.group.add(mesh);
    return b;
  }

  private makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // las instancias se mueven: sin recorte por volumen (son pocas llamadas)
    mesh.frustumCulled = false;
    return mesh;
  }

  private grow(b: Batch) {
    const old = b.mesh;
    const cap = old.instanceMatrix.count * 2;
    const mesh = this.makeMesh(old.geometry, old.material as THREE.Material, cap);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    mesh.count = old.count;
    mesh.castShadow = old.castShadow;
    mesh.receiveShadow = old.receiveShadow;
    if (b.labelled) {
      const prev = old.geometry.getAttribute('labelUv') as THREE.InstancedBufferAttribute;
      const arr = new Float32Array(cap * 2);
      arr.set(prev.array as Float32Array);
      old.geometry.setAttribute('labelUv', new THREE.InstancedBufferAttribute(arr, 2));
    }
    this.group.remove(old);
    old.dispose();
    this.group.add(mesh);
    b.mesh = mesh;
  }

  private writeCell(b: Batch, index: number, cell: number) {
    const a = b.mesh.geometry.getAttribute('labelUv') as THREE.InstancedBufferAttribute;
    const [u, v] = this.atlas.uv(cell);
    a.setXY(index, u, v);
    a.needsUpdate = true;
  }
}
