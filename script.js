/* Ocean Surf Camp: first screen
   - Layout is plain HTML/CSS. The script only reads where the headline words sit
     and draws photo + headline + surfer on a WebGL canvas behind the copy.
   - The water effect: a small velocity field (ping-pong textures) bends the photo,
     FIRST and WAVE. "CATCH YOUR" and the surfer stay sharp.
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

  // default wave: from the surfer through FIRST and WAVE, then off screen
  function buildPath(ds) {
    const f = L.words.first, w = L.words.wave, k = L.k;
    const at = (rc, x, y) => [rc[0] + rc[2] * x, rc[1] + rc[3] * y];
    const pts = [[SURFER_PT[0] * ds - L.photo[0], SURFER_PT[1] * ds - L.photo[1]]];
    if (Math.abs(f[1] - w[1]) < f[3] * 0.5) {
      // one line: same curve as the Figma frame, relative to the FIRST WAVE box
      const line = [f[0], f[1], w[0] + w[2] - f[0], f[3]];
      [[.383, .95], [.443, .70], [.527, .57], [.617, .46], [.708, .38], [.798, .32], [.888, .28], [.978, .25]]
        .forEach(([x, y]) => pts.push(at(line, x, y)));
      pts.push([line[0] + line[2] + 70 * k, line[1] + line[3] * .17]);
      pts.push([L.W + 120 * k, line[1] + line[3] * .12]);
    } else {
      // two lines (phones): along WAVE left to right, then back along FIRST
      [[.08, .78], [.5, .58], [.95, .45]].forEach(([x, y]) => pts.push(at(w, x, y)));
      [[.92, .72], [.5, .52], [.06, .36]].forEach(([x, y]) => pts.push(at(f, x, y)));
      pts.push([-120 * k, f[1] + f[3] * .2]);
    }
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

  /* ---------- live tuning: open the page with ?tune ---------- */
  function tunePanel(SET) {
    const q = new URLSearchParams(location.search);
    for (const k in SET) if (q.has(k)) SET[k] = parseFloat(q.get(k)) || SET[k];
    if (!q.has('tune')) return;
    const R = {
      radius:   [10, 90, 1,      'Cursor size'],
      strength: [0.01, 0.2, 0.005, 'Stretch'],
      gain:     [2, 20, 0.5,     'Push'],
      advect:   [0, 0.08, 0.002, 'Flow'],
      decay:    [0.9, 0.995, 0.001, 'Life'],
      swirl:    [0, 0.04, 0.001, 'Swirl'],
      waveSpeed:[150, 1400, 10,  'Wave speed'],
      wavePush: [0.3, 3, 0.05,   'Wave push']
    };
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;padding:12px 14px;border-radius:12px;' +
      'background:rgba(4,48,61,.92);color:#fff;font:12px/1.3 Inter,system-ui,sans-serif;text-transform:none;width:240px';
    const out = document.createElement('code');
    out.style.cssText = 'display:block;margin-top:8px;word-break:break-all;opacity:.85;user-select:all';
    const show = () => { out.textContent = Object.keys(R).map(k => k + '=' + SET[k]).join('&'); };
    for (const k in R) {
      const [mn, mx, st, label] = R[k];
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:6px;margin:3px 0';
      const val = document.createElement('span'); val.textContent = SET[k];
      const inp = document.createElement('input');
      Object.assign(inp, { type: 'range', min: mn, max: mx, step: st, value: SET[k] });
      inp.addEventListener('input', () => { SET[k] = parseFloat(inp.value); val.textContent = inp.value; show(); });
      row.append(label, inp, val); box.append(row);
    }
    box.append(out); show();
    box.addEventListener('pointermove', e => e.stopPropagation());
    document.body.append(box);
  }

  /* ---------- WebGL ---------- */
  function runGL(gl, img) {
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    const ENC = floatOK ? 0 : 1;
    const SIM = 320;
    // Water settings. First version: strength .075, radius 54, decay .976, swirl .016, advect .012, gain 7.
    // Smaller cursor, no swirl (the swirl made letters wobble like jelly), stronger flow so letters
    // are carried and stretched along the cursor's path, and a slightly shorter life.
    const SET = { strength: 0.13, radius: 37, decay: 0.973, swirl: 0, advect: 0.02, gain: 7.0,   // tuned by Arina
                  waveSpeed: 350, wavePush: 1 };   // default wave: design px per second, extra push
    tunePanel(SET);

    const head = '#version 300 es\nprecision highp float;\n#define ENC ' + ENC + '\n';
    const codec = `
      vec2 dec(vec4 t){
      #if ENC
        return t.xy*2.0-1.0;
      #else
        return t.xy;
      #endif
      }
      vec4 enc(vec2 v){
      #if ENC
        return vec4(v*0.5+0.5,0.0,1.0);
      #else
        return vec4(v,0.0,1.0);
      #endif
      }`;
    const vs = `#version 300 es
      in vec2 p; out vec2 vUv;
      void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

    const simFs = head + `in vec2 vUv; out vec4 o;
      uniform sampler2D uPrev; uniform vec2 uMouse; uniform vec2 uMouse0; uniform vec2 uVel;
      uniform float uRadius; uniform float uDecay; uniform float uAspect; uniform float uSwirl; uniform float uAdvect;
      ${codec}
      void main(){
        vec2 v0 = dec(texture(uPrev, vUv));
        vec2 v = dec(texture(uPrev, vUv - v0*uAdvect));
        float s = sin(uSwirl), c = cos(uSwirl);
        v = mat2(c, s, -s, c) * v;
        v *= uDecay;
        // push along the whole segment the cursor moved this frame, so the trail stays smooth
        vec2 a = uMouse0, ab = uMouse - uMouse0; a.x *= uAspect; ab.x *= uAspect;
        vec2 pp = vUv; pp.x *= uAspect;
        float h = clamp(dot(pp - a, ab)/max(dot(ab, ab), 1e-9), 0.0, 1.0);
        vec2 d = pp - a - ab*h;
        v += uVel * exp(-dot(d,d)/(uRadius*uRadius));
        float L = length(v); if (L > 1.0) v /= L;
        o = enc(v);
      }`;

    // all rects are in CSS px of the hero, origin top-left
    const outFs = head + `in vec2 vUv; out vec4 o;
      uniform sampler2D uSim; uniform sampler2D uBg; uniform sampler2D uFg; uniform sampler2D uMask;
      uniform sampler2D uCatch; uniform sampler2D uFirst; uniform sampler2D uWave;
      uniform vec2 uRes; uniform vec4 uPhoto; uniform vec2 uStr; uniform float uK;
      uniform vec4 uCatchR; uniform vec4 uFirstR; uniform vec4 uWaveR;
      uniform float uBgP; uniform float uCatchP; uniform float uFirstP; uniform float uWaveP;
      ${codec}
      vec4 layer(sampler2D t, vec4 r, vec2 px, float slide){
        vec2 l = (px - r.xy)/r.zw;
        if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        l.y -= slide;
        if (l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        return texture(t, l);
      }
      vec2 photoUV(vec2 s, float sc){
        vec2 z = (s - 0.5)/sc + 0.5;
        return (z*uRes + uPhoto.xy)/uPhoto.zw;
      }
      void main(){
        float sc = 1.0 + 0.10*(1.0 - uBgP);
        vec2 s0 = vec2(vUv.x, 1.0 - vUv.y);
        vec2 q0 = photoUV(s0, sc);
        // keep the water calm on and right around the surfer
        float keep = smoothstep(0.04, 0.45, texture(uMask, q0).a);
        vec2 v = dec(texture(uSim, vUv)) * (1.0 - keep);
        vec2 uv = vUv - v*uStr;
        vec2 s = vec2(uv.x, 1.0 - uv.y);
        vec2 px = s*uRes;
        vec2 q = photoUV(s, sc);

        vec3 col = texture(uBg, q).rgb;
        col = mix(vec3(0.016, 0.19, 0.24), col, smoothstep(0.0, 1.0, uBgP));

        // FIRST and WAVE: each word slides up out of its own mask, and bends with the water
        vec4 h = layer(uFirst, uFirstR, px, (1.0 - uFirstP)*1.08);
        col = mix(col, h.rgb, h.a);
        h = layer(uWave, uWaveR, px, (1.0 - uWaveP)*1.08);
        col = mix(col, h.rgb, h.a);

        // the surfer stays still and sharp
        vec4 f = texture(uFg, q0);
        col = mix(col, f.rgb, f.a * smoothstep(0.0, 1.0, uBgP));

        // CATCH YOUR: rises and fades in, never distorted
        vec4 c = layer(uCatch, uCatchR, s0*uRes - vec2(0.0, (1.0 - uCatchP)*60.0*uK), 0.0);
        col = mix(col, c.rgb, c.a * uCatchP);

        // faint sheen where the water is pulled hardest
        col += vec3(0.85, 1.0, 1.0) * smoothstep(0.35, 1.0, length(v)) * 0.08;
        o = vec4(col, 1.0);
      }`;

    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(f) {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    const PS = prog(simFs), PO = prog(outFs);

    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function params() {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    function imgTex(i, mip) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); params();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, i);
      if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      return t;
    }
    // soft, slightly grown silhouette of the surfer: the water effect fades out inside it
    const mc = document.createElement('canvas'); mc.width = 480; mc.height = 270;
    const mx = mc.getContext('2d'); mx.filter = 'blur(5px)';
    for (let i = 0; i < 3; i++) mx.drawImage(img.surfer, 0, 0, 480, 270);
    const T = {
      bg: imgTex(img.bg, true), fg: imgTex(img.surfer, true), mask: imgTex(mc),
      cat: imgTex(img.cat, true), first: imgTex(img.first, true), wave: imgTex(img.wave, true)
    };

    const simTex = [], simFbo = [];
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      if (ENC) {
        const d = new Uint8Array(SIM * SIM * 4);
        for (let j = 0; j < d.length; j += 4) { d[j] = 128; d[j + 1] = 128; d[j + 3] = 255; }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIM, SIM, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
      } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SIM, SIM, 0, gl.RGBA, gl.HALF_FLOAT, null);
      params();
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (!ENC) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
      simTex.push(t); simFbo.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    hero.classList.add('is-gl');

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(L.W * dpr)), h = Math.max(1, Math.round(L.H * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    /* ---- input (CSS px inside the hero) ---- */
    const cur = { x: 0, y: 0 }, last = { x: 0, y: 0 };
    let lastInput = -1e9, auto = null, lastAutoEnd = 0, armed = false;
    function setFrom(e) { const r = hero.getBoundingClientRect(); cur.x = e.clientX - r.left; cur.y = e.clientY - r.top; }
    hero.addEventListener('pointerenter', e => { setFrom(e); last.x = cur.x; last.y = cur.y; });
    hero.addEventListener('pointermove', e => {
      if (auto) { auto = null; setFrom(e); last.x = cur.x; last.y = cur.y; }
      setFrom(e); lastInput = performance.now();
    });
    // The default wave moves at a steady speed with a short ease in and out. It can be slow and still
    // push the water as hard as a cursor swipe (~1100 px/s): the push is raised to match the swipe's peak.
    const SWIPE = 1100;
    const waveBoost = () => SET.wavePush * Math.pow(SWIPE / SET.waveSpeed, 0.18);
    function swipe(t) {
      const a = 0.15, b = 0.85, v = 1 / (1 - a / 2 - (1 - b) / 2);
      if (t < a) return v * t * t / (2 * a);
      if (t < b) return v * (a / 2 + (t - a));
      const u = t - b, r = 1 - b;
      return v * (a / 2 + (b - a) + u - u * u / (2 * r));
    }
    function startAuto(now) {
      const dur = clamp(1000 * L.total / (SET.waveSpeed * L.k), 900, 12000);
      auto = { t0: now, dur };
      const p = pathAt(0); cur.x = last.x = p[0]; cur.y = last.y = p[1];
    }

    /* ---- intro timeline (seconds) ---- */
    const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const span = (t, a, b) => ease((t - a) / (b - a));
    const T0 = performance.now();
    startDOM(reduce ? 0 : 1250);
    setTimeout(() => { armed = true; if (!reduce) startAuto(performance.now()); }, reduce ? 0 : 2300);

    let swap = 0, visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      resize();
      const t = reduce ? 99 : (now - T0) / 1000;

      if (auto) {
        let k = (now - auto.t0) / auto.dur;
        if (k >= 1) { auto = null; lastAutoEnd = now; }
        else { const p = pathAt(swipe(k)); cur.x = p[0]; cur.y = p[1]; }
      } else if (armed && !reduce && now - lastInput > 5000 && now - lastAutoEnd > 3500) {
        startAuto(now);
      }
      // velocity in the same units the Figma frame used, scaled with the headline size
      const m0x = last.x / L.W, m0y = 1 - last.y / L.H;
      // same push per px travelled at any frame rate: a long step does not hit harder
      const stepPx = Math.hypot(cur.x - last.x, cur.y - last.y);
      const capK = Math.min(1, 1.8 * SET.radius * L.k / Math.max(stepPx, 1e-6)) * (auto ? waveBoost() : 1);
      const vx = (cur.x - last.x) * capK * SET.gain / (1920 * L.k);
      const vy = -(cur.y - last.y) * capK * SET.gain / (1080 * L.k);
      last.x = cur.x; last.y = cur.y;

      const src = swap, dst = 1 - swap;
      gl.bindFramebuffer(gl.FRAMEBUFFER, simFbo[dst]); gl.viewport(0, 0, SIM, SIM);
      gl.useProgram(PS.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, simTex[src]); gl.uniform1i(PS.u.uPrev, 0);
      gl.uniform2f(PS.u.uMouse, cur.x / L.W, 1 - cur.y / L.H); gl.uniform2f(PS.u.uMouse0, m0x, m0y);
      gl.uniform2f(PS.u.uVel, vx, vy);
      gl.uniform1f(PS.u.uRadius, SET.radius * L.k / L.H); gl.uniform1f(PS.u.uDecay, SET.decay);
      gl.uniform1f(PS.u.uAspect, L.W / L.H); gl.uniform1f(PS.u.uSwirl, SET.swirl); gl.uniform1f(PS.u.uAdvect, SET.advect);
      gl.drawArrays(gl.TRIANGLES, 0, 3); swap = dst;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(PO.p);
      const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(PO.u[name], unit); };
      bind(0, simTex[dst], 'uSim'); bind(1, T.bg, 'uBg'); bind(2, T.fg, 'uFg'); bind(3, T.mask, 'uMask');
      bind(4, T.cat, 'uCatch'); bind(5, T.first, 'uFirst'); bind(6, T.wave, 'uWave');
      gl.uniform2f(PO.u.uRes, L.W, L.H);
      gl.uniform4f(PO.u.uPhoto, ...L.photo);
      gl.uniform2f(PO.u.uStr, SET.strength * 1920 * L.k / L.W, SET.strength * 1080 * L.k / L.H);
      gl.uniform1f(PO.u.uK, L.k);
      gl.uniform4f(PO.u.uCatchR, ...L.words.catch);
      gl.uniform4f(PO.u.uFirstR, ...L.words.first);
      gl.uniform4f(PO.u.uWaveR, ...L.words.wave);
      gl.uniform1f(PO.u.uBgP, span(t, 0, 1.6));
      gl.uniform1f(PO.u.uCatchP, span(t, 0.45, 1.35));
      gl.uniform1f(PO.u.uFirstP, span(t, 0.65, 1.45));
      gl.uniform1f(PO.u.uWaveP, span(t, 0.82, 1.62));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
})();
