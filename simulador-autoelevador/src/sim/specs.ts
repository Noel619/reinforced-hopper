/**
 * Fichas técnicas de los autoelevadores contrapesados.
 *
 * Sistema de coordenadas del chasis (metros):
 *  - origen en el piso, justo debajo del centro del eje delantero
 *  - +Z hacia adelante (lado de las horquillas), +Y hacia arriba, +X hacia la izquierda
 */

export type PowerType = 'diesel' | 'glp' | 'electrico';
export type MastType = 'duplex' | 'triplex';

export interface ForkliftSpec {
  id: string;
  name: string;
  description: string;
  price: number;
  power: PowerType;
  /** Capacidad nominal (kg) al centro de carga indicado. */
  capacityKg: number;
  /** Centro de carga nominal medido desde la cara de las horquillas (m). */
  loadCenter: number;

  // --- Geometría del chasis ---
  wheelbase: number;
  frontTrack: number;
  rearTrack: number;
  frontWheelRadius: number;
  rearWheelRadius: number;
  frontWheelWidth: number;
  rearWheelWidth: number;
  bodyWidth: number;
  /** Distancia del eje trasero al extremo del contrapeso. */
  rearOverhang: number;
  overheadGuardHeight: number;
  seatHeight: number;
  /** Distancia del eje delantero a la cara de las horquillas. */
  forkFaceOffset: number;
  /** Ángulo máximo de la rueda trasera interior (grados). */
  maxInnerSteerDeg: number;
  /** Vueltas de volante de tope a tope. */
  steeringTurns: number;
  /** Oscilación máxima del eje trasero pivotante (grados). */
  rearAxleOscillationDeg: number;

  // --- Mástil ---
  mastType: MastType;
  maxForkHeight: number;
  freeLift: number;
  loweredMastHeight: number;
  tiltForwardDeg: number;
  tiltBackDeg: number;
  sideShift: boolean;
  sideShiftRange: number;
  forkPositioner: boolean;
  forkLength: number;
  forkWidth: number;
  forkThickness: number;
  forkSpreadMin: number;
  forkSpreadMax: number;
  forkSpreadDefault: number;
  backrestHeight: number;

  // --- Masas ---
  serviceWeight: number;
  mastMass: number;
  carriageMass: number;
  forkFrameMass: number;
  /** Distancia horizontal del CDG sin carga detrás del eje delantero. */
  cgFromFrontAxle: number;
  cgHeight: number;

  // --- Prestaciones ---
  maxSpeedKmh: number;
  liftSpeed: number;
  lowerSpeed: number;
  tiltSpeedDeg: number;
  sideShiftSpeed: number;
  /** Fuerza máxima de tracción (N). */
  maxDriveForce: number;
  /** Fuerza máxima de frenado total (N). */
  maxBrakeForce: number;
  idleRpm: number;
  maxRpm: number;
  /** Capacidad del tanque (L) o batería (kWh). */
  energyCapacity: number;
  /** Consumo a plena potencia (L/h o kW). */
  energyUseFull: number;
  /** Consumo en ralentí (L/h o kW). */
  energyUseIdle: number;
}

