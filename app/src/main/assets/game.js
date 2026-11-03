(function () {
'use strict';
const T = THREE, Car = Phys.Car;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const store = {
  get(k, d) { try { const v = localStorage.getItem('cp_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cp_' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------------- constants ---------------- */
const N = 6, P = 90, RW = 14, LANE = 3.5, BLK = P - RW;
const cc = i => (i - N / 2) * P;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/* ---------------- renderer / scene ---------------- */
const canvas = $('gl');
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(DPR);
const scene = new T.Scene();
(function sky() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2f8bff'); gr.addColorStop(.55, '#8fd0ff'); gr.addColorStop(1, '#e6f6ff');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  scene.background = new T.CanvasTexture(c);
})();
scene.fog = new T.Fog(0xcfe8ff, 90, 430);
const camera = new T.PerspectiveCamera(62, 1, 0.3, 700);
scene.add(new T.HemisphereLight(0xffffff, 0x8aa878, 0.95));
const sun = new T.DirectionalLight(0xfff3d6, 0.7); sun.position.set(70, 120, 40); scene.add(sun);

/* ---------------- geometry merger ---------------- */
class Merger {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  add(g, m, color, uvScale) {
    const p = g.attributes.position, nn = g.attributes.normal, u = g.attributes.uv;
    const nm = new T.Matrix3().getNormalMatrix(m), v = new T.Vector3(), c = new T.Color(color);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize(); this.nor.push(v.x, v.y, v.z);
      const s = uvScale ? uvScale(i) : [1, 1];
      this.uv.push(u.getX(i) * s[0], u.getY(i) * s[1]);
      this.col.push(c.r, c.g, c.b);
    }
    const ix = g.index; for (let k = 0; k < ix.count; k++) this.idx.push(ix.getX(k) + this.n);
    this.n += p.count;
  }
  build(mat) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(new T.BufferAttribute(new Uint32Array(this.idx), 1));
    return new T.Mesh(g, mat);
  }
}
const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _s = new T.Vector3(), _p = new T.Vector3();
function mat(x, y, z, sx, sy, sz, ry, rx) {
  _e.set(rx || 0, ry || 0, 0); _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)).clone();
}
const BOX = new T.BoxGeometry(1, 1, 1), PLANE = new T.PlaneGeometry(1, 1), CONE = new T.ConeGeometry(1, 1, 7), ICO = new T.IcosahedronGeometry(1, 0);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; } t.anisotropy = 4; return t;
}
const winTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#dfe5ee'; g.fillRect(0, 56, 64, 8);
  g.fillStyle = '#eef2f7'; g.fillRect(10, 10, 44, 40);
  const gr = g.createLinearGradient(0, 12, 0, 48); gr.addColorStop(0, '#9ccbf2'); gr.addColorStop(1, '#4d86c0');
  g.fillStyle = gr; g.fillRect(13, 13, 38, 34);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(13, 13); g.lineTo(30, 13); g.lineTo(13, 34); g.fill();
  g.fillStyle = '#eef2f7'; g.fillRect(31, 13, 2, 34);
}, true);
const roadTex = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = '#4a4f57'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},.03)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = '#f2f2f2'; g.fillRect(2, 0, 2, h); g.fillRect(w - 4, 0, 2, h);
  g.fillStyle = '#ffd34d'; g.fillRect(w / 2 - 1.5, 8, 3, h / 2 - 16);
}, true);
roadTex.wrapS = T.ClampToEdgeWrapping;
const plainRoad = canvasTex(8, 8, (g) => { g.fillStyle = '#4a4f57'; g.fillRect(0, 0, 8, 8); }, true);
const bayTex = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = 'rgba(255,211,77,.28)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('P', w / 2, h / 2 + 14);
});
const shadowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 30); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/* ---------------- world ---------------- */
const solids = []; // {x0,x1,z0,z1}
const PAL = [0xf4b183, 0xa5d6f2, 0xf7e08c, 0xcfe3a2, 0xe8a5c0, 0xf2f2f2, 0xd9c6f0, 0xb8e0d2, 0xf6c28b, 0x9fc5e8];
function buildWorld() {
  const walls = new Merger(), solid = new Merger(), roads = new Merger(), plain = new Merger();
  const HALF = N * P / 2;
  // ground
  scene.add(Object.assign(new T.Mesh(new T.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x86c872 })), {}));
  // intersections + segments
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    plain.add(PLANE, mat(cc(i), 0.075, cc(j), RW, RW, 1, 0, -Math.PI / 2), 0xffffff);
    if (i < N) { // segment along X from (i,j) to (i+1,j)
      const len = P - RW, mid = (cc(i) + cc(i + 1)) / 2;
      roads.add(PLANE, mat(mid, 0.08, cc(j), RW, len, 1, Math.PI / 2, -Math.PI / 2), 0xffffff, () => [1, len / 24]);
    }
    if (j < N) {
      const len = P - RW, mid = (cc(j) + cc(j + 1)) / 2;
      roads.add(PLANE, mat(cc(i), 0.08, mid, RW, len, 1, 0, -Math.PI / 2), 0xffffff, () => [1, len / 24]);
    }
  }
  // blocks
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const bx = (cc(i) + cc(i + 1)) / 2, bz = (cc(j) + cc(j + 1)) / 2, h = BLK / 2;
    solids.push({ x0: bx - h, x1: bx + h, z0: bz - h, z1: bz + h });
    solid.add(BOX, mat(bx, 0.15, bz, BLK, 0.3, BLK), 0xd5d9de);
    const park = Math.random() < 0.18 || (i === N / 2 - 1 && j === N / 2 - 1);
    if (park) {
      solid.add(BOX, mat(bx, 0.32, bz, BLK - 6, 0.06, BLK - 6), 0x7cc464);
      for (let k = 0; k < 16; k++) tree(solid, bx + rand(-h + 6, h - 6), bz + rand(-h + 6, h - 6), rand(.9, 1.5));
    } else {
      for (let a = -1; a <= 1; a += 2) for (let b = -1; b <= 1; b += 2) {
        const cx = bx + a * 17.5, cz = bz + b * 17.5;
        if (Math.random() < 0.12) { for (let k = 0; k < 3; k++) tree(solid, cx + rand(-9, 9), cz + rand(-9, 9), rand(.9, 1.4)); continue; }
        const w = rand(22, 31), d = rand(22, 31), ht = Math.random() < .12 ? rand(50, 75) : rand(10, 40), col = pick(PAL);
        building(walls, solid, cx, cz, w, d, ht, col);
      }
    }
    // sidewalk trees
    for (let s = -2; s <= 2; s++) { const t = s * 17; tree(solid, bx + t, bz + h - 1.5, .85); tree(solid, bx + t, bz - h + 1.5, .85); tree(solid, bx + h - 1.5, bz + t + 8, .85); tree(solid, bx - h + 1.5, bz + t + 8, .85); }
  }
  // outer barrier + skyline ring
  const E = HALF + RW / 2 + 1.5;
  [[0, E, 2 * E + 6, 1], [0, -E, 2 * E + 6, 1], [E, 0, 1, 2 * E], [-E, 0, 1, 2 * E]].forEach(([x, z, w, d]) => {
    solid.add(BOX, mat(x, 0.7, z, w, 1.4, d), 0xe6e0d2);
    solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  });
  for (let k = 0; k < 56; k++) {
    const a = k / 56 * Math.PI * 2, r = HALF + rand(60, 110);
    building(walls, solid, Math.cos(a) * r, Math.sin(a) * r, rand(28, 50), rand(28, 50), rand(30, 95), pick(PAL), true);
  }
  const lam = { vertexColors: true };
  scene.add(walls.build(new T.MeshLambertMaterial({ map: winTex, vertexColors: true })));
  scene.add(solid.build(new T.MeshLambertMaterial(lam)));
  const rm = roads.build(new T.MeshLambertMaterial({ map: roadTex, vertexColors: true })); scene.add(rm);
  const pm = plain.build(new T.MeshLambertMaterial({ map: plainRoad, vertexColors: true })); scene.add(pm);
}
function tree(m, x, z, s) {
  m.add(BOX, mat(x, 1.2 * s + 0.3, z, .5 * s, 2.4 * s, .5 * s), 0x8a5a33);
  m.add(CONE, mat(x, 4.2 * s + .3, z, 2.2 * s, 5 * s, 2.2 * s), pick([0x4fa84a, 0x3f9a47, 0x5cb85c]));
}
function building(walls, solid, x, z, w, d, h, col, free) {
  walls.add(BOX, mat(x, h / 2 + 0.3, z, w, h, d), col, (i) => { const f = Math.floor(i / 4); return f < 2 ? [d / 4, h / 4] : f >= 4 ? [w / 4, h / 4] : [1, 1]; });
  solid.add(BOX, mat(x, h + 0.55, z, w + .4, .5, d + .4), 0xcfd3da);
  if (!free && Math.random() < .4) solid.add(BOX, mat(x + rand(-w / 4, w / 4), h + 1.6, z + rand(-d / 4, d / 4), 3, 1.6, 3), 0xb8bcc4);
}

