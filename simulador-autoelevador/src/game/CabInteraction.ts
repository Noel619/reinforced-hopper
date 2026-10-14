import * as THREE from 'three';
import type { ForkliftModel, CabControlId } from '../render/ForkliftModel.ts';
import type { ControlMapper, LeverId } from '../input/ControlMapper.ts';
import type { ForkliftPhysics } from '../sim/forklift.ts';
import type { Input } from '../input/Input.ts';

const LEVERS: CabControlId[] = ['lift', 'tilt', 'shift', 'spread'];

/**
 * Permite accionar los mandos de la cabina con el ratón (en primera persona):
 * palancas hidráulicas proporcionales (vuelven al centro al soltar), palanca de marcha,
 * volante (girando el pomo), llave, freno de mano, cinturón, luces y bocina.
 */
export class CabInteraction {
  hover: CabControlId | null = null;
  private drag: { id: CabControlId; x0: number; y0: number; v0: number; angle0: number; moved: boolean } | null = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  readonly tooltip: HTMLDivElement;
  /** Notifica un cambio (para sonidos de "clic"). */
  onClick: ((id: CabControlId) => void) | null = null;

  private model: ForkliftModel;
  private mapper: ControlMapper;
  private fl: ForkliftPhysics;
  private camera: THREE.Camera;

  constructor(model: ForkliftModel, mapper: ControlMapper, fl: ForkliftPhysics, camera: THREE.Camera, container: HTMLElement) {
    this.model = model;
    this.mapper = mapper;
    this.fl = fl;
    this.camera = camera;
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'cab-tooltip';
    container.appendChild(this.tooltip);
  }

  dispose() {
    this.tooltip.remove();
    this.release();
  }

  /** Devuelve true si el ratón está ocupado con un mando (no mover la cabeza). */
  update(input: Input, active: boolean, width: number, height: number): boolean {
    if (!active) {
      this.setHover(null);
      this.release();
      this.tooltip.style.display = 'none';
      return false;
    }
    const mx = input.mouseX;
    const my = input.mouseY;
    if (!this.drag) {
      this.ndc.set((mx / width) * 2 - 1, -(my / height) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const targets = this.model.controls.flatMap((c) => c.targets);
      const hits = this.raycaster.intersectObjects(targets, false);
      const hit = hits.find((h) => h.distance < 1.6);
      this.setHover(hit ? (hit.object.userData.cabControl as CabControlId) : null);
    }
    if (this.hover && !input.mouseDown(2)) {
      const ctl = this.model.controls.find((c) => c.id === this.hover);
      this.tooltip.textContent = ctl?.label ?? '';
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${mx + 16}px`;
      this.tooltip.style.top = `${my + 12}px`;
    } else {
      this.tooltip.style.display = 'none';
    }

    // inicio de acción
    if (input.mouseClicked(0) && this.hover) {
      const id = this.hover;
      const c = this.fl.controls;
      switch (id) {
        case 'key':
          c.ignition = !c.ignition;
          this.onClick?.(id);
          break;
        case 'parking':
          c.parkingBrake = !c.parkingBrake;
          this.onClick?.(id);
          break;
        case 'belt':
          c.seatbelt = !c.seatbelt;
          this.onClick?.(id);
          break;
        case 'lights':
          c.lights = !c.lights;
          this.onClick?.(id);
          break;
        case 'horn':
          this.mapper.mouseHorn = true;
          break;
        default: {
          const angle0 = this.wheelAngle(mx, my, width, height);
          const v0 = id === 'wheel' ? c.handwheel : id === 'direction' ? c.direction : 0;
          this.drag = { id, x0: mx, y0: my, v0, angle0, moved: false };
        }
      }
    }
    if (this.drag) {
      const d = this.drag;
      const dx = mx - d.x0;
      const dy = my - d.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const c = this.fl.controls;
      if ((LEVERS as string[]).includes(d.id)) {
        // tirar hacia el operador (ratón hacia abajo) = positivo
        this.mapper.mouseLever[d.id as LeverId] = THREE.MathUtils.clamp(dy / 70, -1, 1);
      } else if (d.id === 'direction') {
        const prev = c.direction;
        if (dy < -18) c.direction = 1;
        else if (dy > 18) c.direction = -1;
        else c.direction = 0;
        if (prev !== c.direction) this.onClick?.('direction');
      } else if (d.id === 'wheel') {
        const a = this.wheelAngle(mx, my, width, height);
        let da = a - d.angle0;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        d.angle0 = a;
        // giro antihorario en pantalla = volante a la izquierda
        const turns = this.fl.spec.steeringTurns;
        const next = THREE.MathUtils.clamp((this.mapper.mouseHandwheel ?? c.handwheel) + (da / (Math.PI * 2)) * (2 / turns), -1, 1);
        this.mapper.mouseHandwheel = next;
      }
      if (input.mouseUp(0) || !input.mouseDown(0)) this.release();
    }
    if (input.mouseUp(0)) this.mapper.mouseHorn = false;
    return !!this.drag || (!!this.hover && input.mouseDown(0));
  }

  /** Ángulo del ratón alrededor del centro del volante proyectado en pantalla. */
  private wheelAngle(mx: number, my: number, width: number, height: number): number {
    const ctl = this.model.controls.find((c) => c.id === 'wheel');
    if (!ctl) return 0;
    const p = new THREE.Vector3();
    ctl.pivot.getWorldPosition(p);
    p.project(this.camera);
    const cx = (p.x * 0.5 + 0.5) * width;
    const cy = (-p.y * 0.5 + 0.5) * height;
    // eje Y de pantalla hacia abajo: invertimos para que antihorario sea positivo
    return Math.atan2(-(my - cy), mx - cx);
  }

  private release() {
    if (!this.drag) return;
    const id = this.drag.id;
    if ((LEVERS as string[]).includes(id)) delete this.mapper.mouseLever[id as LeverId];
    if (id === 'wheel') {
      this.fl.controls.handwheel = this.mapper.mouseHandwheel ?? this.fl.controls.handwheel;
      this.mapper.mouseHandwheel = null;
    }
    this.drag = null;
  }

  private setHover(id: CabControlId | null) {
    if (id === this.hover) return;
    this.hover = id;
    this.model.setHighlight(id);
  }
}
