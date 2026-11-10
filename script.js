/* Ocean Surf Camp: first screen
   - Layout is plain HTML/CSS. The script only reads where the headline words sit
     and draws photo + headline + surfer on a WebGL canvas behind the copy.
   - The water effect: a wake leaves the surfer and drags FIRST and WAVE along its curve
     (same model as Lowtide). "CATCH YOUR" and the surfer stay sharp.
   - Without WebGL the plain <img> layers stay visible. */
(function () {
  'use strict';

  const hero = document.querySelector('.hero');
  const canvas = document.getElementById('gl');
  const photoEl = hero.querySelector('.hero__photo');
  const wordEls = {
    catch: hero.querySelector('[data-word="catch"]'),
    first: hero.querySelector('[data-word="first"]'),
    wave: hero.querySelector('[data-word="wave"]')
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- mobile menu ---------- */
  const root = document.documentElement;
  const toggle = hero.querySelector('.menu-toggle');
  const nav = document.getElementById('nav');
  function setMenu(open) {
    root.classList.toggle('is-menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.menu-toggle__label').textContent = open ? 'Close' : 'Menu';
  }
  toggle.addEventListener('click', () => setMenu(!root.classList.contains('is-menu-open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  matchMedia('(min-width: 761px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  /* ---------- optical centering of button labels on the torn plates ---------- */
  const measure = document.createElement('canvas').getContext('2d');
  function centerLabels() {
    hero.querySelectorAll('.btn').forEach(btn => {
      const label = btn.querySelector('.btn__label');
      const inner = label.querySelector('span');
      const cs = getComputedStyle(btn);
      measure.font = cs.fontWeight + ' ' + cs.fontSize + ' Inter';
      try { measure.letterSpacing = cs.letterSpacing; } catch (_) {}
      const m = measure.measureText((inner.getAttribute('data-t') || inner.textContent).toUpperCase());
      const dx = m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      label.style.setProperty('--dx', dx.toFixed(2) + 'px');
    });
  }

  /* ---------- geometry ---------- */
  // The photo and the surfer cut-out share one 1920 × 1080 frame.
  const PHOTO_W = 1920, PHOTO_H = 1080;
  const FOCUS = [0.286, 0.52];                 // the surfer, kept in view on narrow screens
  const SURFER_PT = [662, 595];                 // where the wave starts, in photo px
  const SURFER_TOP = 365;                       // top of the surfer cut-out, in photo px
  const L = {                                    // filled by layout(), CSS px
    W: 1, H: 1, photo: [0, 0, PHOTO_W, PHOTO_H], k: 1,
    words: { catch: [0, 0, 1, 1], first: [0, 0, 1, 1], wave: [0, 0, 1, 1] },
    path: [], seg: [], total: 1
  };
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  function layout() {
    const r = hero.getBoundingClientRect();
    L.W = Math.max(1, r.width); L.H = Math.max(1, r.height);
    for (const k in wordEls) {
      const b = wordEls[k].getBoundingClientRect();
      L.words[k] = [b.left - r.left, b.top - r.top, b.width, b.height];
    }
    L.k = Math.max(0.2, L.words.first[3] / 225);

    // cover-fit the photo, keeping the surfer in frame.
    // On tall phone screens the photo is enlarged a little and the surfer moves
    // below the headline, so FIRST WAVE stays readable.
    const aspect = L.W / L.H;
    const land = clamp((aspect - 0.75) / (1.78 - 0.75), 0, 1);
    const tall = clamp((0.75 - aspect) / (0.75 - 0.46), 0, 1);
    const fit = (zoom, ty) => {
      const ds = Math.max(L.W / PHOTO_W, L.H / PHOTO_H) * zoom;
      const dw = PHOTO_W * ds, dh = PHOTO_H * ds;
      const tx = 0.5 + (0.29 - 0.5) * land;
      return [
        clamp(FOCUS[0] * dw - tx * L.W, 0, dw - L.W),
        clamp(FOCUS[1] * dh - ty * L.H, 0, dh - L.H),
        dw, dh, ds
      ];
    };
    let zoom = 1, ty = 0.5;
    const stacked = Math.abs(L.words.first[1] - L.words.wave[1]) > L.words.first[3] * 0.5;
    if (tall > 0 || stacked) {
      // enlarge just enough that the surfer's head starts under the lowest headline line
      const base = Math.max(L.W / PHOTO_W, L.H / PHOTO_H);
      const low = L.words.wave[1] > L.words.first[1] ? L.words.wave : L.words.first;
      const need = (low[1] + low[3] * 0.9) / (SURFER_TOP * base);
      zoom = clamp(Math.max(need, 1 + 0.1 * tall), 1, 1.45);
      ty = 1;                                   // top of the photo stays at the top
    }
    const g = fit(zoom, ty);
    L.photo = g.slice(0, 4);
    const ds = g[4];
    const plain = fit(1, 0.5);   // the <img> fallback cannot zoom, only shift
    photoEl.style.setProperty('--photo-pos', (-plain[0]).toFixed(1) + 'px ' + (-plain[1]).toFixed(1) + 'px');

    buildPath(ds);
  }

  // Wake: leaves the surfer and crosses the headline on a diagonal, like the wake in Lowtide
  // crosses the rows, so only a band of letters is bent and the rest stays whole.
  // Points are relative to the box around FIRST and WAVE (x 0..1 across, y 0..1 down).
  function buildPath(ds) {
    const f = L.words.first, w = L.words.wave;
    const box = [Math.min(f[0], w[0]), Math.min(f[1], w[1])];
    box.push(Math.max(f[0] + f[2], w[0] + w[2]) - box[0], Math.max(f[1] + f[3], w[1] + w[3]) - box[1]);
    const at = ([x, y]) => [box[0] + box[2] * x, box[1] + box[3] * y];
    const pts = [[SURFER_PT[0] * ds - L.photo[0], SURFER_PT[1] * ds - L.photo[1]]];
    const oneLine = Math.abs(f[1] - w[1]) < f[3] * 0.5;
    // the wake stops at the top of the letters, so no ribbon reaches CATCH YOUR
    const rel = oneLine
      ? [[.37, 1.25], [.425, .9], [.485, .5], [.54, .15], [.575, .02]]     // through the T, into the gap before WAVE
      : [[.30, 1.08], [.42, .76], [.55, .44], [.66, .16], [.72, .03]];    // across WAVE, then FIRST
    rel.forEach(r => pts.push(at(r)));
    L.path = pts; L.seg = []; L.total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      L.seg.push(d); L.total += d;
    }
  }
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function pathAt(t) {
    const P = L.path;
    let d = clamp(t, 0, 1) * L.total, i = 0;
    while (i < L.seg.length - 1 && d > L.seg[i]) { d -= L.seg[i]; i++; }
    const u = L.seg[i] ? d / L.seg[i] : 0;
    const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
    return [cr(p0[0], p1[0], p2[0], p3[0], u), cr(p0[1], p1[1], p2[1], p3[1], u)];
  }

  /* ---------- intro for the HTML copy ---------- */
  let started = false;
  function startDOM(delay) {
    if (started) return; started = true;
    setTimeout(() => { hero.classList.add('is-go'); hero.classList.remove('is-pre'); }, delay);
  }

  /* ---------- load ---------- */
  function load(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  const fontsReady = Promise.race([
    Promise.all(['400 18px Inter', '600 18px Inter', '700 22px Inter'].map(f => document.fonts.load(f))),
    new Promise(r => setTimeout(r, 2000))
  ]).catch(() => {});

  fontsReady.then(() => { try { centerLabels(); } catch (e) { console.error(e); } });

  Promise.all([
    load(photoEl.currentSrc || photoEl.src), load('assets/surfer.png'),
    load(wordEls.catch.src), load(wordEls.first.src), load(wordEls.wave.src), fontsReady
  ]).then(([bg, surfer, cat, first, wave]) => {
    layout();
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) { startDOM(0); return; }
    try { runGL(gl, { bg, surfer, cat, first, wave }); }
    catch (e) { console.error(e); hero.classList.remove('is-gl'); startDOM(0); }
  }).catch(err => { console.error(err); layout(); startDOM(0); });

  let resizeQueued = false;
  new ResizeObserver(() => {
    if (resizeQueued) return; resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; layout(); centerLabels(); });
  }).observe(hero);

  /* ---------- WebGL ----------
     Water model ported from Lowtide: a wake leaves the surfer and runs through FIRST WAVE at a
     steady speed. Behind its head the water drags the letters back along the wake: the pull is
     strongest in the middle of the band and fades to nothing at its edges, so letters bend into the
     curve and stay legible. Neighbouring lanes are averaged and re-thresholded, so thin slivers merge
     into a few broad ribbons with clean edges. Plays once; the bent letters then stay as they are. */
  function runGL(gl, img) {
    const N = 96;
    const WAKE = { band: 90, drag: 190, ramp: 240, water: 0.55 };   // design px, scaled with the headline
    const SPEED = 520;                                               // design px per second

    const vs = `#version 300 es
      in vec2 p; out vec2 vUv;
      void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

    // all positions are CSS px of the hero, origin top-left
    const fs = `#version 300 es
      precision highp float;
      #define N ${N}
      in vec2 vUv; out vec4 o;
      uniform sampler2D uBg; uniform sampler2D uFg; uniform sampler2D uMask;
      uniform sampler2D uCatch; uniform sampler2D uFirst; uniform sampler2D uWave;
      uniform vec2 uRes; uniform vec4 uPhoto;
      uniform vec4 uCatchR; uniform vec4 uFirstR; uniform vec4 uWaveR;
      uniform float uBgP; uniform float uCatchP; uniform float uFirstP; uniform float uWaveP; uniform float uK;
      uniform vec2 uPts[N], uNrm[N];
      uniform float uStep, uHead, uRamp, uBand, uDrag, uWaterMix;

      vec4 layer(sampler2D t, vec4 r, vec2 px, float slide){
        vec2 l = (px - r.xy)/r.zw;
        if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        l.y -= slide;
        if (l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        return texture(t, l);
      }
      float text(vec2 px){
        return max(layer(uFirst, uFirstR, px, (1.0 - uFirstP)*1.08).a,
                   layer(uWave, uWaveR, px, (1.0 - uWaveP)*1.08).a);
      }
      vec2 photoUV(vec2 px, float sc){
        vec2 z = (px/uRes - 0.5)/sc + 0.5;
        return (z*uRes + uPhoto.xy)/uPhoto.zw;
      }
      // point and normal on the wake at arc length d (points are spaced evenly by uStep)
      void at(float d, out vec2 P, out vec2 Nn){
        float f = clamp(d / uStep, 0.0, float(N-1) - 0.001);
        int i = int(f); float t = f - float(i);
        P = mix(uPts[i], uPts[i+1], t);
        Nn = normalize(mix(uNrm[i], uNrm[i+1], t));
      }

      void main(){
        vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
        float sc = 1.0 + 0.10*(1.0 - uBgP);
        vec2 q0 = photoUV(p, sc);
        float keep = smoothstep(0.04, 0.45, texture(uMask, q0).a);   // no drag on the surfer herself

        // nearest point on the wake: arc length bs, signed distance sd
        float best = 1e12, bs = 0.0, sd = 0.0;
        for (int i = 0; i < N-1; i++){
          vec2 a = uPts[i], ab = uPts[i+1] - a, ap = p - a;
          float l2 = max(dot(ab, ab), 1e-6), h = clamp(dot(ap, ab) / l2, 0.0, 1.0);
          vec2 r = ap - ab * h;
          float dd = dot(r, r);
          if (dd < best){ best = dd; bs = (float(i) + h) * uStep; sd = (ab.x * r.y - ab.y * r.x) / sqrt(l2); }
        }

        vec3 water = texture(uBg, q0).rgb;
        float a = text(p);
        float x = sd / uBand;
        if (abs(x) < 1.0 && uHead > 0.0){
          float w = 1.0 - smoothstep(0.0, uRamp, uHead - bs);       // 1 at the head, 0 once it has passed
          float e = smoothstep(0.0, 1.0, abs(x));
          float bell = (1.0 - e) * (1.0 - e);
          float src = max(bs - uDrag * bell * (1.0 - w), 0.0);
          if (bs < uHead + 1.0 && src < bs - 0.5){
            vec2 P, Nn; at(src, P, Nn);
            float acc = 0.0, dl = uBand * 0.05 * bell;
            for (int k = -3; k <= 3; k++) acc += text(P + Nn * (sd + dl * float(k)));
            a = mix(text(P + Nn * sd), smoothstep(0.3, 0.7, acc / 7.0), 1.0 - e);
            at(mix(src, bs, uWaterMix), P, Nn);
            water = mix(texture(uBg, photoUV(P + Nn * sd, sc)).rgb, water, keep);
          }
        }

        vec3 col = mix(vec3(0.016, 0.19, 0.24), water, smoothstep(0.0, 1.0, uBgP));
        col = mix(col, vec3(1.0, 0.384, 0.0), a);

        // the surfer stays still and sharp
        vec4 f = texture(uFg, q0);
        col = mix(col, f.rgb, f.a * smoothstep(0.0, 1.0, uBgP));

        // CATCH YOUR: rises and fades in, never dragged
        vec4 c = layer(uCatch, uCatchR, p - vec2(0.0, (1.0 - uCatchP)*60.0*uK), 0.0);
        col = mix(col, c.rgb, c.a * uCatchP);
        o = vec4(col, 1.0);
      }`;

    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const U = {};
    for (let i = 0, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
      U[name] = gl.getUniformLocation(prog, name);
    }

    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function imgTex(i, mip) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, i);
      if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      return t;
    }
    // soft, slightly grown silhouette of the surfer
    const mc = document.createElement('canvas'); mc.width = 480; mc.height = 270;
    const mx = mc.getContext('2d'); mx.filter = 'blur(5px)';
    for (let i = 0; i < 3; i++) mx.drawImage(img.surfer, 0, 0, 480, 270);
    const tex = [
      ['uBg', imgTex(img.bg, true)], ['uFg', imgTex(img.surfer, true)], ['uMask', imgTex(mc)],
      ['uCatch', imgTex(img.cat, true)], ['uFirst', imgTex(img.first, true)], ['uWave', imgTex(img.wave, true)]
    ];
    tex.forEach(([name, t], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U[name], unit);
    });

    hero.classList.add('is-gl');

    /* ---- wake path: evenly spaced samples with normals smoothed over the neighbours ---- */
    let wakeLen = 1, layoutKey = '';
    function uploadWake() {
      const dense = [];
      const steps = 400;
      for (let i = 0; i <= steps; i++) dense.push(pathAt(i / steps));
      const cum = [0];
      for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
      wakeLen = cum[cum.length - 1] || 1;
      const along = d => {
        d = clamp(d, 0, wakeLen);
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
        const t = (d - cum[lo]) / Math.max(cum[hi] - cum[lo], 1e-6);
        return [dense[lo][0] + (dense[hi][0] - dense[lo][0]) * t, dense[lo][1] + (dense[hi][1] - dense[lo][1]) * t];
      };
      const pts = [], nrm = [];
      for (let i = 0; i < N; i++) pts.push(along(wakeLen * i / (N - 1)));
      for (let i = 0; i < N; i++) {
        const a = along(wakeLen * (i - 1) / (N - 1)), b = along(wakeLen * (i + 1) / (N - 1));
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        nrm.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]);
      }
      gl.uniform2fv(U.uPts, new Float32Array(pts.flat()));
      gl.uniform2fv(U.uNrm, new Float32Array(nrm.flat()));
      gl.uniform1f(U.uStep, wakeLen / (N - 1));
      gl.uniform1f(U.uBand, WAKE.band * L.k);
      gl.uniform1f(U.uDrag, WAKE.drag * L.k);
      gl.uniform1f(U.uRamp, WAKE.ramp * L.k);
      gl.uniform1f(U.uWaterMix, WAKE.water);
    }

    // lighter canvas while the wake moves, full sharpness for the still frame (as in Lowtide)
    function resize(moving) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const q = moving ? Math.min(1, Math.sqrt(2.2e6 / (L.W * L.H))) : dpr;
      const w = Math.max(1, Math.round(L.W * q)), h = Math.max(1, Math.round(L.H * q));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    /* ---- timeline ---- */
    const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const span = (t, a, b) => ease((t - a) / (b - a));
    // steady speed, then a short ease-out so the wake does not stop dead (as in Lowtide)
    const t1 = 0.86, sp = 2 / (1 + t1), p1 = sp * t1;
    const ride = t => t < t1 ? sp * t : p1 + sp * ((t - t1) - (t - t1) ** 2 / (2 * (1 - t1)));
    const RIDE_AT = 2.0;                                  // s, after the headline has risen
    const T0 = performance.now();
    startDOM(reduce ? 0 : 1250);

    let done = false;
    function frame(now) {
      const t = reduce ? 99 : (now - T0) / 1000;
      const key = [L.W, L.H, ...L.words.first, ...L.words.wave].map(v => Math.round(v)).join(',');
      if (key !== layoutKey) { layoutKey = key; uploadWake(); }
      const dur = sp * (wakeLen / L.k) / SPEED;
      resize(!reduce && t < RIDE_AT + dur);
      gl.viewport(0, 0, canvas.width, canvas.height);

      const head = reduce ? wakeLen : wakeLen * ride(clamp((t - RIDE_AT) / dur, 0, 1));
      gl.uniform1f(U.uHead, head);
      gl.uniform2f(U.uRes, L.W, L.H);
      gl.uniform4f(U.uPhoto, ...L.photo);
      gl.uniform1f(U.uK, L.k);
      gl.uniform4f(U.uCatchR, ...L.words.catch);
      gl.uniform4f(U.uFirstR, ...L.words.first);
      gl.uniform4f(U.uWaveR, ...L.words.wave);
      gl.uniform1f(U.uBgP, span(t, 0, 1.6));
      gl.uniform1f(U.uCatchP, span(t, 0.45, 1.35));
      gl.uniform1f(U.uFirstP, span(t, 0.65, 1.45));
      gl.uniform1f(U.uWaveP, span(t, 0.82, 1.62));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // after the ride only redraw when the layout changes
      done = t > RIDE_AT + dur + 0.2;
      if (!done) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    new ResizeObserver(() => { if (done) requestAnimationFrame(frame); }).observe(hero);
  }
})();
