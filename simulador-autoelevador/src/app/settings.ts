import type { CameraMode } from '../render/CameraRig.ts';

export interface Settings {
  defaultCamera: CameraMode;
  showStability: boolean;
  showHud: boolean;
  volume: number;
  quality: 'baja' | 'media' | 'alta';
  drivingMode: 'realista' | 'simple';
  autoCenter: boolean;
  invertTilt: boolean;
  requireLookBack: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCamera: 'cabina',
  showStability: true,
  showHud: true,
  volume: 0.8,
  quality: 'media',
  drivingMode: 'realista',
  autoCenter: false,
  invertTilt: false,
  requireLookBack: true,
};

const KEY = 'autoelevador.ajustes.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* almacenamiento no disponible */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Lectura/escritura genérica en localStorage con tolerancia a fallos. */
export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* sin almacenamiento */
  }
  return fallback;
}

export function storageSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
}
