import * as THREE from 'three';
import type { GameMode, Session } from '../game/Session.ts';
import type { World } from '../world/World.ts';
import { FORKLIFT_SPECS, getSpec } from '../sim/specs.ts';
import { CARGO_TYPES, PALLET_TYPES } from '../sim/pallet.ts';
import { buildPracticeCenter } from '../world/layouts.ts';
import { screen } from '../ui/menus.ts';
import { el, button } from '../ui/dom.ts';
import type { ConeEntity } from '../world/builders.ts';

/** Modo libre: centro de práctica con todo habilitado. */
export class SandboxMode implements GameMode {
  readonly id = 'sandbox' as const;
  readonly title = 'Modo libre';
  private specId: string;
  private spawnPoint = { position: new THREE.Vector3(), yaw: 0 };
  private cones: ConeEntity[] = [];
  private lastCargo = 'cajas';
  private lastMass = 600;
  private lastType: 'eur' | 'arlog' = 'eur';
  safetyConfig = { speedLimit: 14, speedLimitLoaded: 10 };

  constructor(specId = 'puma25') {
    this.specId = specId;
  }

  build(world: World) {
    const pc = buildPracticeCenter(world);
    this.spawnPoint = pc.spawn;
    this.cones = pc.cones;
    return { spec: getSpec(this.specId), position: pc.spawn.position, yaw: pc.spawn.yaw };
  }

  start(s: Session) {
    s.hud.toast('Modo libre: practicá a tu ritmo. Esc = pausa (cambiar modelo, generar cargas). F1 = controles.', 'info', 'sb-hello', 8);
    s.hud.modePanel.innerHTML = '<div class="panel mode-mini"><b>Modo libre</b><br><span class="dim">N: generar carga · Esc: menú</span></div>';
  }

  update(_dt: number, s: Session) {
    if (s.app.input.keyPressed('KeyN')) this.openSpawnMenu(s);
  }

  hasAccessory() {
    return true;
  }

  respawn() {
    return this.spawnPoint;
  }

  pauseItems(s: Session) {
    return [
      { label: '🚜 Cambiar autoelevador', action: () => this.openForkliftPicker(s) },
      { label: '📦 Generar carga (N)', action: () => this.openSpawnMenu(s) },
      {
        label: '🔺 Reacomodar conos',
        action: () => {
          for (const c of this.cones) {
            c.body.setTranslation({ x: c.home.x, y: c.home.y, z: c.home.z }, true);
            c.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          }
          s.app.closePause();
        },
      },
    ];
  }

  private openForkliftPicker(s: Session) {
    const app = s.app;
    const { root, body, footer } = screen('Elegí el autoelevador', 'picker');
    const grid = el('div', 'spec-grid');
    for (const spec of FORKLIFT_SPECS) {
      const card = el('button', `spec-card ${spec.id === s.fl.spec.id ? 'active' : ''}`);
      card.innerHTML = `<div class="sc-name">${spec.name}</div>
        <div class="sc-desc">${spec.description}</div>
        <div class="sc-stats">
          <span>Capacidad <b>${spec.capacityKg} kg</b></span>
          <span>Altura máx. <b>${spec.maxForkHeight.toFixed(1)} m</b></span>
          <span>Velocidad <b>${spec.maxSpeedKmh} km/h</b></span>
          <span>Mástil <b>${spec.mastType}</b></span>
          <span>${spec.power === 'electrico' ? 'Eléctrico' : spec.power === 'glp' ? 'GLP' : 'Diésel'}${spec.sideShift ? ' · desplazador' : ''}${spec.forkPositioner ? ' · posicionador' : ''}</span>
        </div>`;
      card.addEventListener('click', () => {
        const p = s.fl.position.clone();
        const yaw = s.fl.yaw;
        p.y = Math.max(0.02, p.y + 0.05);
        this.specId = spec.id;
        s.spawn(spec, p, yaw);
        app.popScreen(root);
        app.closePause();
        s.hud.toast(`Ahora manejás: ${spec.name}`, 'good');
      });
      grid.append(card);
    }
    body.append(grid);
    footer.append(button('Volver', () => app.popScreen(root), 'btn'));
    app.pushScreen(root);
  }

  private openSpawnMenu(s: Session) {
    const app = s.app;
    const wasPaused = s.paused;
    if (!wasPaused) s.setPaused(true);
    const { root, body, footer } = screen('Generar carga', 'spawn');
    const form = el('div', 'form');
    const cargoSel = el('select');
    for (const c of CARGO_TYPES) {
      const o = el('option', '', `${c.name} (${c.massMin}–${c.massMax} kg)`);
      o.value = c.id;
      if (c.id === this.lastCargo) o.selected = true;
      cargoSel.append(o);
    }
    const typeSel = el('select');
    for (const t of Object.values(PALLET_TYPES)) {
      const o = el('option', '', t.name);
      o.value = t.id;
      if (t.id === this.lastType) o.selected = true;
      typeSel.append(o);
    }
    const mass = el('input');
    mass.type = 'range';
    mass.min = '0';
    mass.max = '3500';
    mass.step = '50';
    mass.value = String(this.lastMass);
    const massLbl = el('span', 'form-hint', `${this.lastMass} kg`);
    mass.addEventListener('input', () => (massLbl.textContent = `${mass.value} kg`));
    cargoSel.addEventListener('change', () => {
      const c = CARGO_TYPES.find((x) => x.id === cargoSel.value)!;
      mass.value = String(Math.round((c.massMin + c.massMax) / 2));
      massLbl.textContent = `${mass.value} kg`;
    });
    const row = (l: string, i: HTMLElement, extra?: HTMLElement) => {
      const r = el('label', 'form-row');
      r.append(el('span', 'form-label', l), i);
      if (extra) r.append(extra);
      form.append(r);
    };
    row('Carga', cargoSel);
    row('Pallet', typeSel);
    row('Peso de la carga', mass, massLbl);
    body.append(form, el('p', 'note', 'La carga aparece en el piso, 4 m delante del autoelevador, con la entrada de horquillas hacia vos.'));
    const close = () => {
      app.popScreen(root);
      if (!wasPaused) s.setPaused(false);
    };
    footer.append(
      button('Cancelar', close, 'btn'),
      button(
        'Generar',
        () => {
          this.lastCargo = cargoSel.value;
          this.lastMass = Number(mass.value);
          this.lastType = typeSel.value as 'eur' | 'arlog';
          const fl = s.fl;
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fl.quaternion);
          fwd.y = 0;
          fwd.normalize();
          const p = fl.position.clone().addScaledVector(fwd, fl.spec.forkFaceOffset + fl.spec.forkLength + 2.8);
          p.y = 0.004;
          const yaw = Math.atan2(fwd.x, fwd.z);
          s.world.addPallet({ cargo: this.lastCargo, mass: this.lastMass, type: this.lastType, position: p, yaw });
          close();
          if (wasPaused) app.closePause();
        },
        'btn primary',
      ),
    );
    app.pushScreen(root);
  }
}