/* ---------------- cars (models) ---------------- */
function makeCar(color, o) {
  o = o || {};
  const L = o.len || 4.2, W = o.wid || 1.8, H = o.hgt || 1;
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const mB = new T.MeshLambertMaterial({ color }), mG = new T.MeshLambertMaterial({ color: 0x24364f }), mD = new T.MeshLambertMaterial({ color: 0x1b1b1f });
  const mH = new T.MeshBasicMaterial({ color: 0xfff3c0 }), mT = new T.MeshBasicMaterial({ color: 0x7a1010 });
  const bx = (w, h, l, x, y, z, m, p) => { const k = new T.Mesh(BOX, m); k.scale.set(w, h, l); k.position.set(x, y, z); (p || body).add(k); return k; };
  bx(W, 0.55, L, 0, 0.6, 0, mB);
  bx(W - .12, .1, L * .3, 0, .9, L * .32, mB);
  bx(W - .2, .5 * H, L * .5, 0, 1.15 + (H - 1) * .12, -L * .06, mG);
  bx(W - .14, .07, L * .5, 0, 1.43 + (H - 1) * .25, -L * .06, mB);
  bx(W + .04, .22, .16, 0, .4, L / 2, mD); bx(W + .04, .22, .16, 0, .4, -L / 2, mD);
  bx(.34, .14, .05, W / 2 - .3, .68, L / 2 + .01, mH); bx(.34, .14, .05, -W / 2 + .3, .68, L / 2 + .01, mH);
  bx(.42, .14, .05, W / 2 - .3, .68, -L / 2 - .01, mT); bx(.42, .14, .05, -W / 2 + .3, .68, -L / 2 - .01, mT);
  const tire = new T.CylinderGeometry(.31, .31, .24, 14).rotateZ(Math.PI / 2), hub = new T.CylinderGeometry(.17, .17, .26, 8).rotateZ(Math.PI / 2);
  const mS = new T.MeshLambertMaterial({ color: 0xbfc5cc }), front = [], spins = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const piv = new T.Group(); piv.position.set(sx * (W / 2 - .06), .31, sz * L * .33); root.add(piv);
    const sp = new T.Group(); piv.add(sp);
    sp.add(new T.Mesh(tire, mD), new T.Mesh(hub, mS));
    const st = new T.Mesh(BOX, mS); st.scale.set(.27, .08, .1); st.position.set(sx * .02, .22, 0); sp.add(st);
    spins.push(sp); if (sz > 0) front.push(piv);
  }
  const sh = new T.Mesh(PLANE, new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  sh.scale.set(W * 1.7, L * 1.3, 1); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.12; root.add(sh);
  return { root, body, front, spins, tail: mT, L, W };
}
const player = makeCar(0xe8392b, { len: 4.1 });
const cockpit = new T.Group();
(function () {
  const mDash = new T.MeshLambertMaterial({ color: 0x2b2d33 });
  const d = new T.Mesh(BOX, mDash); d.scale.set(1.5, .24, .5); d.position.set(0, .98, .85); cockpit.add(d);
  const wm = new T.Mesh(new T.TorusGeometry(.17, .025, 6, 16), new T.MeshLambertMaterial({ color: 0x15151a }));
  wm.position.set(-.42, 1.04, .55); wm.rotation.x = -1.1; cockpit.add(wm); player.wheelMesh = wm;
  cockpit.visible = false; player.body.add(cockpit);
})();
scene.add(player.root);
const car = new Car();

