import * as THREE from 'three';
import type { World, PalletEntity, Slot, Zone } from '../../world/World.ts';
import { zone } from '../../world/builders.ts';
import { type Lesson, type LessonCtx, type LessonRefs, above, zoneMarker, slotGhost } from './kit.ts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Hueco de rack por fila/nivel (el más al oeste = índice 0). */
function rackSlot(world: World, rackId: number, level: number, index = 0): Slot {
  const list = world.slots.filter((s) => s.rackId === rackId && s.level === level).sort((a, b) => a.center.x - b.center.x);
  return list[Math.min(index, list.length - 1)];
}

/** Vacía un hueco (y los vecinos inmediatos del mismo nivel). */
function clearSlot(world: World, slot: Slot) {
  for (const e of [...world.pallets.values()]) {
    if (Math.abs(e.curPos.y - slot.center.y) < 0.3 && Math.hypot(e.curPos.x - slot.center.x, e.curPos.z - slot.center.z) < 1.0) world.removePallet(e.id);
  }
}

function clearArea(world: World, center: THREE.Vector3, radius: number, minY = -1, maxY = 99) {
  for (const e of [...world.pallets.values()]) {
    if (e.curPos.y < minY || e.curPos.y > maxY) continue;
    if (Math.hypot(e.curPos.x - center.x, e.curPos.z - center.z) < radius) world.removePallet(e.id);
  }
}

function addZone(world: World, refs: LessonRefs, key: string, label: string, x: number, y: number, z: number, w: number, d: number, color: number, yaw = 0): Zone {
  const zz = zone(world, { id: key, label, center: V(x, y, z), width: w, depth: d, yaw, color, kind: 'meta' }, { fill: true });
  refs.zones[key] = zz;
  return zz;
}

