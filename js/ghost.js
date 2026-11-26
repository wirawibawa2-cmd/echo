// Procedural 3D ghost mascot (three.js). Exposes a small API: setState(), react(), speakLevel.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { buildFX, updateFX } from './ghost-fx.js?v=4';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Design presets. Pick with ?ghost=a|b|c|d (default = the cute original).
export const DESIGNS = {
  default: { H: 2.15, headR: 0.68, headH: 0.86, flare: 0.26, flareP: 2.2, taper: 0, fold: 0.045, foldF: 7, fold2: 0.012, hemA: 0.085, hemR: 0.05, hemF: 7, waveSpd: 1.9,
             mat: 'matte', eyes: 'cute', mouth: true, blush: true, arms: 'stub', bob: 0.09 },
  // A "Felt Lantern": felt sheet, deep folds, recessed eye holes, warm orange light pool below, dark slate.
  a: { H: 2.5, headR: 0.55, headH: 0.66, flare: 0.5, flareP: 1.9, taper: 0, fold: 0.07, foldF: 6, fold2: 0.04, hemA: 0.1, hemR: 0.06, hemF: 6, waveSpd: 1.0,
       mat: 'felt', eyes: 'holes', eyeW: 0.1, eyeH: 0.19, eyeSp: 0.37, faceTop: 0.62, mouth: false, blush: false, arms: 'none', bob: 0.08, heavy: true,
       bump: 1.0, pool: 1.0, light: 'std', tilt: 0.05 },
  // B "Pop Minimal": small squat smooth ghost, simple hem, tiny eye holes, bold deep-orange backdrop.
  b: { H: 1.55, headR: 0.62, headH: 0.6, flare: 0.1, flareP: 2.5, taper: 0, fold: 0.012, foldF: 5, fold2: 0.0, hemA: 0.05, hemR: 0.03, hemF: 5, waveSpd: 1.4,
       mat: 'smooth', eyes: 'holes', eyeW: 0.085, eyeH: 0.13, eyeSp: 0.3, faceTop: 0.52, mouth: false, blush: false, arms: 'none', bob: 0.06,
       bump: 0, pool: 0, light: 'flat', zoom: 1.55 },
  // C "Phantom Drape": tall dramatic drape, low-key moody backlight, eyes with a faint inner orange ember.
  c: { H: 3.0, headR: 0.5, headH: 0.62, flare: 0.62, flareP: 2.1, taper: 0, fold: 0.095, foldF: 5, fold2: 0.05, hemA: 0.14, hemR: 0.07, hemF: 5, waveSpd: 0.8,
       mat: 'felt', eyes: 'holes', eyeW: 0.088, eyeH: 0.2, eyeSp: 0.37, faceTop: 0.62, eyeGlow: true, mouth: false, blush: false, arms: 'none', bob: 0.1, heavy: true,
       bump: 0.6, pool: 0.55, light: 'moody' },
  // D "Spectral Hem": sheet that dissolves into a glowing translucent orange edge, wisp-like hem, underglow.
  d: { H: 2.35, headR: 0.56, headH: 0.7, flare: 0.36, flareP: 1.7, taper: 0, fold: 0.05, foldF: 7, fold2: 0.03, hemA: 0.13, hemR: 0.08, hemF: 7, waveSpd: 1.7,
       mat: 'spectral', eyes: 'holes', eyeW: 0.09, eyeH: 0.15, eyeSp: 0.34, faceTop: 0.66, mouth: false, blush: false, arms: 'none', bob: 0.12,
       bump: 0.35, pool: 0.8, light: 'std', hemGlow: true },
  // E "Ember Particles": silhouette made of thousands of flowing orange/white particles (Particle-Wave DNA).
  e: { H: 1.9, frameH: 2.45, headR: 0.56, headH: 0.68, flare: 0.4, flareP: 1.9, taper: 0, fold: 0.05, foldF: 6, fold2: 0.02, hemA: 0.12, hemR: 0.06, hemF: 6, waveSpd: 1.3,
       mat: 'matte', eyes: 'holes', eyeW: 0.1, eyeH: 0.19, eyeSp: 0.37, faceTop: 0.64, mouth: false, blush: false, arms: 'none', bob: 0.09,
       render: 'particles', seg: 220, profMul: 3, pool: 0.3, light: 'std', black: true },
  // F "Liquid Chrome": mirror-polished silver sheet with iridescent rim, black eye holes.
  f: { H: 2.35, headR: 0.57, headH: 0.68, flare: 0.42, flareP: 1.9, taper: 0, fold: 0.06, foldF: 6, fold2: 0.025, hemA: 0.1, hemR: 0.05, hemF: 6, waveSpd: 1.1,
       mat: 'chrome', eyes: 'holes', eyeW: 0.1, eyeH: 0.19, eyeSp: 0.37, faceTop: 0.64, mouth: false, blush: false, arms: 'none', bob: 0.08,
       pool: 0.6, light: 'chrome', black: true },
  // G "Vapor": sheet formed of drifting smoke that dissolves toward the hem, dark eyes.
  g: { H: 2.45, headR: 0.56, headH: 0.7, flare: 0.4, flareP: 1.8, taper: 0, fold: 0.05, foldF: 6, fold2: 0.03, hemA: 0.12, hemR: 0.07, hemF: 6, waveSpd: 1.2,
       mat: 'matte', eyes: 'holes', eyeW: 0.1, eyeH: 0.19, eyeSp: 0.37, faceTop: 0.66, mouth: false, blush: false, arms: 'none', bob: 0.1,
       render: 'smoke', profMul: 2, pool: 0.35, light: 'std', black: true },
  // H "Origami": faceted low-poly paper sheet, sharp folds, glowing orange edge lines.
  h: { H: 2.4, headR: 0.58, headH: 0.7, flare: 0.5, flareP: 1.8, taper: 0, fold: 0.07, foldF: 5, fold2: 0.0, hemA: 0.1, hemR: 0.04, hemF: 5, waveSpd: 0.9,
       mat: 'paper', eyes: 'holes', eyeW: 0.1, eyeH: 0.18, eyeSp: 0.36, faceTop: 0.64, mouth: false, blush: false, arms: 'none', bob: 0.08,
       render: 'lowpoly', seg: 10, lowProf: 11, pool: 0.8, light: 'moody', black: true },
  // SHEET "Echo": classic white bedsheet ghost, matte cloth, flowing hem, two black oval eye holes (default).
  sheet: { H: 1.87, pool2: 0.75, frameH: 2.4, headR: 0.6, headH: 0.72, flare: 0.5, flareP: 2.3, taper: 0, fold: 0.12, foldF: 7, fold2: 0.05, hemA: 0.12, hemR: 0.08, hemF: 7, waveSpd: 1.25,
       mat: 'cloth', eyes: 'holes', eyeW: 0.095, eyeH: 0.15, eyeSp: 0.34, faceTop: 0.64, eyeRange: [0.3, 0.26], mouth: false, blush: false, arms: 'none', bob: 0.09, heavy: true,
       bump: 0.25, pool: 0.25, light: 'soft', halo: 0.38, tapSquint: true, cloth: true },
};