/* ---------------- traffic ---------------- */
const traffic = [];
const CAR_COLS = [0xf2c230, 0x2f7de1, 0xf5f5f5, 0x3aa65a, 0x9b59b6, 0xff8a3d, 0x2c3e50, 0xd9d9d9, 0xe84393];
const CAR_TYPES = [{ len: 4.0 }, { len: 4.5, hgt: .95 }, { len: 4.7, wid: 1.95, hgt: 1.5 }, { len: 3.6, hgt: 1.05 }];
class AI {
  constructor() { this.m = makeCar(pick(CAR_COLS), pick(CAR_TYPES)); scene.add(this.m.root); this.spawn(true); }
  spawn(init) {
    for (let t = 0; t < 30; t++) {
      const bi = Math.floor(rand(0, N + 1)), bj = Math.floor(rand(0, N + 1)), di = Math.floor(rand(0, 4)), d = DIRS[di];
      const ni = bi + d[0], nj = bj + d[1]; if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
      const s = rand(RW, P - RW), lx = d[1], lz = -d[0];
      const x = cc(bi) + d[0] * s + lx * LANE, z = cc(bj) + d[1] * s + lz * LANE;
      if (!init && Math.hypot(x - car.x, z - car.z) < 120) continue;
      this.x = x; this.z = z; this.di = di; this.bi = ni; this.bj = nj; this.th = Math.atan2(d[0], d[1]);
      this.v = 0; this.vt = rand(6, 10); this.stun = 0; this.setLane(); return;
    }
    this.x = 9999; this.z = 9999; this.bi = 0; this.bj = 0; this.di = 0; this.th = 0; this.v = 0; this.vt = 0; this.stun = 0; this.setLane();
  }
  setLane() { const d = DIRS[this.di]; this.dx = d[0]; this.dz = d[1]; this.lx = cc(this.bi) + d[1] * LANE; this.lz = cc(this.bj) - d[0] * LANE; }
  update(dt) {
    if (this.x > 9000) { this.spawn(false); return; }
    const nx = cc(this.bi), nz = cc(this.bj);
    if ((this.x - nx) * this.dx + (this.z - nz) * this.dz > -9) { // choose next direction
      const opts = []; for (let k = 0; k < 4; k++) { if (k === (this.di + 2) % 4) continue; const d = DIRS[k], a = this.bi + d[0], b = this.bj + d[1]; if (a >= 0 && b >= 0 && a <= N && b <= N) opts.push(k); }
      this.di = opts.length ? (Math.random() < .55 && opts.indexOf(this.di) >= 0 ? this.di : pick(opts)) : (this.di + 2) % 4;
      const d = DIRS[this.di]; this.bi += d[0]; this.bj += d[1];
      if (this.bi < 0 || this.bj < 0 || this.bi > N || this.bj > N) { this.bi -= d[0]; this.bj -= d[1]; this.di = (this.di + 2) % 4; }
      this.setLane();
    }
    const rx = this.x - this.lx, rz = this.z - this.lz, pr = rx * this.dx + rz * this.dz;
    const tx = this.lx + this.dx * (pr + 10), tz = this.lz + this.dz * (pr + 10);
    const des = Math.atan2(tx - this.x, tz - this.z);
    this.th += clamp(wrapA(des - this.th), -1.7 * dt, 1.7 * dt);
    // blocked check
    let vt = this.vt; const fx = Math.sin(this.th), fz = Math.cos(this.th);
    const chk = (ox, oz) => {
      const rx2 = ox - this.x, rz2 = oz - this.z, a = rx2 * fx + rz2 * fz, l = rx2 * fz - rz2 * fx;
      if (a > 0 && a < 17 && Math.abs(l) < 2.6) vt = Math.min(vt, a < 7 ? 0 : (a - 6) * .9);
    };
    chk(car.x, car.z); for (const o of traffic) if (o !== this) chk(o.x, o.z);
    if (this.stun > 0) { this.stun -= dt; vt = 0; }
    this.v += clamp(vt - this.v, -9 * dt, 3 * dt);
    this.x += fx * this.v * dt; this.z += fz * this.v * dt;
    this.m.root.position.set(this.x, 0, this.z); this.m.root.rotation.y = this.th;
    const r = this.v * dt / .31; for (const s of this.m.spins) s.rotation.x += r;
  }
}

/* ---------------- mission targets ---------------- */
const beacon = new T.Group(); beacon.visible = false; scene.add(beacon);
const bCyl = new T.Mesh(new T.CylinderGeometry(3.2, 3.2, 45, 20, 1, true), new T.MeshBasicMaterial({ color: 0x3cff7a, transparent: true, opacity: .28, side: T.DoubleSide, depthWrite: false, fog: false }));
bCyl.position.y = 22; const bRing = new T.Mesh(new T.TorusGeometry(3.3, .22, 6, 28).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 0x3cff7a })); bRing.position.y = .4;
const bBay = new T.Mesh(PLANE, new T.MeshBasicMaterial({ map: bayTex, transparent: true, depthWrite: false })); bBay.scale.set(3.2, 6.2, 1); bBay.rotation.x = -Math.PI / 2; bBay.position.y = .14;
beacon.add(bCyl, bRing, bBay);

