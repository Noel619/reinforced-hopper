// Piloto automático para pruebas: se inyecta en la página del juego.
(() => {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const AP = {
    drive: null, // { x, z, reverse, speed, arrive, onArrive }
    manual: false,
    lift: null, // altura objetivo de horquillas
    tilt: null, // grados
    log: [],
    simTime: 0,
    s() { return window.__app.session; },
    fl() { return this.s().fl; },
    install() {
      const s = this.s();
      window.__app.mapper.external = true;
      const orig = s.frame.bind(s);
      s.frame = (dt) => { this.step(dt * s.timeScale); orig(dt); this.simTime += dt * s.timeScale; };
    },
    pose() {
      const fl = this.fl();
      const p = fl.position;
      const yaw = fl.yaw;
      return { x: p.x, y: p.y, z: p.z, yaw, fx: Math.sin(yaw), fz: Math.cos(yaw) };
    },
    step(dt) {
      const fl = this.fl();
      const c = fl.controls;
      const t = fl.telemetry;
      // horquillas
      if (this.lift !== null) {
        const e = this.lift - t.forkHeight;
        c.lift = Math.abs(e) < 0.006 ? 0 : clamp(e * 6, -1, 1);
        if (Math.abs(c.lift) < 0.12 && Math.abs(e) > 0.006) c.lift = 0.12 * Math.sign(e);
        // acelerar en neutral para elevar más rápido
      } else c.lift = 0;
      if (this.tilt !== null) {
        const e = this.tilt - t.tiltDeg;
        c.tilt = Math.abs(e) < 0.25 ? 0 : clamp(e * 0.6, -1, 1);
      } else c.tilt = 0;
      // conducción
      const d = this.drive;
      if (this.manual) return;
      if (!d) {
        c.throttle = 0;
        c.inching = 0;
        c.brake = Math.abs(t.speed) > 0.05 ? 1 : 0.3;
        if (fl.controls.direction !== 0 && Math.abs(t.speed) < 0.05 && this.lift !== null) {
          // revolucionar para elevar
        }
        return;
      }
      const P = this.pose();
      // seguidor "pure pursuit" sobre el eje delantero (eje fijo de un autoelevador)
      const path = d.path;
      const Ld = d.lookahead ?? 1.3;
      while (d.i < path.length - 1 && Math.hypot(path[d.i].x - P.x, path[d.i].z - P.z) < Ld) d.i++;
      const goal = path[path.length - 1];
      const distEnd = Math.hypot(goal.x - P.x, goal.z - P.z);
      let tgt = path[d.i];
      if (d.i > 0) {
        // punto del segmento a distancia Ld
        const a = path[d.i - 1], b = path[d.i];
        const ex = b.x - a.x, ez = b.z - a.z;
        const fx = a.x - P.x, fz = a.z - P.z;
        const A = ex * ex + ez * ez, B = 2 * (fx * ex + fz * ez), C = fx * fx + fz * fz - Ld * Ld;
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const t2 = (-B + Math.sqrt(disc)) / (2 * A);
          if (t2 >= 0 && t2 <= 1) tgt = { x: a.x + ex * t2, z: a.z + ez * t2 };
        }
      }
      const dx = tgt.x - P.x, dz = tgt.z - P.z;
      const dd = Math.max(0.05, Math.hypot(dx, dz));
      const headingVel = d.reverse ? P.yaw + Math.PI : P.yaw;
      const alpha = wrap(Math.atan2(dx, dz) - headingVel);
      const spec = fl.spec;
      const rInner = spec.wheelbase / Math.tan(spec.maxInnerSteerDeg * Math.PI / 180);
      const dMax = Math.atan(spec.wheelbase / (rInner + spec.rearTrack / 2));
      const kappa = (2 * Math.sin(alpha)) / dd;
      const delta = Math.atan(kappa * spec.wheelbase);
      c.direction = d.reverse ? -1 : 1;
      c.parkingBrake = false;
      c.handwheel = clamp((d.reverse ? -1 : 1) * delta / dMax, -1, 1);
      const arrived = d.i >= path.length - 1 && (distEnd < (d.arrive ?? 0.3) || (distEnd < 1.0 && Math.abs(alpha) > 2.0));
      const steerFrac = Math.min(1, Math.abs(delta) / dMax);
      let vdes = (d.speed ?? 1.5) * (1 - 0.55 * steerFrac);
      if (d.i >= path.length - 1) vdes = Math.min(vdes, 0.12 + distEnd * 0.5);
      const v = Math.abs(t.speed);
      if (arrived) {
        c.throttle = 0;
        c.inching = 1;
        c.brake = 1;
        if (v < 0.05) {
          const cb = d.onArrive;
          this.drive = null;
          if (cb) cb();
        }
        return;
      }
      // si no avanza (pendiente, carga), aumentar el empuje progresivamente
      if (v < 0.08 && vdes > 0.05) d.stall = Math.min(1, (d.stall ?? 0) + dt * 0.6);
      else d.stall = Math.max(0, (d.stall ?? 0) - dt * 0.5);
      if (v < vdes) {
        c.brake = 0;
        c.throttle = clamp((vdes - v) * 0.9 + (vdes > 1 ? 0.2 : 0) + d.stall * 0.6, 0, 1);
        c.inching = vdes < 0.6 ? 0.35 * (1 - d.stall) : 0;
      } else {
        c.throttle = 0;
        c.inching = 0.45;
        c.brake = clamp((v - vdes) * 1.2, 0, 1);
      }
    },
    async frames(n = 1) { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); },
    async until(fn, timeout = 60, label = '') {
      const t0 = this.simTime;
      const r0 = performance.now();
      while (!fn()) {
        await this.frames(1);
        if (this.simTime - t0 > timeout || performance.now() - r0 > timeout * 1000) throw new Error('timeout: ' + label);
      }
    },
    async goTo(x, z, opts = {}) {
      return this.goPath([{ x, z }], opts);
    },
    /** Sigue una trayectoria (puntos del eje delantero). */
    async goPath(points, opts = {}) {
      const x = points[points.length - 1].x, z = points[points.length - 1].z;
      let done = false;
      const P0 = this.pose();
      this.drive = { path: [{ x: P0.x, z: P0.z }, ...points], i: 1, ...opts, onArrive: () => (done = true) };
      try {
        await this.until(() => done, opts.timeout ?? 60, `goPath(${x.toFixed(1)},${z.toFixed(1)})`);
      } catch (e) {
        const p = this.pose();
        this.drive = null;
        throw new Error(String(e) + ` pos=(${p.x.toFixed(2)},${p.z.toFixed(2)}) yaw=${(p.yaw * 57.3).toFixed(0)} v=${this.fl().telemetry.speedKmh.toFixed(1)}`);
      }
    },
    async liftTo(h, tol = 0.01, timeout = 30) {
      this.lift = h;
      const fl = this.fl();
      await this.until(() => Math.abs(fl.telemetry.forkHeight - h) < tol, timeout, 'lift ' + h);
    },
    async tiltTo(deg, timeout = 15) {
      this.tilt = deg;
      const fl = this.fl();
      await this.until(() => Math.abs(fl.telemetry.tiltDeg - deg) < 0.4, timeout, 'tilt ' + deg);
    },
    /** Punto del eje delantero para que la cara de horquillas quede en (x,z) con el rumbo dado. */
    axleFor(x, z, heading) {
      const off = this.fl().spec.forkFaceOffset;
      return { x: x - Math.sin(heading) * off, z: z - Math.cos(heading) * off };
    },
    lessonState() {
      const m = this.s().mode;
      return { step: m.step, score: m.score, log: m.log.map((l) => `-${l.pts} ${l.reason}`), finished: m.finished, time: m.time };
    },
  };
  window.AP = AP;
})();
