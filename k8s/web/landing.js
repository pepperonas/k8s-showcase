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
    for (const k of ['disk', 'brass', 'brass-dim', 'ref', 'pod1', 'pod2', 'pod3', 'pod5', 'ink']) col[k] = cs.getPropertyValue('--' + k).trim();
  }
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2.5);
    W = c.clientWidth;
    c.width = Math.round(W * dpr); c.height = Math.round(W * dpr);
    cx = cy = W / 2; S = W / 2 - 22;
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
    ctx.beginPath(); ctx.arc(cx, cy, S, 0, 7); ctx.fillStyle = col.disk; ctx.fill();
    ctx.strokeStyle = col.brass; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, S + 14, 0, 7); ctx.strokeStyle = col['brass-dim']; ctx.lineWidth = 1; ctx.stroke();
    const rot = H.angleOf(V);
    ctx.beginPath();
    for (let i = 0; i < 48; i++) { const a = rot + i * Math.PI / 24, l = i % 4 ? 4 : 9;
      ctx.moveTo(cx + Math.cos(a) * (S + 4), cy + Math.sin(a) * (S + 4)); ctx.lineTo(cx + Math.cos(a) * (S + 4 + l), cy + Math.sin(a) * (S + 4 + l)); }
    ctx.strokeStyle = col.brass; ctx.stroke();
    for (const n of all) { n.w = H.apply(V, n.pos); n.f = 1 - H.abs2(n.w); }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, S, 0, 7); ctx.clip();
    ctx.strokeStyle = col['brass-dim']; ctx.lineCap = 'round';
    for (const n of all) if (n.parent) { ctx.beginPath(); geo(n.parent.w, n.w); ctx.lineWidth = Math.max(0.5, 2 * (n.f + n.parent.f) / 2); ctx.stroke(); }
    ctx.setLineDash([5, 4]); ctx.lineDashOffset = reduced.matches ? 0 : -t / 40; ctx.strokeStyle = col.ref; ctx.lineWidth = 1.4;
    for (const [a, b] of refs) { ctx.beginPath(); geo(a.w, b.w); ctx.globalAlpha = 0.75; ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    const base = { group: 0.07, list: 0.062, leaf: 0.04, leaf2: 0.04 };
    const fill = { group: col.pod1, list: col.pod2, leaf: col.pod3, leaf2: col.pod5 };
    for (const n of [...all].sort((a, b) => a.f - b.f)) {
      const r = base[n.type] * S * n.f; if (r < 0.4) continue;
      const p = scr(n.w); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fillStyle = fill[n.type]; ctx.fill();
    }
    ctx.restore();
  }

  // Sanftes Kreisen, bis jemand selbst anfasst
  let auto = !reduced.matches, last = performance.now(), phase = 0;
  function frame(t) {
    const dt = Math.min(50, t - last); last = t;
    if (auto) {
      phase += dt / 4200;
      const v = [Math.cos(phase) * 0.0016 * dt / 16, Math.sin(phase * 0.7) * 0.0016 * dt / 16];
      V = H.compose(H.rotate(dt / 9000), H.compose(H.translate(v), V));
    }
    draw(t);
    if (auto || !reduced.matches) requestAnimationFrame(frame);
  }

  let drag = null;
  const pos = (e) => { const r = c.getBoundingClientRect(); const z = [(e.clientX - r.left - cx) / S, (e.clientY - r.top - cy) / S]; const m = Math.hypot(z[0], z[1]); return m > 0.95 ? [z[0] * 0.95 / m, z[1] * 0.95 / m] : z; };
  c.addEventListener('pointerdown', (e) => { auto = false; drag = pos(e); try { c.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } });
  c.addEventListener('pointermove', (e) => { if (!drag) return; const p = pos(e); V = H.compose(H.dragMap(drag, p), V); drag = p; if (reduced.matches) draw(0); });
  const up = () => { drag = null; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('dblclick', () => { location.href = 'tree.html'; });

  addEventListener('resize', () => { size(); draw(performance.now()); });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { readColors(); draw(performance.now()); });
  readColors(); size(); draw(0);
  requestAnimationFrame(frame);
})();
