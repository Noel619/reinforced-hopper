import * as THREE from 'three';

/** Flecha flotante que señala un objetivo. */
export class ArrowMarker {
  readonly group = new THREE.Group();
  private t = Math.random() * 10;
  constructor(color = 0x3ddc84) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 18), mat);
    cone.rotation.x = Math.PI;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), mat);
    shaft.position.y = 0.5;
    this.group.add(cone, shaft);
    this.group.renderOrder = 10;
  }
  update(dt: number) {
    this.t += dt;
    this.group.children.forEach((c, i) => (c.position.y = (i === 1 ? 0.5 : 0) + Math.sin(this.t * 3) * 0.12));
    this.group.rotation.y += dt * 1.5;
  }
}

/** Caja fantasma que muestra dónde debe quedar una carga. */
export class GhostBox {
  readonly group = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;
  private t = 0;
  constructor(w: number, h: number, d: number, color = 0x3ddc84) {
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat);
    m.position.y = h / 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color }));
    edges.position.y = h / 2;
    this.group.add(m, edges);
  }
  update(dt: number) {
    this.t += dt;
    this.mat.opacity = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(this.t * 4));
  }
}