const base25: ForkliftSpec = {
  id: 'puma25',
  name: 'Puma 25 Diésel',
  description: 'Autoelevador diésel de 2,5 t: el caballo de batalla de cualquier depósito. Desplazador lateral incluido.',
  price: 32000,
  power: 'diesel',
  capacityKg: 2500,
  loadCenter: 0.5,
  wheelbase: 1.65,
  frontTrack: 0.97,
  rearTrack: 0.98,
  frontWheelRadius: 0.34,
  rearWheelRadius: 0.275,
  frontWheelWidth: 0.2,
  rearWheelWidth: 0.16,
  bodyWidth: 1.16,
  rearOverhang: 0.47,
  overheadGuardHeight: 2.12,
  seatHeight: 1.08,
  forkFaceOffset: 0.48,
  maxInnerSteerDeg: 80,
  steeringTurns: 4.5,
  rearAxleOscillationDeg: 4,
  mastType: 'duplex',
  maxForkHeight: 3.3,
  freeLift: 0.15,
  loweredMastHeight: 2.15,
  tiltForwardDeg: 6,
  tiltBackDeg: 10,
  sideShift: true,
  sideShiftRange: 0.1,
  forkPositioner: false,
  forkLength: 1.07,
  forkWidth: 0.122,
  forkThickness: 0.045,
  forkSpreadMin: 0.3,
  forkSpreadMax: 0.95,
  forkSpreadDefault: 0.4,
  backrestHeight: 1.1,
  serviceWeight: 3750,
  mastMass: 420,
  carriageMass: 130,
  forkFrameMass: 190,
  cgFromFrontAxle: 0.93,
  cgHeight: 0.62,
  maxSpeedKmh: 19,
  liftSpeed: 0.6,
  lowerSpeed: 0.5,
  tiltSpeedDeg: 4,
  sideShiftSpeed: 0.12,
  maxDriveForce: 18000,
  maxBrakeForce: 26000,
  idleRpm: 750,
  maxRpm: 2600,
  energyCapacity: 60,
  energyUseFull: 9,
  energyUseIdle: 0.9,
};