/** Pasos comunes para tomar un pallet del piso. */
function pickSteps(key: string, opts: { liftMin?: number } = {}) {
  const P = (c: LessonCtx) => c.refs.pallets[key];
  return [
    {
      text: 'Acercate al pallet de frente y alineado con las aberturas, con las horquillas bajas.',
      hint: 'Avanzá despacio. Si no quedás derecho, retrocedé y corregí: es mejor que forzar.',
      marker: (c: LessonCtx) => above(P(c)),
      check: (c: LessonCtx) => c.aligned(P(c), 7) && c.insertionGap(P(c)) < 1.3 && Math.abs(c.lateralOffset(P(c))) < 0.12,
    },
    {
      text: 'Entrá despacio hasta que la carga quede contra el respaldo de las horquillas.',
      hint: 'Usá el pedal de avance lento (Shift / L2 suave) para acercarte centímetro a centímetro.',
      marker: (c: LessonCtx) => above(P(c)),
      check: (c: LessonCtx) => c.insertionGap(P(c)) < 0.1 && c.touching(P(c)),
    },
    {
      text: 'Elevá la carga 15–20 cm del piso.',
      hint: '↑ / stick derecho arriba / tirar de la palanca de elevación. Acelerá en neutral para que suba más rápido.',
      check: (c: LessonCtx) => c.carried(P(c)) && c.t.forkHeight > (opts.liftMin ?? 0.12) && c.t.forkHeight < 0.45,
      hold: 0.4,
    },
    {
      text: 'Inclinalá hacia atrás para asegurarla contra el respaldo.',
      hint: 'R / stick derecho a la izquierda / tirar de la palanca de inclinación.',
      check: (c: LessonCtx) => c.t.tiltDeg > 3 && c.carried(P(c)),
    },
  ];
}

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ 1
  {
    id: 'l1',
    num: 1,
    title: 'Primeros pasos',
    summary: 'Rutina de puesta en marcha, avanzar, frenar, marcha atrás y estacionar.',
    objectives: ['Cinturón y arranque con la palanca en N', 'Freno de mano y palanca de marcha', 'Avanzar, frenar y retroceder mirando hacia atrás', 'Estacionar correctamente'],
    spec: 'puma25',
    par: 100,
    start: { x: -8, z: -8, yawDeg: 0, engineOn: false },
    pedestrians: false,
    setup(world, refs) {
      addZone(world, refs, 'meta', 'AVANCE', -8, 0, 4.4, 3.4, 4.6, 0x2e9b4e);
      addZone(world, refs, 'retorno', 'RETORNO', -8, 0, -8.6, 3.4, 4.6, 0x2b6cd6);
    },
    steps: [
      { text: 'Sentate y abrochate el cinturón de seguridad.', hint: 'B · L3 · o clic en la hebilla (a la derecha del asiento).', check: (c) => c.c.seatbelt },
      { text: 'Con la palanca de marcha en N, girá la llave para arrancar.', hint: 'K · ✕ · o clic en la llave (a la derecha del tablero).', check: (c) => c.t.engineRunning },
      { text: 'Soltá el freno de mano.', hint: 'Espacio · ○ · o clic en la palanca roja (a tu izquierda).', check: (c) => !c.c.parkingBrake },
      { text: 'Poné la marcha ADELANTE (F).', hint: 'E · D-pad ↑ · o arrastrá hacia arriba la palanca de marcha.', check: (c) => c.c.direction === 1 },
      {
        text: 'Acelerá suavemente y avanzá hasta la zona verde. Tocá bocina antes de cruzar la senda peatonal.',
        hint: 'W / R2 para acelerar, H / □ para la bocina. El autoelevador avanza solo en ralentí (convertidor de par).',
        marker: (c) => zoneMarker(c.refs.zones.meta),
        check: (c) => c.forkliftIn(c.refs.zones.meta),
      },
      { text: 'Frená y detenete dentro de la zona verde.', hint: 'S / L2. Frená progresivamente.', check: (c) => c.forkliftIn(c.refs.zones.meta) && c.stopped(), hold: 0.6 },
      {
        text: 'Poné MARCHA ATRÁS, mirá hacia atrás y retrocedé hasta la zona azul.',
        hint: 'Q / D-pad ↓. Mantené V (o R3) para girar la cabeza: en reversa siempre se mira hacia atrás.',
        marker: (c) => zoneMarker(c.refs.zones.retorno),
        check: (c) => c.forkliftIn(c.refs.zones.retorno) && c.c.direction === -1,
      },
      { text: 'Detenete, poné la palanca en N y aplicá el freno de mano.', check: (c) => c.stopped() && c.c.direction === 0 && c.c.parkingBrake, hold: 0.4 },
      { text: 'Horquillas apoyadas en el piso y motor apagado: ¡estacionado!', hint: 'Bajá las horquillas al tope (↓) y girá la llave (K).', check: (c) => c.t.forkHeight < 0.075 && !c.t.engineRunning },
    ],
    monitor: hornMonitor,
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'l2',
    num: 2,
    title: 'Dirección trasera',
    summary: 'Slalom entre conos y estacionamiento en reversa. La cola se abre al girar.',
    objectives: ['Entender cómo barre el contrapeso al doblar', 'Pasar por los portones sin tocar conos', 'Estacionar marcha atrás dentro del box'],
    spec: 'puma25',
    par: 140,
    start: { x: -49, z: -52, yawDeg: 90, engineOn: true },
    pedestrians: false,
    setup(world, refs) {
      // portones del slalom: del lado opuesto a cada cono
      for (let i = 0; i < 7; i++) {
        const coneZ = -52 + (i % 2 ? 1.2 : -1.2);
        const gz = coneZ + (i % 2 ? -2.4 : 2.4);
        refs.gates.push({ id: `g${i}`, label: '', center: V(-42 + i * 4.5, 0, gz), width: 2.2, depth: 3.0, yaw: 0, color: 0xffffff, kind: 'meta' });
      }
      addZone(world, refs, 'box', 'BOX', -6, 0, -56.2, 2.7, 4.8, 0x2b6cd6);
      refs.data.gate = 0;
    },
    steps: [
      {
        text: 'Soltá el freno de mano, poné marcha adelante y hacé el slalom siguiendo las flechas.',
        hint: 'Doblá antes de lo que creés: las ruedas que giran son las de atrás. Mirá dónde va el contrapeso.',
        marker: (c) => {
          const g = c.refs.gates[c.refs.data.gate as number];
          return g ? g.center.clone().add(V(0, 1.5, 0)) : null;
        },
        check: (c) => {
          const i = c.refs.data.gate as number;
          const g = c.refs.gates[i];
          if (g && c.world.pointInZone(c.center(), g)) c.refs.data.gate = i + 1;
          return (c.refs.data.gate as number) >= c.refs.gates.length;
        },
        progress: (c) => `${c.refs.data.gate}/${c.refs.gates.length} portones`,
      },
      {
        text: 'Estacioná MARCHA ATRÁS dentro del box azul, derecho y con las horquillas hacia afuera.',
        hint: 'Pasate del box, frená, poné reversa y girá. Mirá hacia atrás (V / R3).',
        marker: (c) => zoneMarker(c.refs.zones.box),
        check: (c) => c.forkliftFullyIn(c.refs.zones.box) && c.yawDiffDeg(0) < 10,
      },
      { text: 'Detenete: palanca en N, freno de mano y horquillas al piso.', check: (c) => c.forkliftFullyIn(c.refs.zones.box) && c.stopped() && c.c.direction === 0 && c.c.parkingBrake && c.t.forkHeight < 0.08, hold: 0.5 },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'l3',
    num: 3,
    title: 'Tomar y trasladar un pallet',
    summary: 'Entrar derecho, elevar, inclinar, trasladar con la carga baja y depositar.',
    objectives: ['Alinear el autoelevador con el pallet', 'Insertar las horquillas hasta el fondo', 'Trasladar a 15–20 cm del piso', 'Depositar y salir sin arrastrar'],
    spec: 'puma25',
    par: 140,
    start: { x: -1, z: 8.5, yawDeg: -90, engineOn: true },
    pedestrians: true,
    setup(world, refs) {
      clearArea(world, V(-6, 0, 7), 7);
      refs.pallets.p = world.addPallet({ cargo: 'cajas', mass: 450, position: V(-8.2, 0.003, 8.5), yaw: Math.PI / 2, sleeping: true });
      addZone(world, refs, 'destino', 'DESTINO', -3.4, 0, 3.6, 2.8, 2.8, 0x2e9b4e);
    },
    steps: [
      ...pickSteps('p'),
      {
        text: 'Retrocedé, girá y llevá la carga hasta la zona DESTINO con las horquillas bajas.',
        hint: 'Nunca circules con la carga alta. Girá despacio: el contrapeso se abre.',
        marker: (c) => zoneMarker(c.refs.zones.destino),
        ghost: (c) => ({ pos: c.refs.zones.destino.center, yaw: 0, size: [1.0, 1.0, 1.0] }),
        check: (c) => c.carried(c.refs.pallets.p) && c.world.pointInZone(c.refs.pallets.p.curPos, c.refs.zones.destino),
      },
      {
        text: 'Detenete, nivelá el mástil y bajá la carga hasta apoyarla en el piso.',
        hint: 'F para nivelar (inclinación ~0°) y ↓ para bajar.',
        check: (c) => c.palletIn(c.refs.pallets.p, c.refs.zones.destino) && !c.carried(c.refs.pallets.p),
      },
      {
        text: 'Retrocedé sacando las horquillas sin arrastrar el pallet.',
        hint: 'Bajá un poco más las horquillas para no rozar el tablero.',
        check: (c) => !c.touching(c.refs.pallets.p) && c.insertionGap(c.refs.pallets.p) > 0.9 && c.palletIn(c.refs.pallets.p, c.refs.zones.destino),
      },
      { text: 'Detenete con las horquillas bajas y el freno de mano puesto.', check: (c) => c.stopped() && c.c.parkingBrake && c.t.forkHeight < 0.15, hold: 0.4 },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'l4',
    num: 4,
    title: 'Estibar en estantería',
    summary: 'Ubicar un pallet en el segundo nivel de un rack selectivo (1,50 m).',
    objectives: ['Acercarse con la carga baja', 'Elevar por encima de la viga sin golpear', 'Apoyar nivelado y salir'],
    spec: 'puma25',
    par: 160,
    start: { x: 3.23, z: 2.7, yawDeg: 0, engineOn: true },
    pedestrians: true,
    setup(world, refs) {
      const slot = rackSlot(world, 3, 1, 0);
      clearSlot(world, slot);
      clearArea(world, V(slot.center.x, 0, 6), 3, -1, 0.5);
      refs.slots.s = slot;
      refs.pallets.p = world.addPallet({ cargo: 'cajas', mass: 520, position: V(slot.center.x, 0.003, 6.0), yaw: 0, sleeping: true });
    },
    steps: [
      ...pickSteps('p'),
      {
        text: 'Avanzá hacia la estantería con la carga baja y detenete a ~1 m del hueco marcado.',
        marker: (c) => c.refs.slots.s.center.clone().add(V(0, 2.2, 0)),
        ghost: (c) => slotGhost(c.refs.slots.s, c.refs.pallets.p),
        check: (c) => c.carried(c.refs.pallets.p) && c.refs.pallets.p.curPos.z + 0.6 > 10.0 && c.refs.pallets.p.curPos.z + 0.6 < 11.6 && c.stopped(),
        hold: 0.3,
      },
      {
        text: 'Elevá la carga por encima de la viga (viga a 1,50 m: horquillas a más de 1,65 m).',
        hint: 'Con el autoelevador detenido. Mirá la altura en el tablero o en el panel del mástil.',
        ghost: (c) => slotGhost(c.refs.slots.s, c.refs.pallets.p),
        check: (c) => c.carried(c.refs.pallets.p) && c.t.forkHeight > c.refs.slots.s.center.y + 0.16,
      },
      {
        text: 'Avanzá muy despacio hasta que la carga quede sobre las vigas.',
        hint: 'Avance lento (Shift / L2 a medias). Usá el desplazador lateral (← →) para centrar.',
        ghost: (c) => slotGhost(c.refs.slots.s, c.refs.pallets.p),
        check: (c) => c.carried(c.refs.pallets.p) && c.palletOverSlot(c.refs.pallets.p, c.refs.slots.s, 0.2, 0.18),
      },
      {
        text: 'Nivelá el mástil y bajá hasta apoyar la carga en las vigas.',
        ghost: (c) => slotGhost(c.refs.slots.s, c.refs.pallets.p),
        check: (c) => c.palletInSlot(c.refs.pallets.p, c.refs.slots.s) && !c.carried(c.refs.pallets.p),
      },
      {
        text: 'Bajá unos centímetros más y retrocedé hasta sacar las horquillas.',
        check: (c) => !c.touching(c.refs.pallets.p) && c.insertionGap(c.refs.pallets.p) > 1.2 && c.palletInSlot(c.refs.pallets.p, c.refs.slots.s),
      },
      {
        text: 'Bajá las horquillas a altura de traslado (menos de 30 cm) antes de circular.',
        check: (c) => c.t.forkHeight < 0.3 && c.stopped(),
        hold: 0.3,
      },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'l5',
    num: 5,
    title: 'Retirar de altura',
    summary: 'Sacar un pallet del tercer nivel (3,00 m) y bajarlo a la zona de destino.',
    objectives: ['Ubicarse frente al hueco', 'Embocar las aberturas a 3 m de altura', 'Bajar la carga antes de circular'],
    spec: 'puma25',
    par: 170,
    start: { x: 3.23, z: 5.6, yawDeg: 0, engineOn: true },
    pedestrians: true,
    setup(world, refs) {
      const slot = rackSlot(world, 3, 2, 0);
      clearSlot(world, slot);
      refs.slots.s = slot;
      const p = slot.center.clone();
      p.y += 0.003;
      refs.pallets.p = world.addPallet({ cargo: 'cajas', mass: 420, position: p, yaw: slot.yaw, sleeping: true });
      clearArea(world, V(-2.5, 0, 7.5), 2.5);
      addZone(world, refs, 'destino', 'DESTINO', -2.6, 0, 7.6, 2.8, 2.8, 0x2e9b4e);
    },
    steps: [
      {
        text: 'Acercate a la estantería y detenete derecho, a ~1 m del pallet marcado.',
        marker: (c) => above(c.refs.pallets.p, 0.5),
        check: (c) => c.forkFace().z > 9.5 && c.forkFace().z < 10.7 && c.yawDiffDeg(0) < 5 && Math.abs(c.forkFace().x - c.refs.slots.s.center.x) < 0.15 && c.stopped(),
        hold: 0.3,
      },
      {
        text: 'Elevá las horquillas a la altura de las aberturas del pallet (≈3,07 m).',
        hint: 'Deben entrar entre la viga y el tablero: entre 3,05 y 3,09 m. Usá Ctrl (mando fino) o el stick suave.',
        marker: (c) => above(c.refs.pallets.p, 0.5),
        check: (c) => c.t.forkHeight > c.refs.slots.s.center.y + 0.045 && c.t.forkHeight < c.refs.slots.s.center.y + 0.097,
        hold: 0.3,
      },
      {
        text: 'Avanzá despacio hasta el fondo, sin empujar el pallet.',
        check: (c) => c.insertionGap(c.refs.pallets.p) < 0.12 && c.touching(c.refs.pallets.p),
      },
      { text: 'Elevá unos centímetros para despegar la carga de las vigas.', check: (c) => c.carried(c.refs.pallets.p), hold: 0.3 },
      {
        text: 'Retrocedé despacio hasta sacar la carga del rack.',
        check: (c) => c.carried(c.refs.pallets.p) && c.refs.pallets.p.curPos.z < 10.7,
      },
      {
        text: 'Detenete y bajá la carga a altura de traslado (15–20 cm) ANTES de circular.',
        check: (c) => c.carried(c.refs.pallets.p) && c.t.forkHeight < 0.4 && c.stopped(),
      },
      {
        text: 'Llevá la carga a la zona DESTINO, depositala y retirá las horquillas.',
        marker: (c) => zoneMarker(c.refs.zones.destino),
        check: (c) => c.palletIn(c.refs.pallets.p, c.refs.zones.destino) && !c.touching(c.refs.pallets.p) && c.insertionGap(c.refs.pallets.p) > 0.6,
      },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'l6',
    num: 6,
    title: 'Carga de camión',
    summary: 'Cargar tres pallets en un camión playo por el costado.',
    objectives: ['Elevar a la altura de la caja (1,30 m) antes de acercarse', 'Depositar en el hueco marcado', 'No golpear el camión'],
    spec: 'puma25',
    par: 420,
    start: { x: -14, z: -4.6, yawDeg: 180, engineOn: true },
    pedestrians: true,
    setup(world, refs) {
      const truck = world.trucks.find((t) => t.id === 1)!;
      refs.truck = truck;
      const near = truck.slots.filter((s) => s.id.includes('-D')).sort((a, b) => a.center.x - b.center.x);
      const targets = [near[2], near[4], near[6]];
      targets.forEach((s, i) => (refs.slots[`t${i}`] = s));
      const xs = [-16.2, -14, -11.8];
      const cargos = ['cemento', 'bebidas', 'cajas'];
      clearArea(world, V(-14, 0, -12.6), 4);
      xs.forEach((x, i) => (refs.pallets[`p${i}`] = world.addPallet({ cargo: cargos[i], mass: [900, 760, 380][i], position: V(x, 0.003, -12.6), yaw: Math.PI, sleeping: true })));
    },
    steps: [
      {
        text: 'Llevá los 3 pallets de RECEPCIÓN al camión del patio y cargalos del lado cercano, en los huecos marcados.',
        hint: 'Salí por el portón con la carga baja. Frente al camión: detenete, elevá a más de 1,45 m, entrá despacio y apoyá.',
        marker: (c) => {
          for (let i = 0; i < 3; i++) {
            const p = c.refs.pallets[`p${i}`];
            if (!onTruck(c, p)) return above(p, 0.6);
          }
          return null;
        },
        ghost: (c) => {
          for (let i = 0; i < 3; i++) {
            const s = c.refs.slots[`t${i}`];
            if (![0, 1, 2].some((j) => onSlot(c, c.refs.pallets[`p${j}`], s))) return slotGhost(s, c.refs.pallets.p0);
          }
          return null;
        },
        check: (c) => [0, 1, 2].every((i) => onTruck(c, c.refs.pallets[`p${i}`]) && !c.touching(c.refs.pallets[`p${i}`])),
        progress: (c) => `${[0, 1, 2].filter((i) => onTruck(c, c.refs.pallets[`p${i}`])).length}/3 cargados`,
      },
      {
        text: 'Alejate del camión, bajá las horquillas y detenete con freno de mano.',
        check: (c) => c.dist2D(c.center(), c.refs.truck!.center) > 5 && c.t.forkHeight < 0.25 && c.stopped() && c.c.parkingBrake,
        hold: 0.3,
      },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'l7',
    num: 7,
    title: 'Rampa con carga',
    summary: 'Subir una rampa del 13 % con carga y bajar sin carga, siempre de la forma segura.',
    objectives: ['Con carga: la carga siempre del lado de arriba', 'No girar sobre la rampa', 'Sin carga: horquillas hacia abajo de la pendiente'],
    spec: 'puma25',
    par: 200,
    start: { x: 6.5, z: -22.5, yawDeg: 90, engineOn: true },
    pedestrians: false,
    setup(world, refs) {
      clearArea(world, V(22, 0, -41), 7, 0.8, 3);
      refs.pallets.p = world.addPallet({ cargo: 'cemento', mass: 1100, position: V(12.6, 0.003, -22.5), yaw: Math.PI / 2, sleeping: true });
      addZone(world, refs, 'destino', 'DESTINO', 19.2, 1.2, -43.6, 2.6, 2.6, 0x2e9b4e);
      refs.zones.plataforma = { id: 'plataforma', label: '', center: V(22, 1.2, -41), width: 11, depth: 10, yaw: 0, color: 0, kind: 'meta' };
    },
    steps: [
      ...pickSteps('p'),
      {
        text: 'Subí la rampa DE FRENTE, con la carga del lado de arriba y sin girar.',
        hint: 'Alineate con la rampa ANTES de entrar. Acelerá parejo: con carga cuesta más subir.',
        marker: () => V(22, 2.6, -31),
        check: (c) => c.fl.position.y > 1.0 && c.forkliftIn(c.refs.zones.plataforma) && c.carried(c.refs.pallets.p),
      },
      {
        text: 'Depositá la carga en la zona marcada de la plataforma y sacá las horquillas.',
        marker: (c) => zoneMarker(c.refs.zones.destino),
        check: (c) => c.palletIn(c.refs.pallets.p, c.refs.zones.destino) && !c.touching(c.refs.pallets.p) && c.insertionGap(c.refs.pallets.p) > 0.6,
      },
      {
        text: 'Sin carga, girá en la plataforma y bajá la rampa DE FRENTE y despacio (horquillas hacia abajo).',
        hint: 'Subí las horquillas ~20 cm para que las puntas no toquen el piso al final de la rampa. Sin carga el peso está atrás: así es más estable en bajada.',
        check: (c) => c.fl.position.y < 0.1 && c.fl.position.z > -26.5,
      },
      { text: 'Detenete y poné el freno de mano.', check: (c) => c.stopped() && c.c.parkingBrake, hold: 0.3 },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'l8',
    num: 8,
    title: 'Examen final',
    summary: 'Prueba completa con reglas estrictas: arranque, estiba, retiro de altura y estacionamiento.',
    objectives: ['Infracciones: −10 c/u', 'Choques fuertes y caída de carga: desaprobado', 'Peatones en el depósito: ¡atención!'],
    spec: 'puma25',
    par: 520,
    start: { x: -8, z: -8, yawDeg: 0, engineOn: false },
    pedestrians: true,
    strict: true,
    setup(world, refs) {
      const s2 = rackSlot(world, 3, 1, 1);
      const s3 = rackSlot(world, 3, 2, 0);
      clearSlot(world, s2);
      clearSlot(world, s3);
      refs.slots.s2 = s2;
      refs.slots.s3 = s3;
      const p3 = s3.center.clone();
      p3.y += 0.003;
      refs.pallets.alto = world.addPallet({ cargo: 'cajas', mass: 380, position: p3, yaw: s3.yaw, sleeping: true });
      refs.pallets.rec = world.addPallet({ cargo: 'ceramicos', mass: 1250, position: V(-14, 0.003, -12.6), yaw: 0, sleeping: true });
      refs.zones.despacho = world.zones.find((z) => z.id === 'despacho')!;
      refs.zones.estacion = world.zones.find((z) => z.id === 'estacion')!;
    },
    steps: [
      { text: 'Rutina de puesta en marcha: cinturón, palanca en N, arranque y freno de mano liberado.', check: (c) => c.c.seatbelt && c.t.engineRunning && !c.c.parkingBrake },
      {
        text: 'Tomá el pallet de cerámicos de la zona RECEPCIÓN.',
        marker: (c) => above(c.refs.pallets.rec),
        check: (c) => c.carried(c.refs.pallets.rec) && c.t.forkHeight > 0.1 && c.t.forkHeight < 0.45,
      },
      {
        text: 'Estibalo en el segundo nivel de la estantería C (hueco marcado).',
        marker: (c) => c.refs.slots.s2.center.clone().add(V(0, 2.4, 0)),
        ghost: (c) => slotGhost(c.refs.slots.s2, c.refs.pallets.rec),
        check: (c) => c.palletInSlot(c.refs.pallets.rec, c.refs.slots.s2) && !c.touching(c.refs.pallets.rec) && c.insertionGap(c.refs.pallets.rec) > 1.0 && c.t.forkHeight < 0.3,
      },
      {
        text: 'Retirá el pallet de cajas del tercer nivel y llevalo a la zona DESPACHO.',
        marker: (c) => (c.palletIn(c.refs.pallets.alto, c.refs.zones.despacho) ? null : c.carried(c.refs.pallets.alto) ? zoneMarker(c.refs.zones.despacho) : above(c.refs.pallets.alto, 0.5)),
        check: (c) => c.palletIn(c.refs.pallets.alto, c.refs.zones.despacho) && !c.touching(c.refs.pallets.alto) && c.insertionGap(c.refs.pallets.alto) > 0.8,
      },
      {
        text: 'Estacioná en la zona de CARGA: horquillas al piso, palanca en N, freno de mano y motor apagado.',
        marker: (c) => zoneMarker(c.refs.zones.estacion),
        check: (c) => c.forkliftIn(c.refs.zones.estacion) && c.t.forkHeight < 0.08 && c.c.direction === 0 && c.c.parkingBrake && !c.t.engineRunning,
      },
    ],
    monitor: hornMonitor,
  },
];

/** ¿El pallet está apoyado sobre la caja del camión? */
function onTruck(c: LessonCtx, p: PalletEntity): boolean {
  const t = c.refs.truck!;
  const local = p.curPos.clone().sub(t.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), -t.yaw);
  return Math.abs(p.curPos.y - t.bedHeight) < 0.1 && Math.abs(local.x) < 1.25 && Math.abs(local.z) < 6 && !c.carried(p) && c.world.palletUpright(p);
}

function onSlot(c: LessonCtx, p: PalletEntity, s: Slot) {
  return c.world.palletInSlot(p, s, 0.5, 0.12);
}

/** Penaliza cruzar la senda peatonal sin tocar bocina. */
function hornMonitor(c: LessonCtx, dt: number) {
  const f = c.flags;
  f.hornAgo = c.c.horn ? 0 : ((f.hornAgo as number) ?? 99) + dt;
  const p = c.center();
  const inside = p.x > -30 && p.x < 30 && p.z > -20 && p.z < 20;
  const onWalk = inside && p.z > -1.9 && p.z < 0.9;
  if (onWalk && !f.onWalk && Math.abs(c.t.speedKmh) > 1) {
    if ((f.hornAgo as number) > 6) c.penalize(3, 'Cruzaste la senda peatonal sin tocar bocina');
  }
  f.onWalk = onWalk;
}

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export type { LessonRefs };
