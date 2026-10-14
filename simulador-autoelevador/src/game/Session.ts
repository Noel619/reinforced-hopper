import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { World } from '../world/World.ts';
import type { ForkliftSpec } from '../sim/specs.ts';
import { CameraRig, CAMERA_LABELS, type CameraMode } from '../render/CameraRig.ts';
import { drawDashboard } from '../render/Dashboard.ts';
import { Hud } from '../ui/Hud.ts';
import { CabInteraction } from './CabInteraction.ts';
import { SafetyMonitor, type SafetyConfig } from './Safety.ts';
import { DamageMonitor } from './Damage.ts';
import type { GameEvent } from './events.ts';
import type { App } from '../app/App.ts';
import { residualCapacity } from '../sim/specs.ts';

export type AccessoryId = 'camara' | 'bascula' | 'luz_azul' | 'alarma' | 'altura' | 'luces';

export interface GameMode {
  readonly id: 'sandbox' | 'training' | 'business';
  readonly title: string;
  /** Construye el escenario y devuelve el autoelevador inicial. */
  build(world: World): { spec: ForkliftSpec; position: THREE.Vector3; yaw: number };
  start?(s: Session): void;
  update?(dt: number, s: Session): void;
  onEvent?(e: GameEvent, s: Session): void;
  pauseItems?(s: Session): { label: string; action: () => void }[];
  hasAccessory?(id: AccessoryId): boolean;
  safetyConfig?: Partial<SafetyConfig>;
  /** Punto de reaparición del autoelevador (reiniciar posición). */
  respawn?(s: Session): { position: THREE.Vector3; yaw: number };
  dispose?(s: Session): void;
}

/** Una partida en curso: mundo, autoelevador, cámaras, HUD y reglas. */
export class Session {
  readonly app: App;
  readonly mode: GameMode;
  readonly world: World;
  readonly rig: CameraRig;
  readonly hud: Hud;
  readonly safety: SafetyMonitor;
  readonly damage: DamageMonitor;
  cab!: CabInteraction;
  paused = false;
  /** Tiempo de juego transcurrido (s) */
  elapsed = 0;
  private acc = 0;
  private sun!: THREE.DirectionalLight;
  private hudTimer = 0;
  private dashTimer = 0;
  private pip = false;
  private pipCam: THREE.PerspectiveCamera;
  private respawnPos = new THREE.Vector3();
  private respawnYaw = 0;
  /** Escala de tiempo de la física (1 = real). */
  timeScale = 1;