/* ---------------- audio ---------------- */
const snd = {
  ctx: null, on: store.get('snd', true), horn: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; const x = this.ctx = new C();
      this.master = x.createGain(); this.master.gain.value = this.on ? .55 : 0; this.master.connect(x.destination);
      this.filt = x.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 600;
      this.eg = x.createGain(); this.eg.gain.value = 0; this.filt.connect(this.eg); this.eg.connect(this.master);
      this.o1 = x.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = x.createOscillator(); this.o2.type = 'square';
      this.g2 = x.createGain(); this.g2.gain.value = .5; this.o1.connect(this.filt); this.o2.connect(this.g2); this.g2.connect(this.filt);
      this.o1.start(); this.o2.start();
      const nb = x.createBuffer(1, x.sampleRate * 1.5, x.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nb = nb;
      this.wn = x.createBufferSource(); this.wn.buffer = nb; this.wn.loop = true; const wf = x.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
      this.wg = x.createGain(); this.wg.gain.value = 0; this.wn.connect(wf); wf.connect(this.wg); this.wg.connect(this.master); this.wn.start();
    } catch (e) { this.ctx = null; }
  },
  setOn(v) { this.on = v; store.set('snd', v); if (this.master) this.master.gain.value = v ? .55 : 0; },
  update(rpm, thr, on, v) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const f = 16 + rpm * .075;
    this.o1.frequency.setTargetAtTime(f, t, .03); this.o2.frequency.setTargetAtTime(f * .5, t, .03);
    this.filt.frequency.setTargetAtTime(450 + rpm * .45 + thr * 700, t, .05);
    this.eg.gain.setTargetAtTime(on ? .16 + thr * .22 : 0, t, .06);
    this.wg.gain.setTargetAtTime(Math.min(.22, Math.abs(v) / 40 * .22), t, .1);
  },
  burst(dur, freq, vol, type) {
    if (!this.ctx) return; const x = this.ctx, t = x.currentTime, s = x.createBufferSource(); s.buffer = this.nb;
    const f = x.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; const g = x.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  },
  tone(f0, f1, dur, vol, type) {
    if (!this.ctx) return; const x = this.ctx, t = x.currentTime, o = x.createOscillator(), g = x.createGain();
    o.type = type || 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  },
  crash(p) { this.burst(.5, 900, clamp(p, .2, 1)); this.tone(110, 40, .35, .4 * clamp(p, .3, 1), 'square'); },
  grind() { this.burst(.22, 2400, .35, 'bandpass'); this.tone(180, 120, .2, .12, 'sawtooth'); },
  stall() { this.tone(90, 25, .5, .3, 'square'); },
  starter() { this.tone(34, 40, .7, .22, 'square'); this.burst(.7, 300, .15); },
  hornOn() { if (!this.ctx || this.horn) return; const x = this.ctx, g = x.createGain(); g.gain.value = .22; g.connect(this.master); const a = x.createOscillator(), b = x.createOscillator(); a.type = b.type = 'square'; a.frequency.value = 415; b.frequency.value = 494; a.connect(g); b.connect(g); a.start(); b.start(); this.horn = { a, b, g }; },
  hornOff() { if (!this.horn) return; try { this.horn.a.stop(); this.horn.b.stop(); } catch (e) {} this.horn = null; },
  coin() { this.tone(880, 1320, .18, .25, 'sine'); }
};

/* ---------------- game state ---------------- */
let state = 'menu', mode = 'free', camMode = 0, tipsOn = store.get('tips', true);
let coins = store.get('coins', 0), runCoins = 0, score = 0, damage = 0, tLeft = 0, tgt = null, parkT = 0, shake = 0, time = 0, wa = 0, camTh = 0, stalls = 0, hbOn = false;
const MAXW = 2.4;
const inp = { gas: false, brk: false, clu: false, cluY0: 0, cluT: 0, horn: false, kL: false, kR: false, wheelHeld: false };
let thrKey = 0;

