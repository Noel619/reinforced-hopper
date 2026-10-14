import type { ForkliftEvent } from '../sim/forklift.ts';

export type ViolationRule =
  | 'cinturon'
  | 'horquillas_altas'
  | 'velocidad'
  | 'giro_brusco'
  | 'inclinacion_adelante'
  | 'sobrecarga'
  | 'inversion_marcha'
  | 'mirar_atras'
  | 'freno_mano'
  | 'rampa_carga'
  | 'rampa_giro'
  | 'peaton_cerca'
  | 'frenada_brusca'
  | 'elevar_en_marcha'
  | 'carga_alta_quieto';

export type GameEvent =
  | { type: 'collision'; what: 'rack' | 'wall' | 'truck' | 'pallet' | 'prop' | 'other'; severity: number; force: number; id?: number }
  | { type: 'palletImpact'; palletId: number; severity: number; speed: number }
  | { type: 'palletDropped'; palletId: number }
  | { type: 'tipover' }
  | { type: 'violation'; rule: ViolationRule; message: string; severity: number }
  | { type: 'forklift'; e: ForkliftEvent }
  | { type: 'pedestrianHit'; id: number }
  | { type: 'coneHit'; id: number };
