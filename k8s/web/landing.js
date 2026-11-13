// Startseite: kleine, anfassbare hyperbolische Scheibe im Kopfbereich.
(function () {
  'use strict';
  const H = window.Hyper;
  const c = document.getElementById('disk');
  if (!c || !H) return;
  const ctx = c.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Ein fester, kleiner Baum mit drei Ebenen
  const mk = (kids, type) => ({ children: kids || [], type: type || 'leaf' });
  const branch = (n, m) => mk(Array.from({ length: n }, (_, i) => mk(Array.from({ length: m + (i % 2) }, () => mk([], i % 3 ? 'leaf' : 'leaf2')), i % 2 ? 'list' : 'group')), 'group');
  const root = mk([branch(3, 2), branch(2, 3), branch(4, 1), branch(2, 2), branch(3, 1)], 'group');
  H.layout(root);
  const all = []; (function walk(n) { all.push(n); n.children.forEach((k) => { k.parent = n; walk(k); }); })(root);
  const refs = [[all[4], all[20]], [all[12], all[2]], [all[26], all[9]]];

  let V = H.identity(), W = 0, S = 0, cx = 0, cy = 0, dpr = 1, col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['plane', 'disk', 'brass', 'brass-dim', 'ref', 'pod1', 'pod2', 'pod3', 'pod5', 'ink']) col[k] = cs.getPropertyValue('--' + k).trim();
  }
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2.5);
    W = c.clientWidth;
    c.width = Math.round(W * dpr); c.height = Math.round(W * dpr);
    cx = cy = W / 2; S = W / 2 - 24;
  }
  const scr = (z) => [cx + S * z[0], cy + S * z[1]];
  function geo(a, b) {
    const A = scr(a), B = scr(b), g = H.geodesic(a, b);
    if (g.line || g.r * S > 1e5) { ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); return; }
    const C = scr(g.c), r = g.r * S;
    const a1 = Math.atan2(A[1] - C[1], A[0] - C[0]), a2 = Math.atan2(B[1] - C[1], B[0] - C[0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    ctx.moveTo(A[0], A[1]); ctx.arc(C[0], C[1], r, a1, a2, d < 0);
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    const rot = H.angleOf(V), dark = Orb.isDark(col.plane);
    // Schlagschatten innerhalb der Leinwand (der volle Hintergrund gehoert der Seite)
    const sh = ctx.createRadialGradient(cx + S * 0.05, cy + S * 0.1, S * 0.8, cx + S * 0.05, cy + S * 0.1, S * 1.08);
    sh.addColorStop(0, `rgba(0,0,0,${dark ? 0.5 : 0.16})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx + S * 0.05, cy + S * 0.1, S * 1.08, 0, 7); ctx.fill();
    Orb.drawDisk(ctx, cx, cy, S, col);
    for (const n of all) { n.w = H.apply(V, n.pos); n.f = 1 - H.abs2(n.w); }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, S, 0, 7); ctx.clip();
    Orb.drawGrid(ctx, H, V, scr, geo, S, col, dark ? 0.18 : 0.26);
    ctx.strokeStyle = col['brass-dim']; ctx.lineCap = 'round';
    for (const n of all) if (n.parent) { ctx.beginPath(); geo(n.parent.w, n.w); ctx.globalAlpha = 0.4 + 0.5 * Math.min(1, n.f + n.parent.f); ctx.lineWidth = Math.max(0.5, 2 * (n.f + n.parent.f) / 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Verweise: zarte Bahn, darauf wandernde Lichter
    ctx.strokeStyle = col.ref; ctx.lineWidth = 1.1;
    for (const [a, b] of refs) {
      ctx.beginPath(); geo(a.w, b.w); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
      if (!reduced.matches) Orb.drawComet(ctx, H, scr, a.w, b.w, ((t / 2200) + refs.indexOf(refs.find((r) => r[0] === a)) * 0.33) % 1, col.ref, 3.2);
    }
    const base = { group: 0.07, list: 0.062, leaf: 0.04, leaf2: 0.04 };
    const fill = { group: col.pod1, list: col.pod2, leaf: col.pod3, leaf2: col.pod5 };
    for (const n of [...all].sort((a, b) => a.f - b.f)) {
      const r = base[n.type] * S * n.f; if (r < 0.4) continue;
      const p = scr(n.w);
      Orb.drawNode(ctx, p[0], p[1], r, fill[n.type], 'orb', { alpha: 0.5 + 0.5 * Math.min(1, n.f * 1.6), glow: n === root ? 0.6 : 0, dark });
    }
    Orb.drawGlass(ctx, cx, cy, S, col);
    ctx.restore();
    Orb.drawRing(ctx, cx, cy, S, rot, col, 15);
  }

  // Sanftes Kreisen, bis jemand anfasst; nach einer Pause faehrt der Baum zurueck in die Mitte.
  let auto = !reduced.matches, last = performance.now(), phase = 0, idleSince = 0, anim = null, touched = false;
  const caption = document.getElementById('disk-caption');
  function firstTouch() {
    if (touched) return;
    touched = true;
    if (caption) caption.innerHTML = 'Genau so. Im <a href="tree.html">Astrolabium</a> geht noch viel mehr.';
  }
  function centerOn(n) {
    const w = H.apply(V, n.pos);
    anim = { V0: V, w, t0: performance.now(), dur: reduced.matches ? 0 : 700 + 250 * H.distance([0, 0], w) };
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function frame(t) {
    const dt = Math.min(50, t - last); last = t;
    if (anim) {
      const k = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1;
      V = H.compose(H.translate(H.neg(H.geodesicPoint(anim.w, ease(k)))), anim.V0);
      if (k >= 1) { anim = null; idleSince = t; }
    } else if (!drag && touched && idleSince && t - idleSince > 3500 && H.abs2(H.apply(V, root.pos)) > 1e-4) {
      centerOn(root); idleSince = 0;
      if (!reduced.matches) auto = true;
    } else if (auto) {
      phase += dt / 4200;
      const v = [Math.cos(phase) * 0.0016 * dt / 16, Math.sin(phase * 0.7) * 0.0016 * dt / 16];
      V = H.compose(H.rotate(dt / 9000), H.compose(H.translate(v), V));
    }
    draw(t);
    requestAnimationFrame(frame);
  }

  let drag = null, downAt = null;
  const local = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toDisk = (p) => { const z = [(p[0] - cx) / S, (p[1] - cy) / S]; const m = Math.hypot(z[0], z[1]); return m > 0.95 ? [z[0] * 0.95 / m, z[1] * 0.95 / m] : z; };
  function hit(p) {
    let best = null, bd = Infinity;
    for (const n of all) {
      const q = scr(n.w), r = ({ group: 0.07, list: 0.062 }[n.type] || 0.04) * S * n.f;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]) - r;
      if (d < 14 && d < bd) { best = n; bd = d; }
    }
    return best;
  }
  c.addEventListener('pointerdown', (e) => {
    auto = false; anim = null; idleSince = 0;
    downAt = local(e); drag = toDisk(downAt);
    try { c.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
    firstTouch();
  });
  c.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!drag) { c.style.cursor = hit(p) ? 'pointer' : 'grab'; return; }
    // gedaempft: die Scheibe folgt dem Finger zu 60 %, damit ein kurzer Zug den Baum nicht an den Rand schleudert
    const to = toDisk(p);
    const soft = [drag[0] + (to[0] - drag[0]) * 0.6, drag[1] + (to[1] - drag[1]) * 0.6];
    V = H.compose(H.dragMap(drag, soft), V);
    drag = to;
  });
  const up = (e) => {
    if (!drag) return;
    const p = local(e);
    if (downAt && Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) < 6) { const n = hit(p); if (n) centerOn(n); }
    drag = null; downAt = null; idleSince = performance.now();
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);

  addEventListener('resize', () => { size(); draw(performance.now()); });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { readColors(); draw(performance.now()); });
  readColors(); size(); draw(0);
  requestAnimationFrame(frame);
})();
