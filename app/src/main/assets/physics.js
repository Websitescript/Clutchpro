/* Manual-transmission car physics: engine <-> clutch <-> gearbox <-> wheels */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const GEAR = { '-1': -3.45, '0': 0, '1': 3.62, '2': 2.19, '3': 1.48, '4': 1.07, '5': 0.84 };
  const FINAL = 3.9, WR = 0.31, MASS = 1150, IE = 0.2, K = 20, CMAX = 320, WB = 2.6;
  const IDLE = 900, REDLINE = 6500, RPM = 9.5493;

  function engTorque(w, t) {
    const rpm = w * RPM;
    if (rpm > REDLINE) return 0;
    const c = Math.max(0.55, 1 - Math.pow((rpm - 4300) / 4200, 2));
    return 205 * c * t;
  }

  function Car() { this.reset(0, 0, 0); }

  Car.prototype.reset = function (x, z, th) {
    this.x = x; this.z = z; this.th = th;
    this.v = 0; this.w = 0; this.on = false; this.gear = 0;
    this.clutch = 1; this.thr = 0; this.brk = 0; this.hb = 0;
    this.steer = 0; this.steerAng = 0; this.crank = 0; this.stalled = false;
    this.slip = 0; this.wheelRot = 0; this.yawRate = 0; this.acc = 0;
  };

  Car.prototype.engage = function () {
    const e = clamp((0.8 - this.clutch) / 0.45, 0, 1);
    return e * e * (3 - 2 * e);
  };
  Car.prototype.rpm = function () { return this.w * RPM; };
  Car.prototype.start = function () {
    if (this.on || this.crank > 0) return 'already';
    if (this.gear !== 0 && this.clutch < 0.8) return 'clutch';
    this.crank = 0.7; return 'ok';
  };
  Car.prototype.stop = function () { this.on = false; this.crank = 0; };
  Car.prototype.setGear = function (g) {
    if (g === this.gear) return true;
    if (g !== 0 && this.clutch < 0.8) return false;
    this.gear = g; return true;
  };

  Car.prototype._sub = function (h) {
    const ratio = GEAR[this.gear] * FINAL;
    const e = this.engage();
    let w = this.w;
    const rpm = w * RPM;
    const fric = 14 + rpm * 0.007;
    let Te;
    if (this.crank > 0) {
      this.crank -= h;
      Te = (26 - w) * 4;
      if (this.crank <= 0) { this.on = true; w = Math.max(w, 60); }
    } else if (this.on) {
      const idleThr = clamp(0.30 + (IDLE - rpm) / 400 * 0.5, 0, 0.5);
      const pedal = this.thr > 0.02 ? 0.25 + 0.75 * this.thr : 0;
      Te = engTorque(w, Math.max(pedal, idleThr)) - fric;
    } else {
      Te = -fric;
    }
    let Tc = 0, wc = 0;
    if (ratio !== 0) {
      wc = this.v / WR * ratio;
      Tc = clamp(K * (w - wc), -CMAX * e, CMAX * e);
    }
    this.slip = ratio !== 0 ? Math.abs(w - wc) * e : 0;
    w += (Te - Tc) / IE * h;
    if (w < 0) w = 0;
    this.w = w;
    if (this.on && w * RPM < 320) { this.on = false; this.stalled = true; }

    const F = ratio !== 0 ? Tc * ratio / WR * 0.92 : 0;
    const v = this.v;
    const Fn = F - 0.86 * v * Math.abs(v);
    const Fb = this.brk * 9800 + this.hb * 4800 + 170;
    let vn;
    if (Math.abs(v) < 0.02 && Math.abs(Fn) <= Fb) vn = 0;
    else {
      const s = Math.abs(v) < 0.02 ? Math.sign(Fn) : Math.sign(v);
      vn = v + (Fn - s * Fb) / MASS * h;
      if (v !== 0 && vn * v < 0 && Math.abs(F) <= Fb) vn = 0;
    }
    this.v = vn;
    this.wheelRot += vn / WR * h;
  };

  Car.prototype.step = function (dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n, v0 = this.v;
    for (let i = 0; i < n; i++) this._sub(h);
    this.acc += ((this.v - v0) / dt - this.acc) * Math.min(1, dt * 6);
    const maxS = 0.62 / (1 + Math.abs(this.v) * 0.11);
    this.steerAng = this.steer * maxS;
    this.yawRate = this.v / WB * Math.tan(this.steerAng);
    this.th += this.yawRate * dt;
    this.x += Math.sin(this.th) * this.v * dt;
    this.z += Math.cos(this.th) * this.v * dt;
  };

  root.Phys = { Car, GEAR, FINAL, WR, IDLE, REDLINE };
  if (typeof module !== 'undefined') module.exports = root.Phys;
})(typeof window !== 'undefined' ? window : globalThis);
