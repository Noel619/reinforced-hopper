import * as THREE from 'three';

/** Texturas procedurales dibujadas en canvas (sin archivos externos). */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function canvasTexture(key: string, w: number, h: number, draw: Draw, opts: { repeat?: [number, number]; srgb?: boolean } = {}): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, seed: number, blotches = 0) {
  const img = ctx.createImageData(w, h);
  const r = rng(seed);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * amp;
    img.data[i * 4] = base[0] + n;
    img.data[i * 4 + 1] = base[1] + n;
    img.data[i * 4 + 2] = base[2] + n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < blotches; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 10 + r() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.6;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function concreteTexture(): THREE.Texture {
  return canvasTexture('concrete', 512, 512, (ctx, w, h) => {
    noise(ctx, w, h, [150, 150, 146], 22, 7, 40);
    // juntas de dilatación
    ctx.strokeStyle = 'rgba(60,60,60,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(w, 1);
    ctx.moveTo(1, 0);
    ctx.lineTo(1, h);
    ctx.stroke();
    // marcas de neumáticos
    const r = rng(11);
    ctx.strokeStyle = 'rgba(30,30,30,0.06)';
    ctx.lineWidth = 9;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const x = r() * w;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + r() * 200 - 100, h * 0.3, x + r() * 200 - 100, h * 0.7, x + r() * 100 - 50, h);
      ctx.stroke();
    }
  });
}

export function asphaltTexture(): THREE.Texture {
  return canvasTexture('asphalt', 512, 512, (ctx, w, h) => {
    noise(ctx, w, h, [70, 70, 72], 40, 3, 30);
    const r = rng(5);
    for (let i = 0; i < 1800; i++) {
      const c = 90 + r() * 70;
      ctx.fillStyle = `rgba(${c},${c},${c},0.5)`;
      ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });
}

export function woodTexture(): THREE.Texture {
  return canvasTexture('wood', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c49a62';
    ctx.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 70; i++) {
      const y = r() * h;
      ctx.strokeStyle = `rgba(${90 + r() * 40},${60 + r() * 30},${30 + r() * 20},${0.15 + r() * 0.25})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,40,20,0.6)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, 3 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function cardboardTexture(): THREE.Texture {
  return canvasTexture('cardboard', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, [176, 136, 88], 14, 9);
    // cajas apiladas: líneas de separación
    ctx.strokeStyle = 'rgba(90,60,30,0.7)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i * h) / 4);
      ctx.lineTo(w, (i * h) / 4);
      ctx.stroke();
    }
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? w / 4 : 0;
      for (let i = 0; i <= 2; i++) {
        const x = off + (i * w) / 2;
        ctx.beginPath();
        ctx.moveTo(x, (row * h) / 4);
        ctx.lineTo(x, ((row + 1) * h) / 4);
        ctx.stroke();
      }
    }
    // cinta y etiquetas
    ctx.fillStyle = 'rgba(200,170,120,0.6)';
    for (let row = 0; row < 4; row++) ctx.fillRect(0, (row * h) / 4 + h / 8 - 4, w, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let row = 0; row < 4; row++) ctx.fillRect(20 + (row % 2) * 60, (row * h) / 4 + 10, 34, 20);
  });
}

export function stripesTexture(): THREE.Texture {
  return canvasTexture('stripes', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f2c200';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#151515';
    for (let i = -2; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64 + 32, 0);
      ctx.lineTo(i * 64 + 32 + 128, h);
      ctx.lineTo(i * 64 + 128, h);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function sacksTexture(): THREE.Texture {
  return canvasTexture('sacks', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, [196, 192, 182], 16, 31);
    ctx.strokeStyle = 'rgba(110,105,95,0.8)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 5; row++) {
      const y = (row * h) / 5;
      const off = row % 2 ? w / 6 : 0;
      for (let i = -1; i < 3; i++) {
        const x = off + (i * w) / 3;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, w / 3 - 6, h / 5 - 6, 12);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(40,90,160,0.75)';
    ctx.font = 'bold 20px sans-serif';
    for (let row = 0; row < 5; row++) ctx.fillText('CEMENTO', 30 + (row % 2) * 50, (row * h) / 5 + 32);
  });
}

export function bricksTexture(): THREE.Texture {
  return canvasTexture('bricks', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7d4733';
    ctx.fillRect(0, 0, w, h);
    const r = rng(41);
    const bh = h / 10;
    for (let row = 0; row < 10; row++) {
      const off = row % 2 ? 24 : 0;
      for (let x = -off; x < w; x += 48) {
        const c = 150 + r() * 40;
        ctx.fillStyle = `rgb(${c},${c * 0.45},${c * 0.32})`;
        ctx.fillRect(x + 2, row * bh + 2, 44, bh - 4);
      }
    }
  });
}

export function drinksTexture(): THREE.Texture {
  return canvasTexture('drinks', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e9eef2';
    ctx.fillRect(0, 0, w, h);
    const colors = ['#c8102e', '#1f6fb5', '#2c8a3a'];
    for (let row = 0; row < 5; row++) {
      ctx.fillStyle = colors[row % 3];
      ctx.fillRect(0, (row * h) / 5 + 8, w, h / 5 - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('AGUA · GASEOSA', 18, (row * h) / 5 + 36);
    }
  });
}

export function tilesTexture(): THREE.Texture {
  return canvasTexture('tiles', 256, 256, (ctx, w, h) => {
    noise(ctx, w, h, [205, 200, 188], 10, 51);
    ctx.strokeStyle = 'rgba(80,80,80,0.7)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 8; row++) {
      ctx.beginPath();
      ctx.moveTo(0, (row * h) / 8);
      ctx.lineTo(w, (row * h) / 8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    ctx.font = 'bold 15px sans-serif';
    for (let row = 0; row < 8; row++) ctx.fillText('PORCELANATO 60×60', 30, (row * h) / 8 + 21);
  });
}

export function crateTexture(): THREE.Texture {
  return canvasTexture('crate', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b98c56';
    ctx.fillRect(0, 0, w, h);
    const r = rng(61);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(${120 + r() * 30},${85 + r() * 20},${45},0.35)`;
      ctx.fillRect(0, (i * h) / 8, w, h / 8 - 2);
    }
    ctx.strokeStyle = '#6e4d24';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(w - 10, h - 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,20,20,0.85)';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('FRÁGIL', 70, 120);
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('↑↑', 100, 170);
  });
}

