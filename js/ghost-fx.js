// Extra render styles for ghost designs E–H: particles, smoke, low-poly edges.
import * as THREE from 'three';

const NOISE = `
float hash3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

export function buildFX(g) {
  const D = g.D, H = g.H;
  g.fx = {};
  const eyeU = () => ({
    uEyeX: { value: Math.sin(D.eyeSp) * D.headR }, uEyeY: { value: g.face.position.y },
    uEyeW: { value: D.eyeW * 0.95 }, uEyeH: { value: D.eyeH * 0.95 },
  });

  if (D.render === 'particles') {
    g.sheet.visible = false;
    for (const e of g.eyes) e.eye.visible = false;
    const n = g.bodyGeo.attributes.position.count;
    const rnd = new Float32Array(n); for (let i = 0; i < n; i++) rnd[i] = Math.random();
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', g.bodyGeo.attributes.position);   // shares the animated sheet
    pg.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uAccent: { value: new THREE.Color(g.opts.accent || 0xff8030) }, uTime: { value: 0 }, uGlow: { value: 0 }, uPR: { value: g.renderer.getPixelRatio() }, uH: { value: H }, ...eyeU() },
      vertexShader: `attribute float rnd; uniform vec3 uAccent; uniform float uTime, uGlow, uPR, uH, uEyeX, uEyeY, uEyeW, uEyeH;
        varying vec3 vCol; varying float vA;
        void main(){
          vec3 p = position; float r = length(p.xz);
          float w = sin(p.y * 7.0 - uTime * 2.2 + rnd * 6.283) * 0.5 + 0.5;
          p.xz *= 1.0 + 0.035 * sin(uTime * 1.8 + rnd * 40.0 + p.y * 5.0) + 0.02 * w;
          p.y += 0.025 * sin(uTime * 1.4 + rnd * 25.0);
          float ex = (abs(p.x) - uEyeX) / uEyeW, ey = (p.y - uEyeY) / uEyeH;
          float hole = 1.0 - smoothstep(1.0, 1.2, ex * ex + ey * ey);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.55 + 0.9 * rnd) * (1.0 - hole) * smoothstep(0.02, 0.16, r);
          gl_PointSize = size * uPR * (30.0 + uGlow * 10.0) / -mv.z;
          float h = clamp(p.y / uH, 0.0, 1.0);
          // mostly soft white; faint warm glow at the hem + occasional orange sparks
          vec3 white = mix(vec3(0.86, 0.89, 0.96), vec3(1.0, 0.98, 0.95), w);
          float hemWarm = (1.0 - smoothstep(0.0, 0.22, h)) * 0.55;
          float spark = step(0.955, rnd) * (0.6 + 0.4 * sin(uTime * 3.0 + rnd * 50.0));
          vCol = mix(white, uAccent, clamp(hemWarm + spark, 0.0, 0.9));
          vA = (0.6 + 0.4 * w) * (0.95 + uGlow * 0.5) * (p.z < 0.0 ? 0.3 : 1.0);
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.6) * vA; gl_FragColor = vec4(vCol * a, 1.0); }`,
    });
    const pts = new THREE.Points(pg, mat); pts.frustumCulled = false;
    g.body.add(pts); g.fx.mat = mat;
    // drifting dust motes around the ghost
    const M = 260, mp = new Float32Array(M * 3), mr = new Float32Array(M);
    for (let i = 0; i < M; i++) { mp[i * 3] = (Math.random() - 0.5) * 3; mp[i * 3 + 1] = Math.random() * (H + 0.6) - 0.5; mp[i * 3 + 2] = (Math.random() - 0.5) * 2; mr[i] = Math.random(); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(mp, 3)); mg.setAttribute('rnd', new THREE.BufferAttribute(mr, 1));
    const motes = new THREE.Points(mg, mat); motes.frustumCulled = false; g.root.add(motes); g.fx.motes = mg;
  }

  if (D.render === 'smoke') {
    g.sheet.visible = false;
    const mk = (scale, seed, op) => {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uGlow: { value: 0 }, uSeed: { value: seed }, uOp: { value: op }, uH: { value: H } },
        vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: NOISE + `uniform float uTime, uGlow, uSeed, uOp, uH; varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){
            vec3 n = normalize(vN); float facing = abs(dot(n, normalize(vV)));
            float h = clamp(vP.y / uH, 0.0, 1.0);
            float f = fbm(vP * 2.6 + vec3(uSeed, -uTime * 0.35 + uSeed, uTime * 0.12));
            float f2 = fbm(vP * 6.0 + vec3(0.0, -uTime * 0.6, uSeed));
            float erode = mix(0.66, 0.26, smoothstep(0.0, 0.6, h));          // dissolves toward the hem
            float a = smoothstep(erode, erode + 0.25, f * 0.75 + f2 * 0.35);
            a *= mix(0.55, 1.0, facing) * uOp;
            a *= smoothstep(-0.05, 0.12, vP.y + f * 0.2);
            float light = dot(n, normalize(vec3(-0.4, 0.8, 0.6))) * 0.5 + 0.5;
            vec3 col = mix(vec3(0.72, 0.75, 0.82), vec3(1.0, 1.0, 1.0), light);
            col = mix(col, vec3(1.0, 0.55, 0.22), (1.0 - smoothstep(0.0, 0.45, h)) * 0.55 + uGlow * 0.25);
            gl_FragColor = vec4(col, a);
          }`,
      });
      const mesh = new THREE.Mesh(g.bodyGeo, m); mesh.scale.setScalar(scale); mesh.renderOrder = 1; g.body.add(mesh); return m;
    };
    g.fx.mats = [mk(1.0, 0.0, 0.85), mk(1.05, 7.3, 0.45), mk(0.94, 3.1, 0.7)];
    for (const e of g.eyes) e.eye.traverse(o => { if (o.material) { o.renderOrder = 5; } });
    // wisps shed from the hem
    const W = 140, wp = new Float32Array(W * 3), wd = [];
    for (let i = 0; i < W; i++) wd.push({ life: Math.random(), th: Math.random() * 6.283, sp: 0.2 + Math.random() * 0.3 });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(235,238,245,0.5)'); gr.addColorStop(1, 'rgba(235,238,245,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const wm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uPR: { value: g.renderer.getPixelRatio() } },
      vertexShader: `attribute float life; uniform float uPR; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPR * (60.0 + life * 120.0) / -mv.z; }`,
      fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 2.2) * (1.0 - vL) * 0.22; gl_FragColor = vec4(mix(vec3(1.0,0.7,0.45), vec3(0.9,0.92,0.97), vL), a); }` });
    wg.setAttribute('life', new THREE.BufferAttribute(new Float32Array(W), 1));
    const wisps = new THREE.Points(wg, wm); wisps.frustumCulled = false; g.body.add(wisps);
    g.fx.wisps = { geo: wg, data: wd };
  }

  if (D.render === 'lowpoly') {
    const idx = g.bodyGeo.index.array, seen = new Set(), li = [];
    for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) {
      const k = a < b ? a + '_' + b : b + '_' + a; if (!seen.has(k)) { seen.add(k); li.push(a, b); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', g.bodyGeo.attributes.position); lg.setIndex(li);
    const lm = new THREE.LineBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(lg, lm); lines.scale.setScalar(1.002); g.body.add(lines); g.fx.lines = lm;
  }
}