export const FORKLIFT_SPECS: ForkliftSpec[] = [
  {
    ...base25,
    id: 'toro15',
    name: 'Toro 15 GLP (usado)',
    description: 'Autoelevador a gas de 1,5 t con muchas horas encima. Lento y sin desplazador lateral, pero cumple.',
    price: 9000,
    power: 'glp',
    capacityKg: 1500,
    wheelbase: 1.4,
    frontTrack: 0.89,
    rearTrack: 0.9,
    frontWheelRadius: 0.29,
    rearWheelRadius: 0.235,
    frontWheelWidth: 0.17,
    rearWheelWidth: 0.13,
    bodyWidth: 1.07,
    rearOverhang: 0.4,
    overheadGuardHeight: 2.06,
    seatHeight: 1.02,
    forkFaceOffset: 0.42,
    maxForkHeight: 3.0,
    loweredMastHeight: 2.0,
    tiltBackDeg: 10,
    sideShift: false,
    sideShiftRange: 0,
    forkLength: 1.0,
    forkWidth: 0.1,
    forkThickness: 0.04,
    forkSpreadDefault: 0.4,
    serviceWeight: 2650,
    mastMass: 330,
    carriageMass: 100,
    forkFrameMass: 120,
    cgFromFrontAxle: 0.79,
    cgHeight: 0.58,
    maxSpeedKmh: 15,
    liftSpeed: 0.42,
    lowerSpeed: 0.45,
    tiltSpeedDeg: 3.2,
    maxDriveForce: 11500,
    maxBrakeForce: 19000,
    energyCapacity: 30,
    energyUseFull: 7,
    energyUseIdle: 0.8,
  },
  base25,
  {
    ...base25,
    id: 'volt18',
    name: 'Volt 18 Eléctrico',
    description: 'Eléctrico de 1,8 t con mástil triplex de elevación libre total hasta 4,7 m. Silencioso, ágil y sin humo.',
    price: 41000,
    power: 'electrico',
    capacityKg: 1800,
    wheelbase: 1.45,
    frontTrack: 0.92,
    rearTrack: 0.9,
    frontWheelRadius: 0.25,
    rearWheelRadius: 0.2,
    frontWheelWidth: 0.18,
    rearWheelWidth: 0.12,
    bodyWidth: 1.1,
    rearOverhang: 0.42,
    overheadGuardHeight: 2.08,
    seatHeight: 1.05,
    forkFaceOffset: 0.44,
    mastType: 'triplex',
    maxForkHeight: 4.7,
    freeLift: 1.45,
    loweredMastHeight: 2.1,
    tiltBackDeg: 7,
    forkLength: 1.0,
    forkWidth: 0.1,
    forkThickness: 0.04,
    forkSpreadDefault: 0.4,
    serviceWeight: 3300,
    mastMass: 520,
    carriageMass: 110,
    forkFrameMass: 160,
    cgFromFrontAxle: 0.86,
    cgHeight: 0.55,
    maxSpeedKmh: 16,
    liftSpeed: 0.45,
    lowerSpeed: 0.5,
    tiltSpeedDeg: 4,
    maxDriveForce: 13000,
    maxBrakeForce: 22000,
    energyCapacity: 36,
    energyUseFull: 14,
    energyUseIdle: 0.25,
  },
  {
    ...base25,
    id: 'titan35',
    name: 'Titán 35 Diésel',
    description: 'Diésel pesado de 3,5 t con posicionador de horquillas y mástil de 4 m. Para cargas grandes y patio.',
    price: 58000,
    capacityKg: 3500,
    wheelbase: 1.75,
    frontTrack: 1.0,
    rearTrack: 0.98,
    frontWheelRadius: 0.355,
    rearWheelRadius: 0.29,
    frontWheelWidth: 0.23,
    rearWheelWidth: 0.17,
    bodyWidth: 1.23,
    rearOverhang: 0.52,
    overheadGuardHeight: 2.18,
    seatHeight: 1.12,
    forkFaceOffset: 0.52,
    maxForkHeight: 4.0,
    loweredMastHeight: 2.55,
    tiltBackDeg: 10,
    forkPositioner: true,
    sideShiftRange: 0.12,
    forkLength: 1.2,
    forkWidth: 0.125,
    forkThickness: 0.05,
    forkSpreadDefault: 0.42,
    forkSpreadMax: 1.1,
    serviceWeight: 4900,
    mastMass: 560,
    carriageMass: 160,
    forkFrameMass: 300,
    cgFromFrontAxle: 1.0,
    cgHeight: 0.66,
    maxSpeedKmh: 19,
    liftSpeed: 0.5,
    lowerSpeed: 0.48,
    maxDriveForce: 24000,
    maxBrakeForce: 34000,
    energyCapacity: 75,
    energyUseFull: 11,
    energyUseIdle: 1.1,
  },
  {
    ...base25,
    id: 'condor20',
    name: 'Cóndor 20 Triplex',
    description: 'Diésel de 2 t con triplex de 6 m para estanterías altas. La capacidad baja en altura: respetá la placa.',
    price: 52000,
    capacityKg: 2000,
    mastType: 'triplex',
    maxForkHeight: 6.0,
    freeLift: 1.6,
    loweredMastHeight: 2.35,
    tiltBackDeg: 6,
    serviceWeight: 4100,
    mastMass: 700,
    carriageMass: 130,
    forkFrameMass: 190,
    cgFromFrontAxle: 0.95,
    cgHeight: 0.66,
    liftSpeed: 0.55,
  },
];

export function getSpec(id: string): ForkliftSpec {
  return FORKLIFT_SPECS.find((s) => s.id === id) ?? base25;
}

/**
 * Capacidad residual (kg) para una altura de elevación y un centro de carga dados.
 * Aproximación de la placa de capacidad: igual momento respecto del eje delantero,
 * con reducción por encima de cierta altura.
 */
export function residualCapacity(spec: ForkliftSpec, forkHeight: number, loadCenter: number): number {
  const ref = spec.forkFaceOffset + spec.loadCenter;
  const actual = spec.forkFaceOffset + Math.max(loadCenter, 0.05);
  let cap = (spec.capacityKg * ref) / actual;
  const derateStart = Math.min(3.3, spec.maxForkHeight * 0.7);
  if (forkHeight > derateStart) {
    const t = (forkHeight - derateStart) / Math.max(0.1, spec.maxForkHeight - derateStart);
    cap *= 1 - 0.18 * Math.min(1, t);
  }
  return Math.floor(cap / 10) * 10;
}