export function steelTexture(): THREE.Texture {
  return canvasTexture('steel', 128, 128, (ctx, w, h) => {
    noise(ctx, w, h, [150, 155, 160], 26, 71);
    ctx.strokeStyle = 'rgba(90,95,100,0.5)';
    for (let i = 0; i < h; i += 4) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i + 2);
      ctx.stroke();
    }
  });
}

/** Etiqueta de texto (carteles, ubicaciones de rack, zonas). */
export function labelTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string; border?: string } = {}): THREE.Texture {
  const w = opts.w ?? 256;
  const h = opts.h ?? 64;
  const key = `label:${text}:${opts.bg}:${opts.fg}:${w}x${h}:${opts.font}:${opts.border}`;
  return canvasTexture(key, w, h, (ctx) => {
    ctx.fillStyle = opts.bg ?? '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = Math.max(4, h * 0.08);
      ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    }
    ctx.fillStyle = opts.fg ?? '#111111';
    ctx.font = opts.font ?? `bold ${Math.floor(h * 0.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    const lh = h / lines.length;
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, lh * i + lh / 2 + 2));
  });
}

/** Plano con texto, listo para colgar en la escena. */
export function labelMesh(text: string, width: number, height: number, opts: Parameters<typeof labelTexture>[1] = {}): THREE.Mesh {
  const tex = labelTexture(text, { w: Math.round(256 * (width / height) * 0.5) * 2, h: 128, ...opts });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return m;
}

/** Atlas de etiquetas: muchas etiquetas en una sola textura (una sola llamada de dibujo). */
export class LabelAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  private ctx: CanvasRenderingContext2D;
  private next = 0;
  readonly cols: number;
  readonly rows: number;
  readonly cellW: number;
  readonly cellH: number;

  constructor(cols = 4, rows = 32, cellW = 128, cellH = 32) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = cellW;
    this.cellH = cellH;
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * cellW;
    this.canvas.height = rows * cellH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.7 });
  }

  get full() {
    return this.next >= this.cols * this.rows;
  }

  /** Dibuja una etiqueta y devuelve un plano con las UV de su celda. */
  plane(text: string, w: number, h: number, opts: { bg?: string; fg?: string; border?: string } = {}): THREE.Mesh {
    const i = this.next++;
    const cx = (i % this.cols) * this.cellW;
    const cy = Math.floor(i / this.cols) * this.cellH;
    const ctx = this.ctx;
    ctx.fillStyle = opts.bg ?? '#ffffff';
    ctx.fillRect(cx, cy, this.cellW, this.cellH);
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 3;
      ctx.strokeRect(cx + 1.5, cy + 1.5, this.cellW - 3, this.cellH - 3);
    }
    ctx.fillStyle = opts.fg ?? '#111111';
    ctx.font = `bold ${Math.floor(this.cellH * 0.62)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx + this.cellW / 2, cy + this.cellH / 2 + 1);
    this.texture.needsUpdate = true;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const u0 = cx / W;
    const u1 = (cx + this.cellW) / W;
    // flipY de la textura: v=1 arriba del canvas
    const v1 = 1 - cy / H;
    const v0 = 1 - (cy + this.cellH) / H;
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k);
      const v = uv.getY(k);
      uv.setXY(k, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v);
    }
    return new THREE.Mesh(g, this.material);
  }
}
