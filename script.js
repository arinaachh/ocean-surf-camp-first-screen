/* Ocean Surf Camp: first screen
   - Layout is plain HTML/CSS. The script only reads where the headline words sit
     and draws photo + headline + surfer on a WebGL canvas behind the copy.
   - The water effect: the wave (or the cursor) drags FIRST and WAVE along its trail
     into long ribbons that slowly ease back. "CATCH YOUR" and the surfer stay sharp.
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

  /* ---------- WebGL ----------
     Water model (same idea as Lowtide): whatever moves through the headline, the default wave or
     the cursor, drags the letters along behind it. The pull is strongest in the middle of the trail
     and fades to nothing at its edges, so letters bend into long smooth ribbons instead of breaking up.
     The drag is kept in a small offset map that slowly relaxes, so the letters ease back like taffy.
     A lace of white water follows the trail. */
  function runGL(gl, img) {
    const floatOK = !!gl.getExtension('EXT_color_buffer_float');
    const ENC = floatOK ? 0 : 1;
    const SIM = 320;
    // design px (scaled with the headline size)
    const WAKE = {
      band: 72,        // half-width of the trail
      gain: 2.3,       // how far letters are dragged per px travelled (max drag ≈ band × gain × 1.77)
      max: 520,        // hard cap on the drag
      relax: 0.989,    // per frame at 60 fps: lower = letters return faster
      diffuse: 0.14,   // smooths the offset map so ribbons stay clean
      foam: 0.22,      // white water added per frame at full speed
      foamDecay: 0.955,
      water: 0.45      // the photo moves less than the letters
    };

    const head = '#version 300 es\nprecision highp float;\n#define ENC ' + ENC + '\n';
    const codec = `
      vec3 dec(vec4 t){
      #if ENC
        return vec3(t.xy*2.0-1.0, t.z);
      #else
        return t.xyz;
      #endif
      }
      vec4 enc(vec3 v){
      #if ENC
        return vec4(v.xy*0.5+0.5, v.z, 1.0);
      #else
        return vec4(v, 1.0);
      #endif
      }`;
    const vs = `#version 300 es
      in vec2 p; out vec2 vUv;
      void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

    // xy: drag offset (screen px, y down, normalised by uScale), z: white water
    const simFs = head + `in vec2 vUv; out vec4 o;
      uniform sampler2D uPrev; uniform vec2 uMouse; uniform vec2 uDelta; uniform float uFoamAdd;
      uniform float uBand; uniform float uAspect; uniform float uRelax; uniform float uDiffuse; uniform float uFoamDecay;
      ${codec}
      void main(){
        vec2 t = 1.0/vec2(${SIM}.0);
        vec3 c = dec(texture(uPrev, vUv));
        vec3 n = dec(texture(uPrev, vUv + vec2(t.x, 0.0))) + dec(texture(uPrev, vUv - vec2(t.x, 0.0)))
               + dec(texture(uPrev, vUv + vec2(0.0, t.y))) + dec(texture(uPrev, vUv - vec2(0.0, t.y)));
        c.xy = mix(c.xy, n.xy*0.25, uDiffuse) * uRelax;
        c.z *= uFoamDecay;
        vec2 d = vUv - uMouse; d.x *= uAspect;
        float g = exp(-dot(d,d)/(uBand*uBand));
        c.xy += uDelta * g;
        c.z = min(1.0, c.z + g*uFoamAdd);
        float L = length(c.xy); if (L > 1.0) c.xy /= L;
        o = enc(c);
      }`;

    // all rects are in CSS px of the hero, origin top-left
    const outFs = head + `in vec2 vUv; out vec4 o;
      uniform sampler2D uSim; uniform sampler2D uBg; uniform sampler2D uFg; uniform sampler2D uMask;
      uniform sampler2D uCatch; uniform sampler2D uFirst; uniform sampler2D uWave;
      uniform vec2 uRes; uniform vec4 uPhoto; uniform float uScale; uniform float uK; uniform float uWater;
      uniform vec4 uCatchR; uniform vec4 uFirstR; uniform vec4 uWaveR;
      uniform float uBgP; uniform float uCatchP; uniform float uFirstP; uniform float uWaveP;
      const vec3 ORANGE = vec3(1.0, 0.384, 0.0);
      ${codec}
      vec4 layer(sampler2D t, vec4 r, vec2 px, float slide){
        vec2 l = (px - r.xy)/r.zw;
        if (l.x < 0.0 || l.x > 1.0 || l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        l.y -= slide;
        if (l.y < 0.0 || l.y > 1.0) return vec4(0.0);
        return texture(t, l);
      }
      float words(vec2 px){
        return max(layer(uFirst, uFirstR, px, (1.0 - uFirstP)*1.08).a,
                   layer(uWave, uWaveR, px, (1.0 - uWaveP)*1.08).a);
      }
      vec2 photoUV(vec2 s, float sc){
        vec2 z = (s - 0.5)/sc + 0.5;
        return (z*uRes + uPhoto.xy)/uPhoto.zw;
      }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main(){
        float sc = 1.0 + 0.10*(1.0 - uBgP);
        vec2 s0 = vec2(vUv.x, 1.0 - vUv.y);
        vec2 px0 = s0*uRes;
        vec2 q0 = photoUV(s0, sc);
        float keep = smoothstep(0.04, 0.45, texture(uMask, q0).a);   // calm water on the surfer

        vec3 sim = dec(texture(uSim, vUv));
        vec2 D = sim.xy * uScale;                 // CSS px, y down: where the water pulled this pixel from

        // photo: dragged less than the letters, and not at all on the surfer
        vec2 qb = photoUV((px0 - D*uWater*(1.0 - keep))/uRes, sc);
        vec3 col = texture(uBg, qb).rgb;
        col = mix(vec3(0.016, 0.19, 0.24), col, smoothstep(0.0, 1.0, uBgP));

        // FIRST WAVE: dragged along the trail. Neighbouring lanes across the trail are averaged and
        // re-thresholded, so thin slivers merge into a few broad ribbons with clean edges.
        vec2 p = px0 - D;
        float dl = length(D);
        float m = smoothstep(2.0, 26.0*uK, dl);
        float a = words(p);
        if (m > 0.0){
          vec2 nrm = vec2(-D.y, D.x)/max(dl, 1e-4);
          float step = 2.6*uK*m, acc = 0.0;
          for (int k = -3; k <= 3; k++) acc += words(p + nrm*step*float(k));
          a = mix(a, smoothstep(0.3, 0.7, acc/7.0), m);
        }
        col = mix(col, ORANGE, a);

        // white water along the fresh trail: the bright caustic net of the photo, bleached
        float F = sim.z * (1.0 - keep) * smoothstep(0.0, 1.0, uBgP);
        if (F > 0.002){
          float lum = dot(texture(uBg, photoUV(s0, sc)).rgb, vec3(0.3, 0.55, 0.15));
          float lace = smoothstep(0.4, 0.5, lum + 0.16*vnoise(px0/(7.0*uK)) - 0.04);
          col = mix(col, vec3(0.95, 0.99, 0.98), lace * pow(F, 0.9) * 0.9 * (1.0 - a));
        }

        // the surfer stays still and sharp
        vec4 f = texture(uFg, q0);
        col = mix(col, f.rgb, f.a * smoothstep(0.0, 1.0, uBgP));

        // CATCH YOUR: rises and fades in, never dragged
        vec4 c = layer(uCatch, uCatchR, px0 - vec2(0.0, (1.0 - uCatchP)*60.0*uK), 0.0);
        col = mix(col, c.rgb, c.a * uCatchP);

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
    // soft, slightly grown silhouette of the surfer: the water stays calm inside it
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
    hero.addEventListener('pointerdown', e => { setFrom(e); last.x = cur.x; last.y = cur.y; });
    hero.addEventListener('pointermove', e => {
      if (auto) { auto = null; setFrom(e); last.x = cur.x; last.y = cur.y; }
      setFrom(e); lastInput = performance.now();
    });
    // steady speed like Lowtide, easing in and out only at the very ends
    function rideEase(t) {
      const a = 0.12, b = 0.82, v = 1 / (1 - a / 2 - (1 - b) / 2);
      if (t < a) return v * t * t / (2 * a);
      if (t < b) return v * (a / 2 + (t - a));
      const u = t - b, r = 1 - b;
      return v * (a / 2 + (b - a) + u - u * u / (2 * r));
    }
    function startAuto(now) {
      const dur = clamp(3200 * L.total / (1500 * L.k), 2400, 4600);
      auto = { t0: now, dur };
      const p = pathAt(0); cur.x = last.x = p[0]; cur.y = last.y = p[1];
    }

    /* ---- intro timeline (seconds) ---- */
    const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const span = (t, a, b) => ease((t - a) / (b - a));
    const T0 = performance.now();
    startDOM(reduce ? 0 : 1250);
    setTimeout(() => { armed = true; if (!reduce) startAuto(performance.now()); }, reduce ? 0 : 2300);

    let swap = 0, visible = true, prevNow = performance.now();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = clamp((now - prevNow) / 1000, 0, 0.1); prevNow = now;
      if (!visible || document.hidden) return;
      resize();
      const t = reduce ? 99 : (now - T0) / 1000;

      if (auto) {
        const k = (now - auto.t0) / auto.dur;
        if (k >= 1) { auto = null; lastAutoEnd = now; }
        else { const p = pathAt(rideEase(k)); cur.x = p[0]; cur.y = p[1]; }
      } else if (armed && !reduce && now - lastInput > 6000 && now - lastAutoEnd > 4500) {
        startAuto(now);
      }
      let dx = cur.x - last.x, dy = cur.y - last.y;
      last.x = cur.x; last.y = cur.y;
      const step = Math.hypot(dx, dy), cap = 90 * L.k;
      if (step > cap) { dx *= cap / step; dy *= cap / step; }      // ignore jumps (touch, tab switch)
      const scale = WAKE.max * L.k;
      const fr = dt * 60;

      const src = swap, dst = 1 - swap;
      gl.bindFramebuffer(gl.FRAMEBUFFER, simFbo[dst]); gl.viewport(0, 0, SIM, SIM);
      gl.useProgram(PS.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, simTex[src]); gl.uniform1i(PS.u.uPrev, 0);
      gl.uniform2f(PS.u.uMouse, cur.x / L.W, 1 - cur.y / L.H);
      gl.uniform2f(PS.u.uDelta, dx * WAKE.gain / scale, dy * WAKE.gain / scale);
      gl.uniform1f(PS.u.uFoamAdd, WAKE.foam * Math.min(1, step / (8 * L.k)));
      gl.uniform1f(PS.u.uBand, WAKE.band * L.k / L.H);
      gl.uniform1f(PS.u.uAspect, L.W / L.H);
      gl.uniform1f(PS.u.uRelax, Math.pow(WAKE.relax, fr));
      gl.uniform1f(PS.u.uDiffuse, WAKE.diffuse);
      gl.uniform1f(PS.u.uFoamDecay, Math.pow(WAKE.foamDecay, fr));
      gl.drawArrays(gl.TRIANGLES, 0, 3); swap = dst;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(PO.p);
      const bind = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(PO.u[name], unit); };
      bind(0, simTex[dst], 'uSim'); bind(1, T.bg, 'uBg'); bind(2, T.fg, 'uFg'); bind(3, T.mask, 'uMask');
      bind(4, T.cat, 'uCatch'); bind(5, T.first, 'uFirst'); bind(6, T.wave, 'uWave');
      gl.uniform2f(PO.u.uRes, L.W, L.H);
      gl.uniform4f(PO.u.uPhoto, ...L.photo);
      gl.uniform1f(PO.u.uScale, scale);
      gl.uniform1f(PO.u.uK, L.k);
      gl.uniform1f(PO.u.uWater, WAKE.water);
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
