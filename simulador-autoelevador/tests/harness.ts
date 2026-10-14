import * as THREE from 'three';
import { initPhysics, createPhysicsWorld, addStaticBox, type PhysicsWorld } from '../src/sim/physics.ts';
import { ForkliftPhysics } from '../src/sim/forklift.ts';
import { getSpec } from '../src/sim/specs.ts';
import { PalletBody } from '../src/sim/pallet.ts';

export interface Scene {
  pw: PhysicsWorld;
  fl: ForkliftPhysics;
  pallets: PalletBody[];
  time: number;
  step(seconds: number, each?: (t: number) => void): void;
}

export async function makeScene(specId = 'puma25', opts: { pos?: THREE.Vector3; yaw?: number } = {}): Promise<Scene> {
  await initPhysics();
  const pw = createPhysicsWorld(1 / 120);
  addStaticBox(pw, 0, -0.5, 0, 200, 0.5, 200, { tag: { kind: 'static', what: 'floor' } });
  const fl = new ForkliftPhysics(pw, getSpec(specId), opts.pos ?? new THREE.Vector3(0, 0, 0), opts.yaw ?? 0);
  const scene: Scene = {
    pw,
    fl,
    pallets: [],
    time: 0,
    step(seconds, each) {
      const n = Math.round(seconds / pw.dt);
      for (let i = 0; i < n; i++) {
        fl.preStep(pw.dt);
        pw.world.step(pw.events);
        fl.postStep(pw.dt);
        scene.time += pw.dt;
        each?.(scene.time);
      }
    },
  };
  return scene;
}

export function addPallet(s: Scene, x: number, y: number, z: number, cargo: string, mass?: number, yaw = 0, type: 'eur' | 'arlog' = 'eur') {
  const p = new PalletBody(s.pw, { id: s.pallets.length + 1, type, cargo, cargoMass: mass, position: new THREE.Vector3(x, y, z), yaw });
  s.pallets.push(p);
  return p;
}

export const fmt = (n: number, d = 2) => n.toFixed(d);