/* ---------------- HUD helpers ---------------- */
let toastT = 0, lastGrind = 0, lastBlock = 0;
function toast(msg, ms) { const e = $('toast'); e.textContent = msg; e.classList.add('show'); toastT = (ms || 1300) / 1000; }
function setCoins() { $('coins').textContent = '🪙 ' + coins; $('mCoins').textContent = coins; }
function vib(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

const tachC = $('tach'), spdC = $('spd'); let dialPx = 100;
function sizeCanvases() {
  const r = tachC.getBoundingClientRect(); dialPx = Math.max(60, Math.round(r.width * DPR));
  tachC.width = tachC.height = spdC.width = spdC.height = dialPx;
  const sh = $('shifter').getBoundingClientRect(); $('shifter').width = $('shifter').height = Math.max(60, Math.round(sh.width * DPR));
}
function dial(cv, val, max, step, label, redFrom, big, sub) {
  const g = cv.getContext('2d'), w = cv.width, c = w / 2, r = w * .46, a0 = .75 * Math.PI, sw = 1.5 * Math.PI;
  g.clearRect(0, 0, w, w);
  const gr = g.createRadialGradient(c, c, r * .2, c, c, r); gr.addColorStop(0, 'rgba(18,30,52,.85)'); gr.addColorStop(1, 'rgba(6,12,24,.85)');
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
  g.lineWidth = w * .02; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
  if (redFrom) { g.strokeStyle = '#ff4d3a'; g.lineWidth = w * .035; g.beginPath(); g.arc(c, c, r * .88, a0 + sw * redFrom / max, a0 + sw); g.stroke(); }
  g.fillStyle = '#fff'; g.font = `700 ${w * .1}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max + .01; v += step) {
    const a = a0 + sw * v / max, ca = Math.cos(a), sa = Math.sin(a);
    g.strokeStyle = '#fff'; g.lineWidth = w * .015; g.beginPath(); g.moveTo(c + ca * r * .9, c + sa * r * .9); g.lineTo(c + ca * r * .78, c + sa * r * .78); g.stroke();
    g.fillText(label(v), c + ca * r * .62, c + sa * r * .62);
  }
  const a = a0 + sw * clamp(val / max, 0, 1.02);
  g.strokeStyle = '#ff5a3c'; g.lineWidth = w * .028; g.lineCap = 'round'; g.beginPath(); g.moveTo(c - Math.cos(a) * r * .12, c - Math.sin(a) * r * .12); g.lineTo(c + Math.cos(a) * r * .82, c + Math.sin(a) * r * .82); g.stroke();
  g.fillStyle = '#ddd'; g.beginPath(); g.arc(c, c, w * .04, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = `800 ${w * .17}px system-ui`; g.fillText(big, c, c + r * .42);
  g.font = `600 ${w * .085}px system-ui`; g.fillStyle = '#9fc4ee'; g.fillText(sub, c, c + r * .66);
}

/* ---------------- shifter ---------------- */
const shEl = $('shifter'), sh = { x: .5, y: .5, drag: false, id: null };
const COLX = [.2, .5, .8], UPY = .2, MIDY = .5, DNY = .8, BAND = .09;
const SLOT = { '0,-1': 1, '0,1': 2, '1,-1': 3, '1,1': 4, '2,-1': 5, '2,1': -1 };
const GPOS = { 1: [0, UPY], 2: [0, DNY], 3: [1, UPY], 4: [1, DNY], 5: [2, UPY], '-1': [2, DNY] };
const nearestCol = x => (Math.abs(x - COLX[0]) < Math.abs(x - COLX[1]) ? (Math.abs(x - COLX[0]) < Math.abs(x - COLX[2]) ? 0 : 2) : (Math.abs(x - COLX[1]) < Math.abs(x - COLX[2]) ? 1 : 2));
function shMove(px, py) {
  const col = nearestCol(sh.x); let kx = sh.x;
  if (Math.abs(sh.y - MIDY) < BAND) kx = clamp(px, COLX[0], COLX[2]); else kx = COLX[col];
  const cn = nearestCol(kx); let wy = clamp(py, UPY, DNY);
  if (Math.abs(kx - COLX[cn]) > .06 && Math.abs(wy - MIDY) > BAND) wy = MIDY + Math.sign(wy - MIDY) * BAND * .95;
  let intent = 0;
  if (wy <= UPY + .06) intent = SLOT[cn + ',-1']; else if (wy >= DNY - .06) intent = SLOT[cn + ',1'];
  if (intent !== 0 && intent !== car.gear && car.clutch < .8) {
    wy = MIDY + Math.sign(wy - MIDY) * Math.min(Math.abs(wy - MIDY), UPY + .06 > 0 ? .17 : .17); intent = 0;
    if (time - lastGrind > .6) { lastGrind = time; snd.grind(); toast('PRESS CLUTCH!', 700); vib(30); }
  }
  sh.x = kx; sh.y = wy; if (intent !== car.gear) car.setGear(intent);
}
function shPoint(e) { const r = shEl.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
shEl.addEventListener('pointerdown', e => { e.preventDefault(); snd.init(); shEl.setPointerCapture(e.pointerId); sh.drag = true; sh.id = e.pointerId; const p = shPoint(e); shMove(p[0], p[1]); });
shEl.addEventListener('pointermove', e => { if (sh.drag && e.pointerId === sh.id) { const p = shPoint(e); shMove(p[0], p[1]); } });
const shUp = e => { if (e.pointerId === sh.id) sh.drag = false; };
shEl.addEventListener('pointerup', shUp); shEl.addEventListener('pointercancel', shUp);
function drawShifter(dt) {
  if (!sh.drag) {
    if (car.gear !== 0) { const g = GPOS[car.gear]; sh.x = COLX[g[0]]; sh.y = g[1]; }
    else { sh.y = lerp(sh.y, MIDY, Math.min(1, dt * 14)); sh.x = lerp(sh.x, COLX[1], Math.min(1, dt * 7)); }
  }
  const g = shEl.getContext('2d'), w = shEl.width; g.clearRect(0, 0, w, w);
  g.fillStyle = 'rgba(8,16,30,.72)'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, w, w * .12) : g.rect(0, 0, w, w); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = w * .015; g.stroke();
  g.lineCap = 'round'; g.strokeStyle = '#05080f'; g.lineWidth = w * .075;
  g.beginPath(); for (const cx of COLX) { g.moveTo(cx * w, UPY * w); g.lineTo(cx * w, DNY * w); } g.moveTo(COLX[0] * w, MIDY * w); g.lineTo(COLX[2] * w, MIDY * w); g.stroke();
  g.strokeStyle = '#2a3a55'; g.lineWidth = w * .02; g.stroke();
  g.fillStyle = '#9fc4ee'; g.font = `800 ${w * .09}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const k in GPOS) { const p = GPOS[k], yy = p[1] === UPY ? UPY - .1 : DNY + .1; g.fillText(k === '-1' ? 'R' : k, COLX[p[0]] * w, yy * w); }
  const kx = sh.x * w, ky = sh.y * w, kr = w * .085, kg = g.createRadialGradient(kx - kr * .3, ky - kr * .3, kr * .1, kx, ky, kr);
  kg.addColorStop(0, '#ffffff'); kg.addColorStop(1, car.gear !== 0 ? '#e0711a' : '#8c96a6'); g.fillStyle = kg; g.beginPath(); g.arc(kx, ky, kr, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = w * .01; g.stroke();
}

/* ---------------- controls ---------------- */
function bindPedal(el, down, up, move) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); snd.init(); el.setPointerCapture(e.pointerId); el.classList.add('down'); down(e); });
  if (move) el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) move(e); });
  const u = e => { el.classList.remove('down'); up(e); }; el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u);
}
bindPedal($('pGas'), () => inp.gas = true, () => inp.gas = false);
bindPedal($('pBrake'), () => inp.brk = true, () => inp.brk = false);
bindPedal($('pClutch'), e => { inp.clu = true; inp.cluY0 = e.clientY; inp.cluT = 1; },
  () => { inp.clu = false; },
  e => { const h = $('pClutch').getBoundingClientRect().height; inp.cluT = clamp(1 - (inp.cluY0 - e.clientY) / (h * .85), 0, 1); });
