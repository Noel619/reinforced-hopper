import * as THREE from 'three';
import { Input, PAD } from '../input/Input.ts';
import { ControlMapper } from '../input/ControlMapper.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { Session, type GameMode } from '../game/Session.ts';
import { loadSettings, saveSettings, type Settings } from './settings.ts';
import { mainMenu, helpScreen, settingsScreen, pauseScreen } from '../ui/menus.ts';
import { el } from '../ui/dom.ts';
import { ForkliftModel } from '../render/ForkliftModel.ts';
import { getSpec } from '../sim/specs.ts';
import { CAMERA_LABELS } from '../render/CameraRig.ts';

export interface ModeLauncher {
  training: (app: App) => void;
  sandbox: (app: App) => void;
  business: (app: App) => void;
}

/** Aplicación: renderizador, entrada, audio, menús y la partida activa. */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  readonly mapper = new ControlMapper();
  readonly audio = new AudioEngine();
  readonly overlay: HTMLDivElement;
  readonly container: HTMLElement;
  settings: Settings;
  session: Session | null = null;
  width = 1;
  height = 1;
  private last = performance.now();
  private screens: HTMLElement[] = [];
  private menuScene: THREE.Scene | null = null;
  private menuCam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  private menuModel: ForkliftModel | null = null;
  private launcher: ModeLauncher;
  fps = 0;

  constructor(container: HTMLElement, launcher: ModeLauncher) {
    this.container = container;
    this.launcher = launcher;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.overlay = el('div', 'overlay');
    container.appendChild(this.overlay);
    this.input = new Input(this.renderer.domElement);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // el audio sólo puede arrancar tras un gesto del usuario
    const unlock = () => this.audio.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get aspect() {
    return this.width / this.height;
  }

  /** ¿Hay un menú encima del juego? */
  get uiBlocking() {
    return this.screens.length > 0;
  }

  applySettings() {
    const s = this.settings;
    this.mapper.settings.drivingMode = s.drivingMode;
    this.mapper.settings.autoCenter = s.autoCenter;
    this.mapper.settings.invertTilt = s.invertTilt;
    this.audio.volume = s.volume;
    const pr = s.quality === 'baja' ? 0.75 : s.quality === 'media' ? Math.min(1.5, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = s.quality !== 'baja';
    if (this.session) {
      this.session.safety.config.requireLookBack = s.requireLookBack;
      this.session.applyHudOptions();
    }
    this.resize();
  }

  resize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.menuCam.aspect = this.aspect;
    this.menuCam.updateProjectionMatrix();
  }

  start() {
    this.showMainMenu();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  private loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.input.poll();
    if (this.session) {
      const s = this.session;
      if (s.paused) {
        const esc = this.input.keyPressed('Escape') || this.input.padPressedNow(PAD.OPTIONS);
        if (esc && this.screens.some((x) => x.classList.contains('pause-screen'))) this.closePause();
      } else {
        this.mapper.locked = this.uiBlocking;
        s.frame(dt);
      }
      s.render(this.renderer);
    } else {
      this.renderMenuScene();
    }
    this.updatePadInfo();
    this.input.endFrame();
  }

  // ------------------------------------------------------------------ menú principal
  private ensureMenuScene() {
    if (this.menuScene) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2330);
    scene.fog = new THREE.Fog(0x1a2330, 12, 40);
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x302820, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const model = new ForkliftModel(getSpec('puma25'));
    model.mast.position.set(0, model.geo.pivot.y, model.geo.pivot.z);
    model.carriage.position.set(0, model.geo.forkTop0 + 0.4, model.geo.forkFace);
    model.forks.position.copy(model.carriage.position);
    scene.add(model.root);
    this.menuModel = model;
    this.menuScene = scene;
  }

  private renderMenuScene() {
    this.ensureMenuScene();
    const t = performance.now() / 1000;
    const a = t * 0.15;
    this.menuCam.position.set(Math.sin(a) * 6.5, 2.6, Math.cos(a) * 6.5);
    this.menuCam.lookAt(0, 1.1, -0.4);
    const m = this.menuModel;
    if (m) {
      // las horquillas suben y bajan lentamente
      const lift = 0.4 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 1.6;
      m.carriage.position.y = m.geo.forkTop0 + lift;
      m.forks.position.y = m.carriage.position.y;
      const inner = m.spec.mastType === 'triplex' ? 0 : lift / 2;
      (m as unknown as { innerMast: THREE.Group }).innerMast.position.y = inner;
    }
    this.renderer.render(this.menuScene!, this.menuCam);
  }

  private updatePadInfo() {
    const elx = document.getElementById('pad-info');
    if (!elx) return;
    const txt = this.input.padConnected ? `🎮 Joystick conectado: ${this.input.padId.slice(0, 48)}` : '🎮 Conectá un joystick (PlayStation/Xbox) y apretá un botón para usarlo';
    if (elx.textContent !== txt) elx.textContent = txt;
  }

  showMainMenu() {
    this.clearScreens();
    const m = mainMenu(
      {
        training: () => this.launcher.training(this),
        sandbox: () => this.launcher.sandbox(this),
        business: () => this.launcher.business(this),
        help: () => this.toggleHelp(),
        settings: () => this.openSettings(),
      },
      '',
    );
    this.pushScreen(m);
  }

  // ------------------------------------------------------------------ pantallas
  pushScreen(e: HTMLElement) {
    this.overlay.appendChild(e);
    this.screens.push(e);
  }

  popScreen(e?: HTMLElement) {
    const target = e ?? this.screens[this.screens.length - 1];
    if (!target) return;
    target.remove();
    this.screens = this.screens.filter((s) => s !== target);
  }

  clearScreens() {
    for (const s of this.screens) s.remove();
    this.screens = [];
  }

  private helpPaused = false;

  toggleHelp() {
    const existing = this.screens.find((s) => s.classList.contains('help'));
    if (existing) {
      this.popScreen(existing);
      if (this.helpPaused && this.session) {
        this.helpPaused = false;
        this.session.setPaused(false);
        this.last = performance.now();
      }
      return;
    }
    // abrir la ayuda durante el juego lo pausa
    if (this.session && !this.session.paused) {
      this.session.setPaused(true);
      this.helpPaused = true;
    }
    const h = helpScreen(() => this.toggleHelp());
    this.pushScreen(h);
  }

  openSettings() {
    const s = settingsScreen(
      this.settings,
      (ns) => {
        this.settings = ns;
        saveSettings(ns);
        this.applySettings();
      },
      () => this.popScreen(s),
    );
    this.pushScreen(s);
  }

  // ------------------------------------------------------------------ partidas
  startSession(mode: GameMode) {
    this.endSession();
    this.clearScreens();
    this.audio.init();
    this.session = new Session(this, mode);
    this.session.safety.config.requireLookBack = this.settings.requireLookBack;
    this.session.applyHudOptions();
  }

  endSession() {
    if (!this.session) return;
    this.session.dispose();
    this.session = null;
    this.audio.silence();
  }

  exitToMenu() {
    this.endSession();
    this.showMainMenu();
  }

  openPause() {
    const s = this.session;
    if (!s || s.paused) return;
    s.setPaused(true);
    const items = [
      { label: '▶ Continuar', action: () => this.closePause(), cls: 'primary' },
      ...(s.mode.pauseItems?.(s) ?? []),
      {
        label: '⟲ Reubicar autoelevador',
        action: () => {
          s.resetForklift();
          this.closePause();
        },
      },
      {
        label: `🎥 Cámara: ${CAMERA_LABELS[s.rig.mode]}`,
        action: () => {
          s.rig.next();
          this.closePause();
          s.hud.setCameraLabel(CAMERA_LABELS[s.rig.mode]);
        },
      },
      { label: '🎮 Controles', action: () => this.toggleHelp() },
      { label: '⚙ Ajustes', action: () => this.openSettings() },
      { label: '⏏ Salir al menú principal', action: () => this.exitToMenu(), cls: 'danger' },
    ];
    const p = pauseScreen(items);
    p.classList.add('pause-screen');
    this.pushScreen(p);
  }

  closePause() {
    const s = this.session;
    if (!s) return;
    const p = this.screens.find((x) => x.classList.contains('pause-screen'));
    if (p) this.popScreen(p);
    // cerrar ayudas/ajustes abiertos desde la pausa
    for (const x of [...this.screens]) if (x.classList.contains('help') || x.classList.contains('settings')) this.popScreen(x);
    s.setPaused(false);
    this.last = performance.now();
  }
}