  constructor(app: App, mode: GameMode) {
    this.app = app;
    this.mode = mode;
    this.world = new World();
    this.setupEnvironment();
    const { spec, position, yaw } = mode.build(this.world);
    this.respawnPos.copy(position);
    this.respawnYaw = yaw;
    this.rig = new CameraRig(app.aspect);
    this.rig.occluders = this.world.occluders;
    this.rig.setMode(app.settings.defaultCamera);
    this.pipCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.03, 200);
    this.hud = new Hud(app.overlay);
    this.safety = new SafetyMonitor((e) => this.handleEvent(e));
    this.damage = new DamageMonitor((e) => this.handleEvent(e));
    Object.assign(this.safety.config, mode.safetyConfig ?? {});
    this.safety.lookingBack = () => this.rig.lookingBackward();
    const peds = this.world.peds;
    if (peds) {
      this.safety.pedestrianDistance = () => peds.nearestDistance();
      peds.onHit = (p) => this.handleEvent({ type: 'pedestrianHit', id: p.id });
    }
    this.spawn(spec, position, yaw);
    this.applyHudOptions();
    mode.start?.(this);
  }

  get fl() {
    return this.world.forklift;
  }
  get model() {
    return this.world.model;
  }

  /** Crea (o reemplaza) el autoelevador. */
  spawn(spec: ForkliftSpec, position: THREE.Vector3, yaw: number) {
    this.cab?.dispose();
    const fl = this.world.spawnForklift(spec, position, yaw);
    fl.on((e) => this.handleEvent({ type: 'forklift', e }));
    this.cab = new CabInteraction(this.world.model, this.app.mapper, fl, this.rig.camera, this.app.overlay);
    this.cab.onClick = (id) => this.app.audio.click(id === 'parking' ? 'ratchet' : 'light');
    this.world.model.setBlueSpot(this.hasAccessory('luz_azul'));
    this.app.mapper.release(fl);
  }

  hasAccessory(id: AccessoryId): boolean {
    return this.mode.hasAccessory ? this.mode.hasAccessory(id) : true;
  }

  applyHudOptions() {
    const s = this.app.settings;
    this.hud.opts.showStability = s.showStability;
    this.hud.opts.showScale = this.hasAccessory('bascula');
    this.hud.opts.showHeight = this.hasAccessory('altura');
    this.hud.setVisible(s.showHud);
  }

  private setupEnvironment() {
    const scene = this.world.scene;
    scene.background = new THREE.Color(0xb9d3ea);
    scene.fog = new THREE.Fog(0xb9d3ea, 80, 260);
    const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x6a6155, 1.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.4);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 5;
    sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;
    // mapa de entorno para reflejos de metales (cromados, espejos)
    const pmrem = new THREE.PMREMGenerator(this.app.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }

  // ------------------------------------------------------------------ eventos
  handleEvent(e: GameEvent) {
    const hud = this.hud;
    const audio = this.app.audio;
    switch (e.type) {
      case 'collision': {
        const names: Record<string, string> = { rack: 'la estantería', wall: 'la pared/estructura', truck: 'el camión', pallet: 'un pallet', prop: 'un objeto', other: 'un obstáculo' };
        const strong = e.severity > 0.25;
        hud.toast(`${strong ? '¡Choque fuerte' : 'Golpe'} contra ${names[e.what]}!`, strong ? 'danger' : 'warn', `col:${e.what}`, 2);
        audio.impact(e.severity, e.what === 'pallet' ? 'wood' : 'metal');
        this.app.input.rumble(0.4 + e.severity, 0.3, 120 + e.severity * 300);
        break;
      }
      case 'palletImpact':
        if (e.severity > 0.12) hud.toast('Golpe a la carga: puede estar dañada.', 'warn', 'pimpact', 3);
        audio.impact(Math.min(1, e.severity), 'wood');
        break;
      case 'palletDropped':
        hud.toast('¡Se cayó una carga!', 'danger', `drop:${e.palletId}`, 4);
        audio.impact(0.9, 'wood');
        this.app.input.rumble(0.8, 0.6, 400);
        break;
      case 'tipover':
        hud.bigMessage('¡VUELCO!', 4);
        hud.toast('El autoelevador volcó. En la vida real, quedate dentro, agarrate fuerte y tirate hacia el lado contrario al vuelco.', 'danger', 'tip', 8);
        audio.impact(1, 'metal');
        this.app.input.rumble(1, 1, 900);
        break;
      case 'violation':
        hud.toast(`⚠ ${e.message}`, e.severity > 0.55 ? 'danger' : 'warn', `v:${e.rule}`, 5);
        break;
      case 'forklift':
        switch (e.e) {
          case 'needNeutral':
            hud.toast('Para arrancar, poné la palanca de marcha en NEUTRAL (N).', 'warn', 'neutral', 4);
            break;
          case 'noFuel':
            hud.toast(this.fl.isElectric ? 'Batería agotada.' : 'Sin combustible.', 'danger', 'fuel', 5);
            break;
          case 'directionChangeMoving':
            this.safety.trigger('inversion_marcha', 0.4);
            break;
          case 'engineStart':
            audio.click();
            break;
          default:
            break;
        }
        break;
      case 'pedestrianHit':
        hud.bigMessage('¡ACCIDENTE!', 4);
        hud.toast('Atropellaste a un peatón. Es la causa más grave de accidentes con autoelevadores.', 'danger', 'ped', 8);
        audio.impact(1, 'thud');
        this.app.input.rumble(1, 1, 600);
        break;
      case 'coneHit':
        hud.toast('Cono derribado.', 'warn', `cone:${e.id}`, 3);
        break;
    }
    this.mode.onEvent?.(e, this);
  }

  // ------------------------------------------------------------------ cuadro
  frame(dt: number) {
    const app = this.app;
    const input = app.input;
    const fl = this.fl;
    if (this.paused) return;
    this.elapsed += dt;

    // mandos
    const ui = app.mapper.update(dt, input, fl);
    if (ui.pause) {
      app.openPause();
      return;
    }
    if (ui.help) app.toggleHelp();
    if (ui.cameraNext) {
      this.rig.next();
      if (this.rig.mode === 'horquillas' && !this.hasAccessory('camara')) this.rig.next();
      this.hud.setCameraLabel(CAMERA_LABELS[this.rig.mode]);
    }
    if (ui.forkCam && this.hasAccessory('camara')) this.pip = !this.pip;
    if (ui.resetView) this.rig.resetView();
    if (ui.resetForklift) this.resetForklift();

    // ratón: mandos de cabina o mirada
    const busy = this.cab.update(input, this.rig.mode === 'cabina' && !app.uiBlocking, app.width, app.height);
    const looking = input.mouseDown(2) || (input.mouseDown(0) && !busy && !this.cab.hover);
    if (looking && !app.uiBlocking) this.rig.look(input.mouseDX, input.mouseDY);
    if (input.wheel && !app.uiBlocking) this.rig.zoom(input.wheel);

    // física con paso fijo
    const h = this.world.pw.dt;
    this.acc += Math.min(dt, 0.1) * this.timeScale;
    let steps = 0;
    while (this.acc >= h && steps < 8) {
      this.world.beforeStep();
      this.world.step();
      this.world.afterStep();
      this.damage.afterStep(this.world, h);
      this.acc -= h;
      steps++;
    }
    if (steps >= 8) this.acc = 0;
    const alpha = this.acc / h;
    this.world.syncVisuals(alpha);
    this.world.update(dt);

    // partes móviles del modelo
    const t = fl.telemetry;
    const m = this.model;
    m.updateParts(t, fl.controls, fl.wheels, fl.spread, this.world.time, fl.liftActual);
    m.updateTiltCylinders();

    // reglas y modo
    this.safety.update(dt, fl);
    this.mode.update?.(dt, this);

    // cámara y sol
    this.rig.shake = fl.telemetry.engineRunning ? (fl.isElectric ? 0.05 : 0.25 + t.engineLoad * 0.5) : 0;
    this.rig.update(dt, m, ui.lookBack, t.speed);
    const fp = m.chassis.position;
    this.sun.position.set(fp.x + 30, 50, fp.z + 20);
    this.sun.target.position.set(fp.x, 0, fp.z);

    // sonido
    app.audio.update(dt, fl, this.rig.mode === 'cabina', this.hasAccessory('alarma'));

    // HUD y tablero (a menor frecuencia)
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      this.hud.update(dt, fl);
    }
    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.dashTimer = 1 / 8;
      const cap = residualCapacity(fl.spec, t.forkHeight, t.loadCenter > 0.05 ? t.loadCenter : fl.spec.loadCenter);
      drawDashboard(m.dashCanvas, t, fl.controls, fl.spec, { scale: this.hasAccessory('bascula'), heightIndicator: this.hasAccessory('altura'), overload: t.forkLoadKg > cap + 20 }, this.elapsed);
      m.dashTexture.needsUpdate = true;
    }
  }

  render(renderer: THREE.WebGLRenderer) {
    const cam = this.rig.camera;
    cam.aspect = this.app.aspect;
    cam.updateProjectionMatrix();
    renderer.setScissorTest(false);
    renderer.render(this.world.scene, cam);
    // monitor de cámara de horquillas (imagen en imagen)
    if (this.pip && this.rig.mode !== 'horquillas') {
      const w = Math.round(this.app.width * 0.26);
      const hgt = Math.round((w * 3) / 4);
      const x = Math.round(this.app.width * 0.5 - w / 2);
      const y = 16;
      const pc = this.pipCam;
      const m = this.model;
      m.forks.updateMatrixWorld();
      pc.position.copy(new THREE.Vector3(0, 0.06, -0.02).applyMatrix4(m.forks.matrixWorld));
      const q = m.forks.getWorldQuaternion(new THREE.Quaternion());
      pc.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, Math.PI, 0, 'YXZ')));
      pc.layers.enable(1);
      pc.aspect = w / hgt;
      pc.updateProjectionMatrix();
      renderer.setViewport(x, y, w, hgt);
      renderer.setScissor(x, y, w, hgt);
      renderer.setScissorTest(true);
      renderer.render(this.world.scene, pc);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, this.app.width, this.app.height);
    }
  }

  setCamera(mode: CameraMode) {
    this.rig.setMode(mode);
  }

  /** Endereza y lleva el autoelevador al punto de inicio. */
  resetForklift() {
    const r = this.mode.respawn?.(this) ?? { position: this.respawnPos, yaw: this.respawnYaw };
    this.fl.reset(r.position, r.yaw);
    this.damage.reset();
    this.hud.toast('Autoelevador reubicado.', 'info');
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.app.mapper.release(this.fl);
      this.app.audio.silence();
    }
  }

  dispose() {
    this.mode.dispose?.(this);
    this.cab.dispose();
    this.hud.root.remove();
    this.world.dispose();
  }
}