function tap(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); snd.init(); fn(e); }); }
tap($('bHB'), () => { hbOn = !hbOn; $('bHB').classList.toggle('act', hbOn); });
bindPedal($('bHorn'), () => { inp.horn = true; snd.hornOn(); }, () => { inp.horn = false; snd.hornOff(); });
tap($('engBtn'), toggleEngine);
function toggleEngine() {
  if (state !== 'play') return; snd.init();
  if (car.on) { car.stop(); toast('ENGINE OFF', 800); return; }
  const r = car.start();
  if (r === 'clutch') { toast('PRESS CLUTCH TO START', 1200); return; }
  if (r === 'ok') snd.starter();
}
tap($('bCam'), () => { camMode = (camMode + 1) % 2; cockpit.visible = camMode === 1; });
tap($('bSnd'), () => { snd.setOn(!snd.on); $('bSnd').textContent = snd.on ? '🔊' : '🔇'; });
tap($('bPause'), () => setState('pause'));
// steering wheel
const wheelEl = $('wheel'), wRot = $('wheelRot'); let wPid = null, wLast = 0;
const wAng = e => { const r = wheelEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
wheelEl.addEventListener('pointerdown', e => { e.preventDefault(); snd.init(); wheelEl.setPointerCapture(e.pointerId); wPid = e.pointerId; wLast = wAng(e); inp.wheelHeld = true; });
wheelEl.addEventListener('pointermove', e => { if (e.pointerId !== wPid) return; const a = wAng(e); wa = clamp(wa + wrapA(a - wLast), -MAXW, MAXW); wLast = a; });
const wUp = e => { if (e.pointerId === wPid) { wPid = null; inp.wheelHeld = false; } };
wheelEl.addEventListener('pointerup', wUp); wheelEl.addEventListener('pointercancel', wUp);
// keyboard (desktop testing)
const KG = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit0: 0, KeyN: 0, KeyR: -1 };
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.kL = true; else if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.kR = true;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') inp.gas = true; else if (e.code === 'ArrowDown' || e.code === 'KeyS') inp.brk = true;
  else if (e.code === 'ShiftLeft' || e.code === 'KeyZ') { inp.clu = true; inp.cluT = 1; } else if (e.code === 'Space') { hbOn = !hbOn; $('bHB').classList.toggle('act', hbOn); }
  else if (e.code === 'KeyE') toggleEngine(); else if (e.code === 'KeyC') $('bCam').dispatchEvent(new Event('pointerdown'));
  else if (e.code === 'KeyH') { snd.init(); snd.hornOn(); } else if (e.code in KG) { snd.init(); if (!car.setGear(KG[e.code])) { snd.grind(); toast('PRESS CLUTCH!', 700); } }
});
addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.kL = false; else if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.kR = false;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') inp.gas = false; else if (e.code === 'ArrowDown' || e.code === 'KeyS') inp.brk = false;
  else if (e.code === 'ShiftLeft' || e.code === 'KeyZ') inp.clu = false; else if (e.code === 'KeyH') snd.hornOff();
});

/* ---------------- missions ---------------- */
function newTarget() {
  for (let t = 0; t < 40; t++) {
    const ax = Math.floor(rand(0, 2)), k = Math.floor(rand(0, N + 1)), m = Math.floor(rand(0, N)), sg = Math.random() < .5 ? 1 : -1;
    const s = (cc(m) + cc(m + 1)) / 2 + rand(-18, 18), d = ax === 0 ? [sg, 0] : [0, sg], off = mode === 'park' ? 5.4 : LANE;
    const x = (ax === 0 ? s : cc(k)) + d[1] * off, z = (ax === 0 ? cc(k) : s) - d[0] * off;
    const dist = Math.hypot(x - car.x, z - car.z); if (dist < 90 || dist > 300) continue;
    tgt = { x, z, th: Math.atan2(d[0], d[1]) }; tLeft = 25 + dist / 4.6 + (mode === 'park' ? 12 : 0); parkT = 0;
    beacon.position.set(x, 0, z); beacon.rotation.y = tgt.th; beacon.visible = true; bBay.visible = mode === 'park'; bCyl.scale.set(mode === 'park' ? .55 : 1, 1, mode === 'park' ? .55 : 1); bRing.visible = mode !== 'park';
    $('arrowBox').classList.remove('hidden'); return;
  }
}
function missionText() { $('mission').textContent = mode === 'free' ? 'FREE DRIVE' : (mode === 'check' ? `CHECKPOINT #${score + 1}` : `PARKING #${score + 1}`) ; }

/* ---------------- game flow ---------------- */
function resetRun() {
  car.reset(LANE, -40, 0); car.clutch = 1; hbOn = false; $('bHB').classList.remove('act'); wa = 0; damage = 0; score = 0; runCoins = 0; stalls = 0; camTh = 0; shake = 0; tgt = null; beacon.visible = false;
  $('arrowBox').classList.add('hidden'); sh.x = .5; sh.y = .5; inp.cluT = 1;
  for (const a of traffic) a.spawn(false);
  missionText(); if (mode !== 'free') newTarget(); $('timer').textContent = '';
}
function setState(s) {
  state = s;
  $('menu').classList.toggle('hidden', s !== 'menu'); $('pause').classList.toggle('hidden', s !== 'pause'); $('over').classList.toggle('hidden', s !== 'over');
  $('hud').classList.toggle('hidden', s === 'menu'); if (s !== 'menu') sizeCanvases();
  if (s === 'menu') { snd.hornOff(); if (snd.ctx) snd.update(0, 0, false, 0); refreshMenu(); }
}
function startMode(m) { snd.init(); mode = m; resetRun(); setState('play'); $('timer').style.display = m === 'free' ? 'none' : 'block'; }
function gameOver(title) {
  state = 'over'; snd.hornOff(); const best = store.get('best_' + mode, 0);
  if (score > best) store.set('best_' + mode, score);
  coins += runCoins; store.set('coins', coins); setCoins();
  $('oTitle').textContent = title; $('stats').innerHTML = mode === 'free' ? `Coins earned: ${runCoins}` : `Score: <b>${score}</b> ${score > best ? '🏆 NEW BEST' : ''}<br>Coins earned: ${runCoins}<br>Stalls: ${stalls}`;
  $('over').classList.remove('hidden'); vib(80);
}
function refreshMenu() { setCoins(); $('mBest').textContent = ['check', 'park'].map(m => ({ check: 'CP ', park: 'PK ' }[m]) + store.get('best_' + m, 0)).join(' · '); $('mTips').textContent = 'Tips: ' + (tipsOn ? 'ON' : 'OFF'); }
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => startMode(b.dataset.mode)));
$('pResume').addEventListener('click', () => setState('play')); $('pMenu').addEventListener('click', () => setState('menu'));
$('oRetry').addEventListener('click', () => startMode(mode)); $('oMenu').addEventListener('click', () => setState('menu'));
$('mTips').addEventListener('click', () => { tipsOn = !tipsOn; store.set('tips', tipsOn); refreshMenu(); });
window.onBack = () => { if (state === 'play') { setState('pause'); return true; } if (state === 'pause') { setState('play'); return true; } if (state === 'over') { setState('menu'); return true; } return false; };
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setState('pause'); });

