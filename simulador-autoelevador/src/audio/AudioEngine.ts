import type { ForkliftPhysics } from '../sim/forklift.ts';

/**
 * Sonido sintetizado con WebAudio (sin archivos):
 * motor (diésel/GLP/eléctrico) según RPM y carga, bomba hidráulica y válvula de alivio,
 * alarma de retroceso, bocina, chirrido de neumáticos, golpes y clics.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private eng: { o1: OscillatorNode; o2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; clatter: GainNode; clatterMod: OscillatorNode; clatterDepth: GainNode; clatterFilter: BiquadFilterNode } | null = null;
  private elec: { o: OscillatorNode; o2: OscillatorNode; gain: GainNode } | null = null;
  private hyd!: { o: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; hiss: GainNode };
  private beeper!: { o: OscillatorNode; gain: GainNode };
  private horn!: { gain: GainNode };
  private squeal!: { gain: GainNode; filter: BiquadFilterNode };
  private starter!: { o: OscillatorNode; gain: GainNode };
  private ambient!: GainNode;
  volume = 0.8;
  private beepPhase = 0;
  private power: string = '';
  muted = false;

  /** Debe llamarse desde un gesto del usuario (clic / tecla). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    // ruido blanco
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // bomba hidráulica
    {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 220;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(filter).connect(gain).connect(this.master);
      o.start();
      const n = this.noiseSource();
      const nf = ctx.createBiquadFilter();
      nf.type = 'highpass';
      nf.frequency.value = 2500;
      const hiss = ctx.createGain();
      hiss.gain.value = 0;
      n.connect(nf).connect(hiss).connect(this.master);
      this.hyd = { o, filter, gain, hiss };
    }
    // alarma de retroceso
    {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1150;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(f).connect(gain).connect(this.master);
      o.start();
      this.beeper = { o, gain };
    }
    // bocina (dos tonos)
    {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      for (const fr of [415, 520]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
      }
      f.connect(gain).connect(this.master);
      this.horn = { gain };
    }
    // chirrido de neumáticos
    {
      const n = this.noiseSource();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      n.connect(filter).connect(gain).connect(this.master);
      this.squeal = { gain, filter };
    }
    // burro de arranque
    {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 110;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 30;
      lfo.connect(lfoGain).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(f).connect(gain).connect(this.master);
      o.start();
      lfo.start();
      this.starter = { o, gain };
    }
    // ambiente del galpón
    {
      const n = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      this.ambient = ctx.createGain();
      this.ambient.gain.value = 0.025;
      n.connect(f).connect(this.ambient).connect(this.master);
    }
  }

  private noiseSource(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    n.start(0, Math.random() * 1.5);
    return n;
  }

  /** Configura el sonido de motor según el tipo de energía del modelo. */
  private setupEngine(power: string) {
    const ctx = this.ctx!;
    if (this.eng) {
      this.eng.gain.disconnect();
      this.eng.o1.stop();
      this.eng.o2.stop();
      this.eng.clatterMod.stop();
      this.eng = null;
    }
    if (this.elec) {
      this.elec.gain.disconnect();
      this.elec.o.stop();
      this.elec.o2.stop();
      this.elec = null;
    }
    this.power = power;
    if (power === 'electrico') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      o.connect(gain);
      o2.connect(gain);
      gain.connect(this.master);
      o.start();
      o2.start();
      this.elec = { o, o2, gain };
      return;
    }
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = power === 'diesel' ? 'square' : 'triangle';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain).connect(this.master);
    // traqueteo diésel: ruido modulado a la frecuencia de encendido
    const n = this.noiseSource();
    const clatterFilter = ctx.createBiquadFilter();
    clatterFilter.type = 'bandpass';
    clatterFilter.frequency.value = power === 'diesel' ? 1100 : 700;
    clatterFilter.Q.value = 1.2;
    const clatter = ctx.createGain();
    clatter.gain.value = 0;
    const clatterMod = ctx.createOscillator();
    clatterMod.type = 'square';
    const clatterDepth = ctx.createGain();
    clatterDepth.gain.value = 0;
    clatterMod.connect(clatterDepth).connect(clatter.gain);
    n.connect(clatterFilter).connect(clatter).connect(gain);
    o1.start();
    o2.start();
    clatterMod.start();
    this.eng = { o1, o2, filter, gain, clatter, clatterMod, clatterDepth, clatterFilter };
  }

  update(dt: number, fl: ForkliftPhysics, cabView: boolean, reverseAlarm: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const t = fl.telemetry;
    const c = fl.controls;
    if (this.power !== fl.spec.power) this.setupEngine(fl.spec.power);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.05);
    const near = cabView ? 1 : 0.55;
    const smooth = 0.04;
    if (this.eng) {
      const running = t.engineRunning;
      const fire = (t.rpm / 60) * 2; // 4 cilindros, 4 tiempos
      const load = t.engineLoad;
      this.eng.o1.frequency.setTargetAtTime(Math.max(8, fire), now, smooth);
      this.eng.o2.frequency.setTargetAtTime(Math.max(8, fire * 2.01), now, smooth);
      this.eng.clatterMod.frequency.setTargetAtTime(Math.max(5, fire), now, smooth);
      this.eng.filter.frequency.setTargetAtTime(160 + t.rpm * 0.25 + load * 600, now, smooth);
      const vol = running ? (0.16 + 0.22 * Math.min(1, t.rpm / fl.spec.maxRpm) + 0.12 * load) * near : 0;
      this.eng.gain.gain.setTargetAtTime(vol, now, 0.08);
      const clat = fl.spec.power === 'diesel' ? 0.5 + load * 0.4 : 0.15;
      this.eng.clatter.gain.setTargetAtTime(running ? clat * 0.5 : 0, now, smooth);
      this.eng.clatterDepth.gain.setTargetAtTime(running ? clat * 0.5 : 0, now, smooth);
    }
    if (this.elec) {
      const sp = Math.abs(t.speed);
      const f = 180 + sp * 260;
      this.elec.o.frequency.setTargetAtTime(f, now, smooth);
      this.elec.o2.frequency.setTargetAtTime(f * 3.02, now, smooth);
      const vol = t.engineRunning ? (0.01 + Math.min(0.12, sp * 0.02 + t.engineLoad * 0.08)) * near : 0;
      this.elec.gain.gain.setTargetAtTime(vol, now, 0.05);
    }
    // arranque
    this.starter.gain.gain.setTargetAtTime(t.cranking ? 0.18 * near : 0, now, 0.03);
    // hidráulica
    const activity = Math.max(Math.abs(c.lift), Math.abs(c.tilt), Math.abs(c.sideShift), Math.abs(c.spread));
    const flowing = t.engineRunning && activity > 0.06;
    const relief = flowing && t.reliefActive;
    const baseF = fl.spec.power === 'electrico' ? 380 + activity * 500 : 200 + (t.rpm / fl.spec.maxRpm) * 300;
    this.hyd.o.frequency.setTargetAtTime(relief ? baseF * 2.2 : baseF, now, 0.05);
    this.hyd.filter.frequency.setTargetAtTime(relief ? 1800 : 700, now, 0.05);
    this.hyd.gain.gain.setTargetAtTime(flowing ? (relief ? 0.09 : 0.05 * activity) * near : 0, now, 0.05);
    this.hyd.hiss.gain.setTargetAtTime(relief ? 0.05 * near : flowing && c.lift < -0.06 ? 0.015 * near : 0, now, 0.05);
    // alarma de retroceso
    if (reverseAlarm && c.direction === -1 && t.engineRunning) {
      this.beepPhase += dt;
      const on = this.beepPhase % 1.0 < 0.5;
      this.beeper.gain.gain.setTargetAtTime(on ? 0.07 : 0, now, 0.005);
    } else {
      this.beepPhase = 0;
      this.beeper.gain.gain.setTargetAtTime(0, now, 0.01);
    }
    this.horn.gain.gain.setTargetAtTime(c.horn && (c.ignition || t.engineRunning) ? 0.13 : 0, now, 0.01);
    const slip = t.wheelsSlipping && Math.abs(t.speed) > 0.6;
    this.squeal.gain.gain.setTargetAtTime(slip ? 0.06 * near : 0, now, 0.05);
  }

  /** Golpe: metal, madera o genérico. */
  impact(strength: number, kind: 'metal' | 'wood' | 'thud' = 'thud') {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'metal' ? 1600 : kind === 'wood' ? 380 : 160;
    f.Q.value = kind === 'metal' ? 8 : 1.2;
    const g = ctx.createGain();
    const vol = Math.min(0.9, 0.12 + strength * 0.8);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'metal' ? 0.7 : 0.35));
    n.connect(f).connect(g).connect(this.master);
    n.start(now, Math.random());
    n.stop(now + 0.8);
    if (kind === 'metal') {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 420 + Math.random() * 300;
      const og = ctx.createGain();
      og.gain.setValueAtTime(vol * 0.25, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      o.connect(og).connect(this.master);
      o.start(now);
      o.stop(now + 1);
    }
  }

  /** Clic mecánico (palancas, freno de mano, llave). */
  click(kind: 'light' | 'ratchet' = 'light') {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const reps = kind === 'ratchet' ? 4 : 1;
    for (let i = 0; i < reps; i++) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = ctx.createGain();
      const t0 = now + i * 0.035;
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
      n.connect(f).connect(g).connect(this.master);
      n.start(t0, Math.random());
      n.stop(t0 + 0.05);
    }
  }

  /** Sonido de éxito / error de la interfaz. */
  chime(good: boolean) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const notes = good ? [660, 880] : [330, 247];
    notes.forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      const t0 = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.35);
    });
  }

  silence() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, now, 0.05);
  }
}
