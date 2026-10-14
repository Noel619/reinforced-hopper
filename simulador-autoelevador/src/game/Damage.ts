import * as THREE from 'three';
import type { World } from '../world/World.ts';
import type { GameEvent } from './events.ts';

/**
 * Detecta choques del autoelevador (fuerzas de contacto de Rapier) y golpes/caídas de pallets
 * (cambios bruscos de velocidad y vuelcos).
 */
export class DamageMonitor {
  private pairCooldown = new Map<string, number>();
  private pending = new Map<string, { force: number; what: GameEvent & { type: 'collision' } }>();
  private emit: (e: GameEvent) => void;
  private tippedReported = false;
  private droppedReported = new Set<number>();
  private impactCooldown = new Map<number, number>();
  enabled = true;

  constructor(emit: (e: GameEvent) => void) {
    this.emit = emit;
  }

  reset() {
    this.pairCooldown.clear();
    this.pending.clear();
    this.tippedReported = false;
    this.droppedReported.clear();
    this.impactCooldown.clear();
  }

  /** Procesar después de cada paso de física. */
  afterStep(world: World, dt: number) {
    const { pw } = world;
    const fl = world.forklift;
    pw.events.drainContactForceEvents((ev) => {
      if (!this.enabled) return;
      const t1 = pw.tags.get(ev.collider1());
      const t2 = pw.tags.get(ev.collider2());
      if (!t1 || !t2) return;
      const fork = t1.kind === 'forklift' ? t1 : t2.kind === 'forklift' ? t2 : null;
      const other = fork === t1 ? t2 : t1;
      if (!fork) return;
      if (other.kind === 'forklift') return;
      const force = ev.maxForceMagnitude();
      let what: 'rack' | 'wall' | 'truck' | 'pallet' | 'prop' | 'other' = 'other';
      let id: number | undefined;
      if (other.kind === 'static') {
        if (other.what === 'floor' || other.what === 'ramp' || other.what === 'dock') {
          // horquillas raspando el piso o el chasis tocando la rampa: sólo golpes fuertes
          if (force < 60000) return;
          what = 'other';
        } else if (other.what === 'rack') what = 'rack';
        else if (other.what === 'truck') {
          // horquillas o carro apoyando/raspando la caja del camión al cargar o descargar: sólo golpes fuertes.
          // Un choque real (mástil o chasis contra el camión) empuja en horizontal.
          if (fork.part === 'forks' || fork.part === 'carriage') {
            const d = ev.maxForceDirection();
            if (Math.abs(d.y) > 0.6 && force < 60000) return;
          }
          what = 'truck';
        } else what = 'wall';
        id = other.id;
      } else if (other.kind === 'pallet') {
        // empujar un pallet es normal; sólo golpes fuertes cuentan
        if (fork.part === 'forks' || fork.part === 'carriage') return;
        what = 'pallet';
        id = other.id;
        if (force < 25000) return;
      } else if (other.kind === 'prop') {
        what = 'prop';
        id = other.id;
        if (other.what === 'cone') {
          const key = `cone:${other.id}`;
          if (!this.pairCooldown.has(key)) {
            this.pairCooldown.set(key, 3);
            this.emit({ type: 'coneHit', id: other.id });
          }
          return;
        }
      } else if (other.kind === 'pedestrian') {
        const key = `ped:${other.id}`;
        if (!this.pairCooldown.has(key)) {
          this.pairCooldown.set(key, 5);
          this.emit({ type: 'pedestrianHit', id: other.id });
        }
        return;
      }
      const threshold = what === 'rack' || what === 'wall' || what === 'truck' ? 7000 : 15000;
      if (force < threshold) return;
      const key = `${what}:${id ?? -1}`;
      const p = this.pending.get(key);
      if (p) p.force = Math.max(p.force, force);
      else if (!this.pairCooldown.has(key)) {
        this.pending.set(key, { force, what: { type: 'collision', what, severity: 0, force, id } });
      }
    });
    // agrupar ráfagas de contacto: emitir al final del paso
    for (const [key, p] of this.pending) {
      const sev = Math.max(0.05, Math.min(1, (p.force - 7000) / 90000));
      this.emit({ ...p.what, severity: sev, force: p.force });
      this.pairCooldown.set(key, 0.8);
      this.pending.delete(key);
    }
    for (const [k, v] of this.pairCooldown) {
      if (v - dt <= 0) this.pairCooldown.delete(k);
      else this.pairCooldown.set(k, v - dt);
    }

    // vuelco del autoelevador
    if (fl.telemetry.tippedOver && !this.tippedReported) {
      this.tippedReported = true;
      this.emit({ type: 'tipover' });
    }

    // pallets: golpes por cambio brusco de velocidad y vuelcos
    for (const e of world.pallets.values()) {
      if (!e.awake) continue;
      const v = e.phys.body.linvel();
      const vel = new THREE.Vector3(v.x, v.y, v.z);
      const dv = vel.distanceTo(e.prevVel);
      e.prevVel.copy(vel);
      const cd = this.impactCooldown.get(e.id) ?? 0;
      if (cd > 0) this.impactCooldown.set(e.id, cd - dt);
      if (dv > 1.4 && cd <= 0 && !fl.carried.has(e.phys.body.handle)) {
        const sev = Math.min(1, (dv - 1.4) / 3.5) * e.phys.cargo.fragility;
        if (sev > 0.02) {
          this.impactCooldown.set(e.id, 0.5);
          e.meta.damage = Math.min(1, e.meta.damage + sev * 0.6);
          this.emit({ type: 'palletImpact', palletId: e.id, severity: sev, speed: dv });
        }
      }
      if (!this.droppedReported.has(e.id)) {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.curQuat);
        if (up.y < 0.5) {
          this.droppedReported.add(e.id);
          e.meta.dropped = true;
          e.meta.damage = Math.min(1, e.meta.damage + 0.6 * Math.max(0.3, e.phys.cargo.fragility));
          this.emit({ type: 'palletDropped', palletId: e.id });
        }
      }
    }
  }
}