/* ---------------- collisions ---------------- */
const OFFS = [1.35, 0, -1.35];
function collide(dt) {
  const fx = Math.sin(car.th), fz = Math.cos(car.th); let hit = 0, nxs = 0, nzs = 0;
  for (const o of OFFS) {
    const cx = car.x + fx * o, cz = car.z + fz * o, r = 1.0;
    for (const s of solids) {
      const px = clamp(cx, s.x0, s.x1), pz = clamp(cz, s.z0, s.z1), dx = cx - px, dz = cz - pz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        let nx, nz, pen;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else { const l = cx - s.x0, rr = s.x1 - cx, t = cz - s.z0, b = s.z1 - cz, m = Math.min(l, rr, t, b); if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; } pen = r + m; }
        car.x += nx * pen; car.z += nz * pen; hit = 1; nxs += nx; nzs += nz;
      }
    }
    for (const a of traffic) {
      const afx = Math.sin(a.th), afz = Math.cos(a.th);
      for (const ao of OFFS) {
        const ax = a.x + afx * ao, az = a.z + afz * ao, dx = cx - ax, dz = cz - az, d2 = dx * dx + dz * dz;
        if (d2 < 4 && d2 > 1e-6) { const d = Math.sqrt(d2), pen = 2 - d, nx = dx / d, nz = dz / d; car.x += nx * pen * .6; car.z += nz * pen * .6; a.x -= nx * pen * .4; a.z -= nz * pen * .4; hit = 2; nxs += nx; nzs += nz; a.stun = 2; }
      }
    }
  }
  if (hit) {
    const l = Math.hypot(nxs, nzs) || 1, into = -(fx * nxs + fz * nzs) / l * car.v; // speed into obstacle
    if (into > 1.2) {
      const dm = clamp(into * (hit === 2 ? 2.2 : 1.6), 1, 40); damage = Math.min(100, damage + dm);
      car.v *= -.18; shake = Math.min(1, dm / 14); snd.crash(dm / 20); vib(60); toast('CRASH!', 700);
    } else if (Math.abs(car.v) > .5) car.v *= (1 - 1.5 * dt);
  }
}