export function updateFX(g, t, dt) {
  const fx = g.fx; if (!fx) return;
  if (fx.mat) {
    const u = fx.mat.uniforms; u.uTime.value = t; u.uGlow.value = g._g || 0;
    u.uEyeX.value = Math.sin(g.D.eyeSp) * g.D.headR; u.uEyeY.value = g.face.position.y + g.lookY * 0.12;
    if (fx.motes) { const a = fx.motes.attributes.position.array; for (let i = 0; i < a.length; i += 3) { a[i + 1] += dt * 0.12; if (a[i + 1] > g.H + 0.4) a[i + 1] = -0.5; } fx.motes.attributes.position.needsUpdate = true; }
  }
  if (fx.mats) for (const m of fx.mats) { m.uniforms.uTime.value = t; m.uniforms.uGlow.value = g._g || 0; }
  if (fx.wisps) {
    const a = fx.wisps.geo.attributes.position.array, R = g.D.headR + g.D.flare * 0.8;
    fx.wisps.data.forEach((w, i) => {
      w.life += dt * w.sp; if (w.life > 1) { w.life = 0; w.th = Math.random() * 6.283; }
      const rr = R * (0.8 + w.life * 0.6);
      a[i * 3] = Math.cos(w.th) * rr + Math.sin(t + i) * 0.05; a[i * 3 + 1] = 0.15 - w.life * 0.6; a[i * 3 + 2] = Math.sin(w.th) * rr;
      fx.wisps.geo.attributes.life.array[i] = w.life;
    });
    fx.wisps.geo.attributes.position.needsUpdate = true; fx.wisps.geo.attributes.life.needsUpdate = true;
  }
  if (fx.lines) fx.lines.opacity = 0.5 + (g._g || 0) * 0.5 + Math.sin(t * 2) * 0.05;
}