export class Ghost {
  constructor(canvas, design = 'default', opts = {}) {
    this.opts = opts;
    this.canvas = canvas;
    this.designName = DESIGNS[design] ? design : 'default';
    this.D = DESIGNS[this.designName];
    this.state = 'idle';           // idle | listening | thinking | speaking
    this.speakLevel = 0;           // 0..1, driven by TTS
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.lastPointerTime = 0;
    this.dragRot = 0; this.dragVel = 0; this.dragging = false;
    this.happy = 0; this.spin = 0; this.bounceT = 9;
    this.blinkT = 2 + Math.random() * 2; this.blink = 0;
    this.lookX = 0; this.lookY = 0;
    this.time = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    if (this.D.cloth) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.toneMappingExposure = 1.2; }

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.05, 6.2);
    this.camera.lookAt(0, 0.95, 0);

    this._lights();
    this._build();
    this.resize();
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    r.setAnimationLoop(this._loop);
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3f4a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-1.2, 3, 4); s.add(key);
    const warm = new THREE.DirectionalLight(0xff9a52, 3.8); warm.position.set(3.5, 1.6, -1.8); s.add(warm);   // peach/orange rim (right)
    const cool = new THREE.DirectionalLight(0x9cc0ff, 1.9); cool.position.set(-3.6, 1.2, -1.6); s.add(cool);  // cool rim (left)
    const fill = new THREE.PointLight(this.opts.accent || 0xffb27a, 0.0, 6); fill.position.set(0, 0.2, 1.4); s.add(fill);
    this.glowLight = fill;
    const L = this.D.light;
    if (L === 'moody') { key.intensity = 0.55; warm.intensity = 5.5; warm.position.set(2.2, 2.2, -3); cool.intensity = 1.2; s.children[0].intensity = 0.25; }
    if (L === 'soft') {   // directional key from the upper-left side + soft rims; low ambient so folds read in 3D
      key.intensity = 3.8; key.position.set(-3.2, 3.4, 1.7); warm.color.set(0xfff0e4); warm.intensity = 1.6; cool.color.set(0xdde8ff); cool.intensity = 1.5;
      s.children[0].intensity = 0.42; s.children[0].groundColor.set(0x15171c);
      const fillF = new THREE.DirectionalLight(0xeef2ff, 0.3); fillF.position.set(2.8, 0.6, 3.5); s.add(fillF);
      key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.blurSamples = 12;
      key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025;
      const sc = key.shadow.camera; sc.left = -1.8; sc.right = 1.8; sc.top = 2.4; sc.bottom = -1.2; sc.near = 0.5; sc.far = 12;
      this.keyLight = key; s.add(key.target); }
    if (L === 'chrome') { key.intensity = 1.2; warm.intensity = 6; warm.position.set(3, 1.2, -1.5); cool.intensity = 4; cool.color.set(0x7fb0ff); }
    if (L === 'flat') { key.intensity = 2.0; key.position.set(-0.5, 3, 4); warm.intensity = 1.2; warm.color.set(0xffe2c8); cool.intensity = 0.6; s.children[0].intensity = 0.9; }
    if (this.D.pool) {   // warm light pool under the ghost lights the inside of the hem
      const under = new THREE.PointLight(this.opts.accent || 0xff8a30, 6 * this.D.pool, 3.2, 1.6); under.position.set(0, -0.45, 0.2); s.add(under); this.underLight = under;
    }
  }

  _build() {
    const root = this.root = new THREE.Group();
    this.scene.add(root);
    this.body = new THREE.Group(); root.add(this.body);

    // --- Sheet body: lathe profile (dome head -> draped sheet -> flared hem with inward curl)
    const pts = [];
    const D = this.D;
    const H = D.H, hr = D.headR, hh = D.headH;
    // dome (top) down to neck-ish
    for (let i = 0; i <= 22; i++) {
      const a = (i / 22) * Math.PI * 0.5;          // 0 top -> 90deg side
      pts.push(new THREE.Vector2(Math.sin(a) * hr + 1e-4, H - hh + Math.cos(a) * hh));
    }
    // sheet down to hem, slightly flaring
    const yTop = H - hh;
    for (let i = 1; i <= 26; i++) {
      const t = i / 26;
      const y = yTop * (1 - t);
      const rr = Math.max(0.03, hr + 0.05 * Math.sin(t * Math.PI) + D.flare * Math.pow(t, D.flareP) - D.taper * Math.pow(t, 1.5) * hr / 0.62 * 0.62 - (D.taper ? 0 : 0));
      pts.push(new THREE.Vector2(rr, y));
    }
    // hem thickness curl
    const rb = pts[pts.length - 1].x;
    if (D.taper) { pts.push(new THREE.Vector2(0.012, -0.06)); pts.push(new THREE.Vector2(1e-4, -0.07)); }
    else {
      pts.push(new THREE.Vector2(rb - 0.03, -0.035));
      pts.push(new THREE.Vector2(rb - 0.07, -0.02));
      pts.push(new THREE.Vector2(rb - 0.1, 0.03));
      pts.push(new THREE.Vector2(rb - 0.16, 0.12));
    }
    this.H = H;
    if (D.lowProf) {           // low-poly: keep a handful of profile points
      const keep = []; const N = pts.length - (D.taper ? 2 : 4);
      for (let i = 0; i < D.lowProf; i++) keep.push(pts[Math.round(Math.pow(i / (D.lowProf - 1), 0.85) * (N - 1))]);
      keep.push(...pts.slice(N, N + 2));
      pts.length = 0; pts.push(...keep);
    }
    if (D.profMul) {           // densify for particles / smoke
      const dense = new THREE.SplineCurve(pts).getSpacedPoints(pts.length * D.profMul);
      pts.length = 0; pts.push(...dense);
    }
    const SEG = D.seg || (D.heavy ? 160 : 112);
    const geo = new THREE.LatheGeometry(pts, SEG);
    this.bodyGeo = geo;
    this.basePos = geo.attributes.position.array.slice();
    this.segCols = SEG + 1; this.profN = pts.length;

    const matOpts = {
      matte:    { color: 0xf3f0eb, roughness: 0.78, sheen: 0.9, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffc49a), clearcoat: 0.04, side: THREE.DoubleSide },
      cloth:    { color: 0xf1eee8, roughness: 0.95, sheen: 1.0, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffd2b0), side: THREE.DoubleSide },
      glossy:   { color: 0xf7f8fa, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide },
      felt:     { color: 0xeeebe6, roughness: 0.97, sheen: 0.7, sheenRoughness: 0.9, sheenColor: new THREE.Color(0xffd9bd), side: THREE.DoubleSide },
      smooth:   { color: 0xf7f5f2, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide },
      spectral: { color: 0xf0f0f2, roughness: 0.85, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffb27a), transparent: true, depthWrite: false, side: THREE.FrontSide },
      chrome:   { color: 0xe9edf3, metalness: 1, roughness: 0.06, iridescence: 1, iridescenceIOR: 1.35, envMapIntensity: 1.6, side: THREE.DoubleSide },
      paper:    { color: 0xf4f2ee, roughness: 0.62, flatShading: true, side: THREE.DoubleSide },
      ethereal: { color: 0xe9eef8, roughness: 0.6, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffa060), emissive: 0xff7a1a, emissiveIntensity: 0.08,
                  transparent: true, opacity: 0.62, depthWrite: false, side: THREE.FrontSide },
    }[D.mat];
    this.bodyMat = new THREE.MeshPhysicalMaterial({ metalness: 0, ...matOpts });
    if (D.mat === 'chrome') this.scene.environmentIntensity = 1.0;
    if (D.cloth) {   // cotton/linen weave height map + slight roughness variation
      const { bump, rough } = this._weaveTex();
      bump.repeat.set(9, 4); rough.repeat.set(3, 1.5);
      this.bodyMat.bumpMap = bump; this.bodyMat.bumpScale = 0.55;
      this.bodyMat.roughnessMap = rough; this.bodyMat.roughness = 1.0;
      this.bodyMat.color.set(0xffffff); this.bodyMat.sheen = 0.55; this.bodyMat.sheenColor.set(0xf4f7ff);
    } else if (D.bump) {
      const nt = this._noiseTex();
      nt.repeat.set(10, 5);
      this.bodyMat.bumpMap = nt; this.bodyMat.bumpScale = 1.6 * D.bump;
    }
    const ethereal = D.mat === 'ethereal';
    // soft fresnel rim boost: warm on the right, cool on the left (fake subsurface)
    const hemGlow = !!D.hemGlow, rimK = D.light === 'flat' ? 0.15 : D.light === 'moody' ? 0.75 : D.light === 'chrome' ? 0.35 : 0.5;
    this.bodyMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = { value: 0 };
      sh.uniforms.uTime = { value: 0 }; this._timeUniform = sh.uniforms.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vObjY;' + (D.cloth ? '\nattribute float aAO;\nvarying float vAO;' : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjY = position.y;' + (D.cloth ? '\nvAO = aAO;' : ''));
      if (D.cloth) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAO;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          float aoK = vAO * (gl_FrontFacing ? 1.0 : 0.42);
          reflectedLight.indirectDiffuse *= aoK; reflectedLight.directDiffuse *= mix(0.45, 1.0, aoK);
          reflectedLight.indirectSpecular *= aoK;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vObjY;\nuniform float uTime;');
      this._glowUniform = sh.uniforms.uGlow;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <opaque_fragment>', `
          vec3 nV = normalize(normal);
          float fr = pow(1.0 - clamp(abs(dot(nV, normalize(vViewPosition))), 0.0, 1.0), 2.6);
          vec3 rimCol = mix(vec3(0.55,0.68,1.0), vec3(1.0,0.55,0.25), smoothstep(-0.6, 0.6, nV.x));
          outgoingLight += rimCol * fr * (${(D.cloth ? 0.22 : rimK).toFixed(2)} + uGlow * 0.9)${D.cloth ? ' * (gl_FrontFacing ? vAO : 0.2)' : ''};
          outgoingLight += vec3(1.0,0.5,0.15) * uGlow * 0.06;
          ${hemGlow ? `float hg = 1.0 - smoothstep(-0.1, 0.95, vObjY);
            float flick = 0.85 + 0.15 * sin(uTime * 3.0 + vObjY * 9.0);
            float hg2 = hg * hg;
            outgoingLight = mix(outgoingLight, vec3(1.0, 0.38, 0.06) * 0.9, hg2 * 0.9 * flick);
            outgoingLight += vec3(1.0,0.4,0.08) * fr * hg * 0.7;
            diffuseColor.a = mix(1.0, 0.45, hg2);` : ''}
          ${ethereal ? 'diffuseColor.a = mix(0.28, 0.95, fr) ; outgoingLight += vec3(1.0,0.45,0.1) * (1.0 - fr) * 0.18;' : ''}
          #include <opaque_fragment>`);
    };
    if (D.cloth) geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1), 1));
    this.sheet = new THREE.Mesh(geo, this.bodyMat);
    if (D.cloth) { this.sheet.castShadow = true; this.sheet.receiveShadow = true; }
    this.body.add(this.sheet);

    // --- Face group (on the front of the dome)
    const face = this.face = new THREE.Group();
    face.position.set(0, D.faceTop ? H - D.faceTop : H - hh - 0.04, 0.0);
    this.body.add(face);

    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeGeo = new THREE.SphereGeometry(1, 32, 24);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();                 // rotates around head center -> eye slides on surface
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      const es = D.eyeW ? [D.eyeW, D.eyeH, 0.04] : { cute: [0.105, 0.15, 0.06], calm: [0.085, 0.16, 0.05], hollow: [0.1, 0.15, 0.04], holes: [0.105, 0.13, 0.02], visor: [0.1, 0.1, 0.05] }[D.eyes];
      ball.scale.set(...es); ball.userData.bs = es;
      eye.add(ball);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hlMat);
      hl.scale.set(0.028, 0.036, 0.01); hl.position.set(0.035, 0.06, 0.055); eye.add(hl);
      const hl2 = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), hlMat);
      hl2.scale.set(0.013, 0.013, 0.006); hl2.position.set(-0.03, -0.065, 0.055); eye.add(hl2);
      if (D.eyes === 'calm') { hl.scale.set(0.018, 0.03, 0.008); hl.position.set(0.03, 0.08, 0.046); hl.material = new THREE.MeshBasicMaterial({ color: 0xbfc6d4, transparent: true, opacity: 0.55 }); hl2.visible = false; }
      if (D.eyes === 'hollow') {
        ball.material = new THREE.MeshBasicMaterial({ color: 0x050307 });
        hl.visible = hl2.visible = false;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.14, 12, 40), new THREE.MeshBasicMaterial({ color: 0xffa24a }));
        ring.scale.set(0.1, 0.15, 0.05); ring.position.z = 0.02; eye.add(ring); ball.userData.ring = ring;
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicMaterial({ map: this._radialTex('rgba(255,122,26,0.75)', 'rgba(255,122,26,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.z = 0.03; eye.add(glow);
        const core = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35 }));
        core.scale.set(0.05, 0.08, 1); core.position.z = 0.045; eye.add(core);
      }
      if (D.eyes === 'holes') {
        ball.material = new THREE.MeshBasicMaterial({ color: 0x050407 });
        hl.visible = hl2.visible = false;
        if (D.eyeGlow) {
          const ember = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.55 }));
          ember.scale.set(D.eyeW * 0.35, D.eyeH * 0.3, 1); ember.position.set(0, -D.eyeH * 0.15, 0.052); eye.add(ember);
          const eg = new THREE.Mesh(new THREE.PlaneGeometry(D.eyeW * 2.4, D.eyeH * 2.0), new THREE.MeshBasicMaterial({ map: this._radialTex('rgba(255,110,20,0.6)', 'rgba(255,110,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          eg.position.set(0, -D.eyeH * 0.15, 0.054); eye.add(eg); this.embers = (this.embers || []).concat([ember, eg]);
        }
      }
      if (D.eyes === 'visor') ball.visible = hl.visible = hl2.visible = false;
      eye.position.set(0, 0, 0.78);
      pivot.add(eye);
      const sp = D.eyeSp || { cute: 0.33, calm: 0.3, hollow: 0.32, holes: 0.3, visor: 0.3 }[D.eyes];
      pivot.rotation.y = sx * sp;
      pivot.userData.baseY = sx * sp;
      pivot.rotation.x = 0.06;
      face.add(pivot);
      this.eyes.push({ pivot, eye, ball });
    }

    if (D.eyes === 'visor') {
      // single glowing slit visor hugging the head (cylinder arc on the lathe axis)
      const vy = this.face.position.y;
      const surfR = this._profileR(pts, vy) + 0.012;
      const vgeo = new THREE.CylinderGeometry(surfR, surfR, 0.075, 48, 1, true, -0.62, 1.24);
      const visorMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, side: THREE.DoubleSide });
      const visor = new THREE.Mesh(vgeo, visorMat);
      const vpivot = new THREE.Group(); vpivot.add(visor); vpivot.position.y = 0.04;
      // dark glass band behind the glow slit
      const band = new THREE.Mesh(new THREE.CylinderGeometry(surfR - 0.004, surfR - 0.004, 0.2, 48, 1, true, -0.8, 1.6), new THREE.MeshPhysicalMaterial({ color: 0x0c0e12, roughness: 0.1, clearcoat: 1, side: THREE.DoubleSide }));
      vpivot.add(band);
      const vglow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: this._radialTex('rgba(255,122,26,0.55)', 'rgba(255,122,26,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      vglow.position.z = surfR + 0.03; vpivot.add(vglow);
      vpivot.rotation.y = 0; // cylinder thetaStart is measured from +z
      visor.rotation.y = 0; band.rotation.y = 0;
      face.add(vpivot);
      visor.userData.bs = [1, 1, 1];
      this.eyes.push({ pivot: vpivot, eye: vpivot, ball: visor, noSnap: true });
      vpivot.userData.baseY = 0;
    }

    // mouth: small open happy smile (half ellipse)
    const ms = new THREE.Shape();
    ms.moveTo(-1, 0);
    ms.absellipse(0, 0, 1, 1, Math.PI, 2 * Math.PI, false);
    ms.quadraticCurveTo(0, 0.18, -1, 0);
    const mouthGeo = new THREE.ShapeGeometry(ms, 24);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1a0f12 });
    this.mouthPivot = new THREE.Group();
    this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff7a5a }));
    tongue.rotation.z = Math.PI; tongue.position.set(0.0, -0.55, 0.002); tongue.scale.set(1, 0.7, 1);
    this.mouth.add(tongue);
    this.mouth.position.set(0, 0, 0.803);
    this.mouth.scale.set(0.08, 0.07, 1);
    this.mouthPivot.add(this.mouth);
    this.mouthPivot.rotation.x = 0.3;
    face.add(this.mouthPivot);
    this.mouthPivot.visible = D.mouth;

    // blush
    const blushTex = this._radialTex('rgba(255,140,110,0.55)', 'rgba(255,140,110,0)');
    for (const sx of [-1, 1]) {
      const p = new THREE.Group();
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }));
      b.position.set(0, 0, 0.79);
      b.visible = D.blush; p.add(b); p.rotation.y = sx * 0.55; p.rotation.x = 0.24; face.add(p);
    }

    // --- Stubby arms (capsules) on pivots
    this.arms = [];
    const armGeo = D.arms === 'subtle' ? new THREE.CapsuleGeometry(0.09, 0.2, 8, 16) : new THREE.CapsuleGeometry(0.13, 0.22, 8, 16);
    for (const sx of (D.arms === 'none' ? [] : [-1, 1])) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (hr + 0.02), H - hh - 0.46 - (D.arms === 'subtle' ? 0.12 : 0), 0.06);
      const arm = new THREE.Mesh(armGeo, this.bodyMat);
      arm.position.set(sx * 0.17, -0.12, 0);
      arm.rotation.z = sx * (D.arms === 'subtle' ? 0.55 : 1.05);
      if (D.arms === 'subtle') arm.position.set(sx * 0.06, -0.12, 0);
      if (D.arms === 'fins') { arm.scale.set(0.55, 0.75, 0.22); arm.position.set(sx * 0.08, -0.04, -0.05); arm.material = this.bodyMat; }
      pivot.add(arm);
      this.body.add(pivot);
      this.arms.push({ pivot, sx });
    }

    this._snapToSurface();
    if (D.render) buildFX(this);
    if (ethereal) {
      const ig = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.4), new THREE.MeshBasicMaterial({ map: this._radialTex('rgba(255,120,30,0.55)', 'rgba(255,120,30,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      ig.position.set(0, H * 0.55, 0); this.body.add(ig); this.innerGlow = ig;
      this.sheet.renderOrder = 2;
    }

    // --- Thinking dots (orange)
    this.dots = new THREE.Group();
    const dotMat = new THREE.MeshBasicMaterial({ color: this.opts.accent || 0xff7a1a, transparent: true, opacity: 0 });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), dotMat.clone());
      this.dots.add(d);
    }
    this.dots.position.set(0.62, H + 0.02, 0.1);
    this.body.add(this.dots);

    // --- Listening ring (orange halo on ground)
    const ringTex = this._ringTex();
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = -0.58;
    root.add(this.ring);

    // --- Soft ground shadow
    const shTex = this._radialTex('rgba(10,14,24,0.55)', 'rgba(10,14,24,0)');
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -0.6;
    root.add(this.shadow);
    if (this.D.halo) {
      this.halo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: this._radialTex('rgba(235,240,255,0.55)', 'rgba(235,240,255,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: this.D.halo }));
      this.halo.position.set(0, this.D.H * 0.55, -1.0); root.add(this.halo);
    }
    if (this.D.pool) {
      const ac = new THREE.Color(this.opts.accent || 0xff8a30), rgb = `${Math.round(ac.r * 255)},${Math.round(ac.g * 255)},${Math.round(ac.b * 255)}`;
      const pt = this._radialTex(`rgba(${rgb},1)`, `rgba(${rgb},0)`);
      this.pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: pt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 * this.D.pool }));
      this.pool.rotation.x = -Math.PI / 2; this.pool.position.y = -0.59; root.add(this.pool);
      this.shadow.scale.setScalar(1.5);
    }
    if (this.D.cloth) {
      if (this.pool) { this.pool.material.map = this._radialTex('rgba(236,240,248,1)', 'rgba(236,240,248,0)'); this.pool.scale.setScalar(1); this.pool.renderOrder = 1; }
      this.pool.geometry = new THREE.PlaneGeometry(3.4, 2.6);
      this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ color: 0x05070c, opacity: 0.55, transparent: true, depthWrite: false }));
      this.catcher.rotation.x = -Math.PI / 2; this.catcher.position.y = -0.6; this.catcher.receiveShadow = true; this.catcher.renderOrder = 2; root.add(this.catcher);
      this.shadow.material.map = this._radialTex('rgba(4,6,10,0.85)', 'rgba(4,6,10,0)'); this.shadow.renderOrder = 3; this.shadow.scale.setScalar(0.85);
      this.shadowBase = 0.85;
    }
  }

  _profileR(pts, y) {
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y); }
    return this.D.headR;
  }

  _snapToSurface() {
    // Ray-cast from the face centre along each feature's direction to sit it right on the sheet.
    this.body.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = true;
    const origin = new THREE.Vector3(), dir = new THREE.Vector3();
    const snap = (obj, lift) => {
      const parent = obj.parent;
      this.face.getWorldPosition(origin);
      const p = new THREE.Vector3(0, 0, 1).applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
      dir.copy(p).normalize();
      // cast from outside inward so we hit the outer surface
      rc.set(origin.clone().addScaledVector(dir, 3), dir.clone().negate());
      const hit = rc.intersectObject(this.sheet, false)[0];
      if (hit) obj.position.z = 3 - hit.distance + lift;
    };
    const lift = this.D.eyeW ? -0.022 : { cute: -0.012, calm: -0.016, hollow: -0.02, holes: -0.014, visor: 0 }[this.D.eyes];
    for (const e of this.eyes) if (!e.noSnap) snap(e.eye, lift);
    snap(this.mouth, 0.012);
    this.face.children.forEach(c => { const m = c.children[0]; if (m && m.geometry && m.geometry.type === 'PlaneGeometry') snap(m, 0.008); });
  }

  _noiseTex() {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = 128 + (Math.random() - 0.5) * 120; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.5; g.filter = 'blur(1px)'; g.drawImage(c, 0, 0);   // soften into felt fibres
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }

  _weaveTex() {
    // plain-weave cotton/linen: over/under threads with slub (thickness) variation, as a height map
    const N = 512, T = 32, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data, cell = N / T;
    const slubU = [], slubV = [];
    for (let i = 0; i < T; i++) { slubU.push(0.75 + Math.random() * 0.5); slubV.push(0.75 + Math.random() * 0.5); }
    const rough = document.createElement('canvas'); rough.width = rough.height = 256;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), fx = (x % cell) / cell, fy = (y % cell) / cell;
      const over = (cx + cy) % 2 === 0;                 // warp over weft?
      const warp = Math.sin(fx * Math.PI) * slubU[cx] * (over ? 1 : 0.55) * (0.6 + 0.4 * Math.sin(fy * Math.PI));
      const weft = Math.sin(fy * Math.PI) * slubV[cy] * (over ? 0.55 : 1) * (0.6 + 0.4 * Math.sin(fx * Math.PI));
      let v = Math.max(warp, weft) * 0.8 + (Math.random() - 0.5) * 0.12;
      const k = (y * N + x) * 4; d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, 40 + v * 200)); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const rg = rough.getContext('2d'), ri = rg.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = 215 + Math.random() * 40; ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = v; ri.data[i * 4 + 3] = 255; }
    rg.putImageData(ri, 0, 0); rg.filter = 'blur(6px)'; rg.drawImage(rough, 0, 0); rg.filter = 'none';
    const bump = new THREE.CanvasTexture(c), rt = new THREE.CanvasTexture(rough);
    for (const t of [bump, rt]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); }
    return { bump, rough: rt };
  }

  _radialTex(c0, c1) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _ringTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    const ac = new THREE.Color(this.opts.accent || 0xff7a1a), rc = `${Math.round(ac.r * 255)},${Math.round(ac.g * 255)},${Math.round(ac.b * 255)}`;
    gr.addColorStop(0, `rgba(${rc},0)`); gr.addColorStop(0.72, `rgba(${rc},0.9)`);
    gr.addColorStop(0.8, `rgba(${rc},0.35)`); gr.addColorStop(1, `rgba(${rc},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the ghost comfortably sized on narrow phones; it sits in the upper part of the screen
    const narrow = w / h < 0.7;
    this.camera.fov = 34;
    const k = ((this.D.frameH || this.D.H) + 0.6) / 2.75 * (this.D.zoom || 1) * (this.opts.compact ? 1.42 : 1);               // frame taller designs
    const dist = (narrow ? 9.0 : 7.6) * k;
    const look = this.D.H / 2 - (narrow ? 1.05 : 0.72) * k * (this.opts.compact ? 1.25 : 1) + (this.D.zoom ? 0.35 : 0);
    this.camera.position.set(0, look + (this.D.cloth ? 2.3 : 0.58), dist);
    this.camera.lookAt(0, look, 0);
    this.camera.updateProjectionMatrix();
  }

  setPointer(nx, ny) { this.pointer.set(nx, ny); this.pointerActive = true; this.lastPointerTime = this.time; }
  dragBy(dx) { this.dragRot += dx * 0.012; this.dragVel = dx * 0.012 / 0.016; }
  setState(s) { this.state = s; }
  react() {
    this.happy = 1; this.bounceT = 0;
    if (this.D.tapSquint) { this.wiggle = 1; } else this.spin = Math.PI * 2;
  }
  surprise() { this.widen = 1; }

  _deformSheet(t, wave) {
    const pos = this.bodyGeo.attributes.position;
    const a = pos.array, b = this.basePos, H = this.H;
    const n = pos.count;
    const aoAttr = this.bodyGeo.attributes.aAO, aoA = aoAttr ? aoAttr.array : null;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      const x = b[k], y = b[k + 1], z = b[k + 2];
      const r = Math.hypot(x, z);
      if (r < 1e-3) { a[k] = x; a[k + 1] = y; a[k + 2] = z; continue; }
      const th = Math.atan2(z, x);
      const D = this.D;
      const fold = smooth(H - D.headH + 0.15, 0.2, y);   // folds grow toward the hem
      const hem = smooth(0.55, -0.02, y);              // hem region
      const ph = th * D.hemF + t * D.waveSpd * wave;
      let dr = D.fold * Math.sin(th * D.foldF) * fold + D.hemR * Math.sin(ph + 0.9) * hem;
      dr += D.fold2 * Math.sin(th * (D.heavy ? 9 : 13) - t * (D.heavy ? 0.4 : 1.3) + 1.0) * fold;
      if (D.heavy) dr += (0.03 * Math.sin(th * 13 + 2.0) + 0.02 * Math.sin(th * 3 + 0.5)) * fold * fold;
      let dy = D.hemA * Math.sin(ph) * hem + 0.03 * Math.sin(th * 3 + t * 1.1) * hem;
      if (D.heavy) dy += 0.06 * Math.sin(th * 2 + 0.7) * hem;   // uneven sheet length
      if (D.lowProf) { const hsh = Math.sin(x * 97.13 + z * 53.71 + y * 31.37) * 43758.5453; dr += ((hsh - Math.floor(hsh)) - 0.5) * 0.07 * (0.3 + fold); }
      let s = (r + dr) / r;
      if (aoA) {     // cavity AO: inner fold valleys + under the drape + neck crease
        const fv = (D.fold * Math.sin(th * D.foldF) + D.fold2 * Math.sin(th * 9 - t * 0.4 + 1.0) + 0.03 * Math.sin(th * 13 + 2.0)) * fold;
        const cav = Math.max(0, -fv / (D.fold + D.fold2 + 0.03));
        const under = smooth(0.35, -0.05, y) * 0.18;
        aoA[i] = Math.max(0.3, 1 - cav * 0.75 - under);
      }
      let ox = 0, oz = 0;
      if (D.tail) {                                     // wispy tail: lower body bends and swirls
        const w = Math.pow(smooth(1.3, -0.1, y), 2);
        ox = 0.32 * w * Math.sin(t * 1.3 + y * 2.2);
        oz = 0.12 * w * Math.cos(t * 1.1 + y * 1.8);
        s *= 1 + 0.25 * w * Math.sin(th * 4 + t * 2.5 + y * 6);
      }
      a[k] = x * s + ox; a[k + 1] = y + dy; a[k + 2] = z * s + oz;
    }
    pos.needsUpdate = true; if (aoAttr) aoAttr.needsUpdate = true;
    this.bodyGeo.computeVertexNormals();
    // fix lathe seam normals (first and last columns share positions)
    const nr = this.bodyGeo.attributes.normal.array, P = this.profN, last = (this.segCols - 1) * P;
    for (let j = 0; j < P; j++) {
      const i0 = j * 3, i1 = (last + j) * 3;
      for (let c = 0; c < 3; c++) { const v = (nr[i0 + c] + nr[i1 + c]) * 0.5; nr[i0 + c] = nr[i1 + c] = v; }
    }
    this.bodyGeo.attributes.normal.needsUpdate = true;
  }

  _loop() {
    const now = performance.now(); const dt = Math.min((now - this._last) / 1000, 0.05); this._last = now;
    const t = (this.time += dt);
    const st = this.state;

    // --- float + drift
    const speed = st === 'thinking' ? 1.6 : 1;
    let bob = Math.sin(t * (this.D.heavy ? 1.1 : 1.6) * speed) * this.D.bob;
    let driftX = Math.sin(t * 0.45) * 0.08;
    // tap bounce (squash & stretch)
    this.bounceT += dt;
    const bt = this.bounceT;
    let squash = 0;
    if (bt < 0.9) { bob += Math.sin(Math.min(bt / 0.55, 1) * Math.PI) * 0.32; squash = Math.sin(bt * 18) * Math.exp(-bt * 5) * 0.12; }
    if (st === 'speaking') bob += this.speakLevel * 0.04;
    this.body.position.set(driftX, bob, 0);
    this.body.scale.set(1 + squash, 1 - squash, 1 + squash);

    // --- spin from tap, drag rotation with spring back
    this.spin = damp(this.spin, 0, 3.2, dt);
    if (!this.dragging) { this.dragRot = damp(this.dragRot, 0, 2.2, dt); }
    // --- look target
    let lx = 0, ly = 0;
    if (this.pointerActive && t - this.lastPointerTime < 4) { lx = this.pointer.x; ly = this.pointer.y; }
    else if (this.tilt && t - this.tilt.t < 1.5) { lx = this.tilt.x; ly = this.tilt.y; }
    else {
      // idle: glance around (quick saccades to random spots, then hold)
      this._wT = (this._wT ?? 0) - dt;
      if (this._wT <= 0) { this._wT = 1.2 + Math.random() * 2.4; this._wX = (Math.random() * 2 - 1) * 0.75; this._wY = (Math.random() * 2 - 1) * 0.45; if (Math.random() < 0.3) { this._wX = 0; this._wY = 0; } }
      lx = this._wX; ly = this._wY;
    }
    if (this.iconMode) { lx = 0; ly = 0.05; }
    if (st === 'thinking') { lx = (this.D.tapSquint ? 0.15 : 0.45) + Math.sin(t * 1.3) * 0.15; ly = 0.75; }
    if (st === 'listening') { ly = Math.max(ly, 0) * 0.5; }
    this.lookX = damp(this.lookX, lx, 6, dt); this.lookY = damp(this.lookY, ly, 6, dt);

    this.body.rotation.y = this.lookX * 0.45 + this.dragRot + this.spin;
    this.body.rotation.x = -this.lookY * 0.12 + (st === 'listening' ? 0.06 : 0);
    this.wiggle = Math.max(0, (this.wiggle || 0) - dt * 1.4);
    this.body.rotation.z = (this.D.tilt || 0) + Math.sin(t * 22) * 0.07 * this.wiggle + Math.sin(t * 0.9) * 0.04 + (st === 'thinking' ? Math.sin(t * 1.4) * 0.07 : 0) - driftX * 0.3;

    // eyes slide over the dome toward the pointer
    for (const e of this.eyes) {
      const er = this.D.eyeRange || [0.22, 0.18];
      e.pivot.rotation.y = e.pivot.userData.baseY + this.lookX * er[0];
      e.pivot.rotation.x = 0.06 - this.lookY * er[1];
    }
    this.mouthPivot.rotation.y = this.lookX * 0.16;
    this.mouthPivot.rotation.x = 0.3 - this.lookY * 0.1;

    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.2 + Math.random() * 3.2; if (Math.random() < 0.2) this.blinkT = 0.25; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkS = 1 - Math.sin(this.blink * Math.PI) * 0.92;
    this.happy = Math.max(0, this.happy - dt * 0.7);
    const happyEye = 1 - smooth(0, 0.3, this.happy) * (this.D.tapSquint ? 0.85 : 0.55);            // squinty happy eyes
    this.widen = Math.max(0, (this.widen || 0) - dt * 0.9);
    let listenEye = (st === 'listening' ? 1.12 + Math.sin(t * 6) * 0.07 : 1) * (1 + smooth(0, 0.4, this.widen) * 0.28);
    if (this.iconMode) { this.blink = 0; }
    const talkSquash = st === 'speaking' ? 1 - 0.22 * (this.speakLevel || 0) : 1;
    for (const e of this.eyes) { const b = e.ball.userData.bs; e.ball.scale.set(b[0] * listenEye * (2 - talkSquash), b[1] * blinkS * happyEye * listenEye * talkSquash, b[2]); if (e.ball.userData.ring) e.ball.userData.ring.scale.set(0.1 * listenEye, 0.15 * blinkS * happyEye * listenEye, 0.05); }

    // mouth
    let mo = 1;
    if (st === 'speaking') { const lv = Math.max(this.speakLevel, 0.25 + 0.75 * Math.abs(Math.sin(t * 11) * Math.sin(t * 4.3))); mo = 0.45 + lv * 1.1; }
    else if (st === 'thinking') mo = 0.45;
    else if (st === 'listening') mo = 0.75;
    mo *= 1 + this.happy * 0.5;
    this.mouth.scale.set(0.08 * (st === 'thinking' ? 0.7 : 1) * (1 + this.happy * 0.2), 0.07 * mo, 1);

    // arms: idle sway, wave when happy/speaking, raised when listening
    for (const arm of this.arms) {
      let z = Math.sin(t * 1.6 + arm.sx) * 0.12;
      if (st === 'speaking') z += Math.sin(t * 5 + arm.sx) * 0.18;
      if (st === 'listening') z += 0.55;
      if (st === 'thinking' && arm.sx > 0) z += 0.9 + Math.sin(t * 2) * 0.08;  // hand-to-chin-ish
      if (this.happy > 0) z += this.happy * (0.9 + Math.sin(t * 16) * 0.5);
      arm.pivot.rotation.z = arm.sx * z;
    }

    // thinking dots
    const thinkOn = st === 'thinking' ? 1 : 0;
    this.dots.children.forEach((d, i) => {
      d.material.opacity = damp(d.material.opacity, thinkOn * (0.45 + 0.55 * Math.max(0, Math.sin(t * 5 - i * 0.9))), 8, dt);
      d.position.set((i - 1) * 0.2, Math.max(0, Math.sin(t * 5 - i * 0.9)) * 0.1, 0.3);
    });

    // listening ring + inner glow
    const ringTarget = st === 'listening' ? 0.75 + Math.sin(t * 6) * 0.25 : 0;
    this.ring.material.opacity = damp(this.ring.material.opacity, ringTarget, 6, dt);
    const rs = 1 + (st === 'listening' ? Math.sin(t * 6) * 0.06 : 0);
    this.ring.scale.set(rs, rs, 1);
    let glow = st === 'speaking' ? 0.35 + this.speakLevel * 0.65 : st === 'listening' ? 0.45 + Math.sin(t * 6) * 0.2 : st === 'thinking' ? 0.25 + Math.sin(t * 3) * 0.15 : 0.05;
    glow += this.happy * 0.4;
    this._g = damp(this._g || 0, glow, 6, dt);
    if (this._glowUniform) this._glowUniform.value = this._g;
    this.glowLight.intensity = this._g * 2.2;

    // shadow follows height
    const h = this.body.position.y;
    const ss = (1 - h * 0.35) * (this.shadowBase || 1);
    this.shadow.scale.set(ss, ss, 1);
    this.shadow.material.opacity = Math.max(0.25, 0.95 - h * 0.9) * (this.D.mat === 'ethereal' ? 0.5 : 1);
    if (this._timeUniform) this._timeUniform.value = t;
    if (this.pool) { const ps = 1 - h * 0.3; this.pool.scale.set(ps, ps, 1); this.pool.position.x = driftX; this.pool.material.opacity = (0.75 + 0.15 * Math.sin(t * 1.7)) * (this.D.pool2 || this.D.pool) * (1 - h * 0.4) + this._g * 0.3; }
    if (this.underLight) this.underLight.intensity = (6 * this.D.pool * (1 - h * 0.5)) * (this.D.cloth ? 0 : 1) + this._g * (this.D.cloth ? 0.6 : 3);
    if (this.embers) this.embers.forEach(m => m.material.opacity = (0.45 + 0.2 * Math.sin(t * 2.3)) + this._g * 0.4);
    if (this.innerGlow) { this.innerGlow.material.opacity = 0.75 + this._g * 0.6 + Math.sin(t * 2) * 0.1; this.innerGlow.lookAt(this.camera.position); }
    this.shadow.position.x = driftX;

    this._deformSheet(t, st === 'speaking' ? 1.5 : 1);
    updateFX(this, t, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