/* ---------------- update ---------------- */
const tmpV = new T.Vector3();
function tipText() {
  if (!tipsOn) return '';
  const sp = Math.abs(car.v), rpm = car.rpm();
  if (!car.on) return car.gear !== 0 ? '① Hold CLUTCH, then press ENGINE (or shift to N)' : '① Press ENGINE START';
  if (car.gear === 0) return '② Hold CLUTCH and drag the lever up into 1';
  if (car.gear > 0 && car.clutch > .5 && sp < .5) return '③ Ease clutch UP slowly while pressing GAS';
  if (car.gear > 0 && rpm > 4300 && car.gear < 5) return '⬆ Shift up: CLUTCH in → next gear → release';
  if (car.gear > 1 && rpm < 1500 && sp > 1) return '⬇ Low RPM: shift down or ease off to avoid stall';
  if (hbOn && sp < .5) return 'Release the HANDBRAKE';
  return '';
}
function update(dt) {
  time += dt;
  // pedals
  const gT = inp.gas ? 1 : 0; car.thr += clamp(gT - car.thr, -5 * dt, 3 * dt);
  const bT = inp.brk ? 1 : 0; car.brk += clamp(bT - car.brk, -9 * dt, 7 * dt);
  car.hb += clamp((hbOn ? 1 : 0) - car.hb, -4 * dt, 4 * dt);
  const cT = inp.clu ? inp.cluT : 0;
  if (inp.clu) car.clutch += clamp(cT - car.clutch, -7 * dt, 10 * dt); else car.clutch = Math.max(0, car.clutch - .8 * dt);
  // steering
  if (!inp.wheelHeld) {
    const kd = (inp.kR ? 1 : 0) - (inp.kL ? 1 : 0);
    if (kd) wa = clamp(wa + kd * 3.2 * dt, -MAXW, MAXW); else wa *= Math.exp(-(2.2 + Math.abs(car.v) * .06) * dt);
  }
  car.steer = -wa / MAXW;
  car.step(dt);
  if (car.stalled) { car.stalled = false; stalls++; snd.stall(); toast('ENGINE STALLED!', 1400); shake = Math.max(shake, .25); vib(40); }
  collide(dt);
  for (const a of traffic) a.update(dt);

  // mission logic
  if (mode !== 'free' && tgt) {
    tLeft -= dt; const dx = tgt.x - car.x, dz = tgt.z - car.z, dist = Math.hypot(dx, dz);
    $('timer').textContent = Math.max(0, tLeft).toFixed(1); $('timer').classList.toggle('low', tLeft < 10);
    const rel = wrapA(Math.atan2(dx, dz) - car.th); $('arrow').style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`; $('dist').textContent = Math.round(dist) + ' m';
    let done = false;
    if (mode === 'check') done = dist < 6;
    else {
      const f = tgt, lx = Math.cos(f.th), lz = -Math.sin(f.th), fx = Math.sin(f.th), fz = Math.cos(f.th);
      const lat = (car.x - f.x) * lx + (car.z - f.z) * lz, lon = (car.x - f.x) * fx + (car.z - f.z) * fz, ang = Math.abs(wrapA(car.th - f.th));
      const inBay = Math.abs(lat) < 1.5 && Math.abs(lon) < 2.6 && ang < .45;
      if (inBay && Math.abs(car.v) < .35) { parkT += dt; if (parkT > 1.5) done = true; else toast('HOLD STILL… ' + (1.5 - parkT).toFixed(1), 300); } else parkT = 0;
    }
    if (done) { const r = (mode === 'park' ? 30 : 10) + Math.floor(tLeft / 2); runCoins += r; score++; snd.coin(); toast(mode === 'park' ? 'PARKED! +' + r : '+' + r + ' 🪙', 1200); missionText(); newTarget(); }
    else if (tLeft <= 0) { gameOver('TIME UP!'); }
  }
  if (damage >= 100 && state === 'play') gameOver('CAR WRECKED!');
  // visuals
  const ph = time * 1000;
  player.root.position.set(car.x, 0, car.z); player.root.rotation.y = car.th;
  const lat = car.v * car.yawRate;
  player.body.rotation.z = lerp(player.body.rotation.z, clamp(lat * .012, -.07, .07), Math.min(1, dt * 8));
  player.body.rotation.x = lerp(player.body.rotation.x, clamp(-car.acc * .006, -.05, .05), Math.min(1, dt * 8));
  player.body.position.y = car.on ? Math.sin(ph * .09) * .004 * (1 + car.thr * 2) : 0;
  for (const f of player.front) f.rotation.y = car.steerAng;
  for (const s of player.spins) s.rotation.x = car.wheelRot;
  player.tail.color.setHex(car.brk > .1 ? 0xff2a1a : 0x7a1010);
  player.wheelMesh.rotation.z = -wa * .8;
  camUpdate(dt);
  hudUpdate(dt);
  snd.update(car.rpm(), car.thr, car.on, car.v);
}
function camUpdate(dt) {
  const sp = Math.abs(car.v);
  shake = Math.max(0, shake - dt * 1.6);
  if (camMode === 0) {
    camTh += wrapA(car.th - camTh) * Math.min(1, dt * (car.v < -1 ? 6 : 3.2));
    const back = 7.2 + sp * .03, fx = Math.sin(camTh), fz = Math.cos(camTh);
    tmpV.set(car.x - fx * back, 3.1 + sp * .02, car.z - fz * back);
    camera.position.lerp(tmpV, Math.min(1, dt * 9));
    camera.lookAt(car.x + fx * 7, 1.3, car.z + fz * 7);
    camera.fov = lerp(camera.fov, 60 + clamp(sp, 0, 35) * .5, Math.min(1, dt * 3));
  } else {
    const c = Math.cos(car.th), s = Math.sin(car.th), lx = -.42, lz = -.1;
    camera.position.set(car.x + lx * c + lz * s, 1.22, car.z - lx * s + lz * c);
    camera.lookAt(camera.position.x + Math.sin(car.th - wa * .03) * 10, 1.1, camera.position.z + Math.cos(car.th - wa * .03) * 10);
    camera.fov = 72;
  }
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * .6; camera.position.y += (Math.random() - .5) * shake * .4; }
  camera.updateProjectionMatrix();
}
let tipCache = '';
function hudUpdate(dt) {
  dial(tachC, car.rpm(), 7000, 1000, v => v / 1000, 6000, Math.round(car.rpm() / 10) * 10 + '', 'RPM');
  dial(spdC, Math.abs(car.v) * 3.6, 180, 20, v => v, 0, Math.round(Math.abs(car.v) * 3.6) + '', 'km/h');
  const g = $('gearBig'); g.textContent = car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : car.gear; g.classList.toggle('warn', !car.on);
  $('wheelRot').style.transform = `rotate(${(wa * 57.3).toFixed(1)}deg)`;
  $('engBtn').classList.toggle('on', car.on); $('engBtn').innerHTML = car.on ? 'ENGINE<br>ON' : 'ENGINE<br>START';
  $('cFill').style.height = (car.clutch * 100).toFixed(0) + '%';
  $('dmgFill').style.width = damage.toFixed(0) + '%'; $('dmgLbl').textContent = 'DAMAGE ' + Math.round(damage) + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  const tp = tipText(); if (tp !== tipCache) { tipCache = tp; $('tip').textContent = tp; }
  drawShifter(dt);
}

/* ---------------- loop / init ---------------- */
let last = performance.now(), orbit = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (state === 'play') update(dt);
  else {
    if (state === 'menu') {
      orbit += dt * .12; time += dt;
      player.root.position.set(car.x, 0, car.z); player.root.rotation.y = car.th;
      camera.position.set(car.x + Math.sin(orbit) * 9, 3.2, car.z + Math.cos(orbit) * 9); camera.lookAt(car.x, 1, car.z); camera.fov = 55; camera.updateProjectionMatrix();
      for (const a of traffic) a.update(dt);
    }
  }
  beacon.rotation.y += 0; bRing.rotation.y += dt * 1.5; bCyl.material.opacity = .22 + Math.sin(time * 4) * .06;
  renderer.render(scene, camera);
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); sizeCanvases();
}
addEventListener('resize', resize);
buildWorld();
for (let i = 0; i < 18; i++) traffic.push(new AI());
car.reset(LANE, -40, 0); camTh = 0; camera.position.set(LANE, 3, -47);
resize(); setState('menu');
requestAnimationFrame(frame);
window.__cp = { car, traffic, startMode, update, state: () => state, inp };
})();
