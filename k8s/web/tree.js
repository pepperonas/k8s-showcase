// JSON-Astrolabium: JSON-Baeume mit $ref-Verweisen auf der Poincare-Scheibe.
(function () {
  'use strict';
  const H = window.Hyper;
  const MAX_NODES = 1500;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s) => document.querySelector(s);
  const canvas = $('#stage');
  const panel = $('#panel');
  const ctx = canvas.getContext('2d');

  // ---------- Beispieldaten ----------
  const SETS = {
    bestellung: { label: 'Bestellungen', data: {
      customers: {
        ada: { name: 'Ada Lovelace', email: 'ada@example.org', address: { $ref: '#/addresses/kreuzberg' } },
        alan: { name: 'Alan Turing', address: { $ref: '#/addresses/bletchley' }, referredBy: { $ref: '#/customers/ada' } },
      },
      addresses: {
        kreuzberg: { street: 'Wrangelstraße 12', city: 'Berlin', zip: '10997' },
        bletchley: { street: 'Sherwood Drive', city: 'Milton Keynes' },
      },
      products: {
        keyboard: { title: 'Tastatur', price: 89.9, tags: ['mechanisch', 'ISO'] },
        mouse: { title: 'Maus', price: 39 },
        screen: { title: 'Monitor', price: 249, accessory: { $ref: '#/products/mouse' } },
      },
      orders: [
        { id: 1001, paid: true, customer: { $ref: '#/customers/ada' }, shipTo: { $ref: '#/addresses/kreuzberg' },
          items: [{ product: { $ref: '#/products/keyboard' }, qty: 1 }, { product: { $ref: '#/products/screen' }, qty: 2 }] },
        { id: 1002, paid: false, customer: { $ref: '#/customers/alan' }, shipTo: { $ref: '#/addresses/bletchley' },
          items: [{ product: { $ref: '#/products/mouse' }, qty: 3 }] },
        { id: 1003, paid: null, customer: { $ref: '#/customers/ada' }, shipTo: { $ref: '#/addresses/paris' },
          items: [{ product: { $ref: '#/products/mouse' }, qty: 1 }] },
      ],
    } },
    schema: { label: 'API-Schema', data: {
      openapi: '3.1.0',
      info: { title: 'Bibliothek', version: '1.2' },
      paths: {
        '/books': { get: { responses: { 200: { content: { schema: { $ref: '#/components/schemas/BookList' } } } } },
                    post: { body: { $ref: '#/components/schemas/Book' }, responses: { 201: { $ref: '#/components/responses/Created' } } } },
        '/authors/{id}': { get: { responses: { 200: { content: { schema: { $ref: '#/components/schemas/Author' } } },
                                              404: { $ref: '#/components/responses/NotFound' } } } },
      },
      components: {
        schemas: {
          Book: { type: 'object', required: ['title'], properties: {
            title: { type: 'string' }, isbn: { type: 'string' },
            author: { $ref: '#/components/schemas/Author' }, sequel: { $ref: '#/components/schemas/Book' } } },
          BookList: { type: 'array', items: { $ref: '#/components/schemas/Book' } },
          Author: { type: 'object', properties: { name: { type: 'string' }, books: { $ref: '#/components/schemas/BookList' } } },
          Error: { type: 'object', properties: { code: { type: 'integer' }, message: { type: 'string' } } },
        },
        responses: {
          Created: { description: 'Angelegt' },
          NotFound: { description: 'Nicht gefunden', schema: { $ref: '#/components/schemas/Error' } },
        },
      },
    } },
    familie: { label: 'Stammbaum', data: {
      name: 'Greta', born: 1931,
      children: [
        { name: 'Hans', born: 1955, spouse: { $ref: '#/inlaws/0' },
          children: [{ name: 'Lea', born: 1984 }, { name: 'Jonas', born: 1987, godparent: { $ref: '#/children/1' } }] },
        { name: 'Ilse', born: 1958,
          children: [{ name: 'Mira', born: 1990, mentor: { $ref: '#/children/0/children/0' } }] },
        { name: 'Otto', born: 1962, children: [] },
      ],
      inlaws: [{ name: 'Petra', born: 1957, sibling: { $ref: '#/inlaws/1' } }, { name: 'Karl', born: 1953 }],
    } },
  };

  // ---------- Modell ----------
  const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
  const readable = (ptr) => (ptr.replace(/^#/, '') || '/').split('/').map((x) => x.replace(/~1/g, '⁄').replace(/~0/g, '~')).join(' / ').replace(/^ \/ /, '') || 'Wurzel';
  function typeOf(v) {
    if (v === null || typeof v === 'boolean') return 'literal';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return typeof v.$ref === 'string' ? 'ref' : 'object';
    return typeof v === 'number' ? 'number' : 'string';
  }
  function buildModel(json) {
    const nodes = [], byPath = new Map();
    const make = (value, key, path, parent) => {
      if (nodes.length >= MAX_NODES) throw new Error(`Mehr als ${MAX_NODES} Knoten. Bitte ein kleineres JSON wählen.`);
      const n = { id: nodes.length, key, path, parent, raw: value, type: typeOf(value), children: [], refsIn: [], collapsed: false };
      n.depth = parent ? parent.depth + 1 : 0;
      nodes.push(n); byPath.set(path, n);
      if (n.type === 'ref') n.ref = value.$ref;
      if (n.type === 'array') value.forEach((v, i) => n.children.push(make(v, i, `${path}/${i}`, n)));
      else if (n.type === 'object' || n.type === 'ref') {
        for (const k of Object.keys(value)) if (k !== '$ref') n.children.push(make(value[k], k, `${path}/${esc(k)}`, n));
      }
      return n;
    };
    const root = make(json, null, '#', null);
    let refs = 0, broken = 0;
    for (const n of nodes) if (n.type === 'ref') {
      refs++;
      let p = n.ref;
      try { p = decodeURIComponent(p); } catch (e) { /* roh lassen */ }
      if (p === '' || p === '#/') p = '#';
      n.target = byPath.get(p) || null;
      if (n.target) n.target.refsIn.push(n); else broken++;
    }
    return { root, nodes, refs, broken };
  }

  // ---------- Zustand ----------
  let model = null, visible = [];
  let V = H.identity(), zoom = 1, ox = 0, oy = 0;
  let selected = null, hover = null;
  let showValues = true, showRefs = true;
  let W = 0, Hh = 0, dpr = 1, cx = 0, cy = 0, R = 1;
  let anim = null, inertia = null;
  let colors = {};
  let currentSet = 'bestellung';

  const S = () => zoom * R;
  const toScreen = (z) => [cx + ox + S() * z[0], cy + oy + S() * z[1]];
  const toDisk = (p) => [(p[0] - cx - ox) / S(), (p[1] - cy - oy) / S()];
  function clampDisk(z, m = 0.96) {
    const r = Math.hypot(z[0], z[1]);
    return r > m ? [z[0] * m / r, z[1] * m / r] : z;
  }

  const visKids = (n) => n.collapsed ? [] : n.children.filter((c) => showValues || c.type === 'object' || c.type === 'array' || c.type === 'ref');
  function relayout() {
    H.layout(model.root, { children: visKids });
    visible = [];
    const walk = (n) => { visible.push(n); visKids(n).forEach(walk); };
    walk(model.root);
    const vis = new Set(visible);
    for (const n of model.nodes) n.visible = vis.has(n);
    if (selected && !selected.visible) { let p = selected; while (p && !p.visible) p = p.parent; selected = p; renderPanel(); }
    if (hover && !hover.visible) hover = null;
    renderStats();
    requestDraw();
  }
  const visibleAncestor = (n) => { while (n && !n.visible) n = n.parent; return n; };

  function loadData(json, setName) {
    model = buildModel(json);
    currentSet = setName;
    selected = null; hover = null; anim = null; inertia = null;
    V = H.identity(); zoom = 1; ox = 0; oy = 0; shift = null;
    resize();
    relayout();
    renderPanel();
    renderSets();
  }

  // ---------- Darstellung ----------
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['plane', 'disk', 'brass', 'brass-dim', 'ink', 'ink-mut', 'ref', 'broken',
      't-object', 't-array', 't-string', 't-number', 't-literal', 't-ref']) colors[k] = cs.getPropertyValue('--' + k).trim();
    requestDraw();
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; Hh = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = Hh + 'px';
    const narrow = W < 760;
    // Freien Raum aus dem echten Layout messen: unter dem Kopf, ueber Knopfreihe bzw. Panel
    const top = document.querySelector('header').getBoundingClientRect().bottom + 8;
    let bottom = Hh - 12, right = W;
    const pv = !panel.hidden && selected;
    if (narrow) {
      bottom = (pv ? panel.getBoundingClientRect().top : Hh) - 58;
    } else if (pv) right = W - 352;
    const avail = Math.max(120, Math.min(right, bottom - top));
    R = Math.max(60, avail / 2 - 30);
    cx = right / 2;
    cy = narrow ? (top + bottom) / 2 : Math.max(top + R + 30, (top + bottom) / 2);
    requestDraw();
  }

  const nodeBase = { object: 0.055, array: 0.05, ref: 0.042, string: 0.032, number: 0.032, literal: 0.03 };
  function preview(v) {
    if (typeof v === 'string') return `„${v.length > 22 ? v.slice(0, 21) + '…' : v}“`;
    return String(v);
  }
  function labelOf(n) {
    const k = n.key === null ? 'Wurzel' : String(n.key);
    switch (n.type) {
      case 'object': return `${k} {${n.children.length}}`;
      case 'array': return `${k} [${n.children.length}]`;
      case 'ref': return `${k} → ${n.target ? (n.target.key === null ? 'Wurzel' : n.target.key) : 'ins Leere'}`;
      default: return `${k}: ${preview(n.raw)}`;
    }
  }

  function geoPath(a, b) {
    const A = toScreen(a), B = toScreen(b);
    const g = H.geodesic(a, b);
    if (g.line || g.r * S() > 2e5) { ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); return { A, B, line: true }; }
    const C = toScreen(g.c), r = g.r * S();
    const a1 = Math.atan2(A[1] - C[1], A[0] - C[0]), a2 = Math.atan2(B[1] - C[1], B[0] - C[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    ctx.moveTo(A[0], A[1]);
    ctx.arc(C[0], C[1], r, a1, a2, d < 0);
    return { A, B, C, r, a2, d, line: false };
  }
  function arrowHead(geo, back, size) {
    let dx, dy;
    if (geo.line) { dx = geo.B[0] - geo.A[0]; dy = geo.B[1] - geo.A[1]; }
    else {
      const t = geo.a2 - Math.sign(geo.d) * Math.min(0.05, Math.abs(geo.d) / 3);
      dx = geo.B[0] - (geo.C[0] + geo.r * Math.cos(t)); dy = geo.B[1] - (geo.C[1] + geo.r * Math.sin(t));
    }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const tx = geo.B[0] - dx * back, ty = geo.B[1] - dy * back;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - dx * size - dy * size * 0.55, ty - dy * size + dx * size * 0.55);
    ctx.lineTo(tx - dx * size + dy * size * 0.55, ty - dy * size - dx * size * 0.55);
    ctx.closePath();
  }

  let drawQueued = false;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  let lastT = performance.now();
  function frame(now) {
    drawQueued = false;
    const dt = Math.min(64, now - lastT); lastT = now;
    stepShift(now); stepAnim(now); stepInertia(dt);
    draw(now);
    const dashing = showRefs && !reduced.matches && (selected || hover) && activeRefs().length;
    if (anim || inertia || shift || dashing) requestDraw();
  }

  function activeRefs() {
    const out = [];
    for (const n of [selected, hover]) if (n) {
      if (n.type === 'ref') out.push(n);
      n.refsIn.forEach((r) => out.push(r));
    }
    return out;
  }

  function draw(now) {
    if (!model) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.plane; ctx.fillRect(0, 0, W, Hh);
    const s = S(), C0 = toScreen([0, 0]);

    // Scheibe + hyperbolische Abstandskreise um das Zentrum
    ctx.beginPath(); ctx.arc(C0[0], C0[1], s, 0, 2 * Math.PI); ctx.fillStyle = colors.disk; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = colors['brass-dim']; ctx.globalAlpha = 0.22;
    for (let d = 1; d <= 5; d++) { ctx.beginPath(); ctx.arc(C0[0], C0[1], s * Math.tanh(d / 2), 0, 2 * Math.PI); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // Messingring mit Teilung: zeigt die aktuelle Drehung
    const rot = H.angleOf(V);
    ctx.beginPath(); ctx.arc(C0[0], C0[1], s + 2, 0, 2 * Math.PI);
    ctx.strokeStyle = colors.brass; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(C0[0], C0[1], s + 24, 0, 2 * Math.PI);
    ctx.strokeStyle = colors['brass-dim']; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 72; i++) {
      const a = rot + i * Math.PI / 36, len = i % 6 === 0 ? 14 : 6;
      ctx.moveTo(C0[0] + Math.cos(a) * (s + 6), C0[1] + Math.sin(a) * (s + 6));
      ctx.lineTo(C0[0] + Math.cos(a) * (s + 6 + len), C0[1] + Math.sin(a) * (s + 6 + len));
    }
    ctx.strokeStyle = colors.brass; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(C0[0] + Math.cos(rot) * (s + 16), C0[1] + Math.sin(rot) * (s + 16), 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = colors.brass; ctx.fill();

    // Lage aller sichtbaren Knoten
    for (const n of visible) {
      n.w = H.apply(V, n.pos);
      const f = 1 - H.abs2(n.w);
      n.f = f;
      [n.sx, n.sy] = toScreen(n.w);
      n.rr = (nodeBase[n.type] || 0.03) * s * f;
    }

    ctx.save();
    ctx.beginPath(); ctx.arc(C0[0], C0[1], s, 0, 2 * Math.PI); ctx.clip();

    // Pfad des ausgewaehlten Knotens zur Wurzel
    const onPath = new Set();
    for (let p = selected; p; p = p.parent) onPath.add(p);

    // Baumkanten als Geodaeten
    ctx.lineCap = 'round';
    for (const n of visible) {
      const p = n.parent;
      if (!p || (n.f < 0.01 && p.f < 0.01)) continue;
      const hot = onPath.has(n);
      ctx.beginPath(); geoPath(p.w, n.w);
      ctx.strokeStyle = hot ? colors.brass : colors['brass-dim'];
      ctx.globalAlpha = hot ? 1 : 0.35 + 0.55 * Math.min(1, (n.f + p.f));
      ctx.lineWidth = Math.max(0.5, (hot ? 3 : 1.6) * Math.min(1, (n.f + p.f) / 1.2) * Math.min(1.8, Math.sqrt(zoom)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Verweise
    if (showRefs) {
      const act = new Set(activeRefs());
      for (const n of visible) {
        if (n.type !== 'ref' || !n.target) continue;
        const t = visibleAncestor(n.target);
        if (!t || t === n) continue;
        if (n.f < 0.01 && t.f < 0.01) continue;
        const hot = act.has(n);
        ctx.beginPath();
        const geo = geoPath(n.w, t.w);
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = hot && !reduced.matches ? -now / 35 : 0;
        ctx.strokeStyle = colors.ref;
        ctx.globalAlpha = hot ? 1 : (selected || hover ? 0.18 : 0.55);
        ctx.lineWidth = hot ? 2.2 : 1.3;
        ctx.stroke(); ctx.setLineDash([]);
        const size = Math.max(4, Math.min(9, 9 * t.f * Math.sqrt(zoom)));
        ctx.beginPath(); arrowHead(geo, t.rr + 2, size); ctx.fillStyle = colors.ref; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Knoten, kleine zuerst
    const order = visible.filter((n) => n.rr > 0.5).sort((a, b) => a.rr - b.rr);
    for (const n of order) {
      const col = n.type === 'ref' && !n.target ? colors.broken : colors['t-' + n.type];
      ctx.beginPath(); ctx.arc(n.sx, n.sy, n.rr, 0, 2 * Math.PI);
      if (n.type === 'object' || n.type === 'array') {
        ctx.fillStyle = col; ctx.fill();
        if (n.collapsed) { ctx.lineWidth = Math.max(1, n.rr * 0.18); ctx.strokeStyle = colors.disk; ctx.stroke(); }
      } else if (n.type === 'ref') {
        ctx.fillStyle = colors.disk; ctx.fill();
        ctx.lineWidth = Math.max(1, n.rr * 0.28); ctx.strokeStyle = col; ctx.stroke();
      } else {
        ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      }
      if (n === selected || n === hover) {
        ctx.beginPath(); ctx.arc(n.sx, n.sy, n.rr + 4, 0, 2 * Math.PI);
        ctx.lineWidth = n === selected ? 2.5 : 1.5; ctx.strokeStyle = colors.ink; ctx.stroke();
      }
    }

    // Beschriftungen
    ctx.textBaseline = 'middle';
    const near = new Set([selected, hover]);
    if (selected) {
      if (selected.parent) near.add(selected.parent);
      visKids(selected).forEach((c) => near.add(c));
      if (selected.type === 'ref' && selected.target) near.add(visibleAncestor(selected.target));
      selected.refsIn.forEach((r) => near.add(r));
    }
    for (const n of order) {
      const fs = Math.min(16, n.rr * 0.8 + 4);
      if (fs < 9.5 && !(near.has(n) && n.rr > 1.5)) continue;
      ctx.font = `${n.type === 'object' || n.type === 'array' ? 600 : 400} ${Math.max(fs, 11)}px ${getComputedStyle(document.body).fontFamily}`;
      const txt = labelOf(n);
      ctx.lineWidth = 4; ctx.strokeStyle = colors.disk; ctx.lineJoin = 'round';
      ctx.globalAlpha = Math.min(1, (fs - 8) / 4) || 1;
      ctx.strokeText(txt, n.sx + n.rr + 5, n.sy);
      ctx.fillStyle = n.type === 'ref' && !n.target ? colors.broken : colors.ink;
      ctx.fillText(txt, n.sx + n.rr + 5, n.sy);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- Bewegung ----------
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function focusNode(n, opts = {}) {
    if (!n) return;
    n = visibleAncestor(n);
    select(n);
    inertia = null;
    const w = H.apply(V, n.pos);
    const T1 = H.compose(H.translate(H.neg(w)), V);
    let phi = opts.upright ? -H.angleOf(T1) : 0;
    if (n.parent) {
      const q = H.apply(T1, n.parent.pos);
      phi = Math.PI - Math.atan2(q[1], q[0]);
    }
    while (phi > Math.PI) phi -= 2 * Math.PI;
    while (phi < -Math.PI) phi += 2 * Math.PI;
    const z1 = opts.zoom ? Math.min(12, Math.max(0.35, opts.zoom)) : zoom;
    const dist = H.distance([0, 0], w);
    anim = { V0: V, w, phi, z0: zoom, z1, o0: [ox, oy], t0: performance.now(),
      dur: reduced.matches ? 0 : Math.min(1100, 420 + 180 * dist + 140 * Math.abs(phi)) };
    requestDraw();
  }
  function stepAnim(now) {
    if (!anim) return;
    const t = anim.dur ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
    const e = ease(t);
    V = H.compose(H.rotate(anim.phi * e), H.compose(H.translate(H.neg(H.geodesicPoint(anim.w, e))), anim.V0));
    zoom = anim.z0 * Math.pow(anim.z1 / anim.z0, e);
    ox = anim.o0[0] * (1 - e); oy = anim.o0[1] * (1 - e);
    if (t >= 1) anim = null;
  }
  function stepInertia(dt) {
    if (!inertia) return;
    let v = inertia.v;
    const step = [v[0] * dt, v[1] * dt];
    const l = Math.hypot(step[0], step[1]);
    if (l > 0.15) { step[0] *= 0.15 / l; step[1] *= 0.15 / l; }
    V = H.compose(H.translate(step), V);
    const k = Math.exp(-dt / 320);
    inertia.v = [v[0] * k, v[1] * k];
    if (Math.hypot(inertia.v[0], inertia.v[1]) < 2e-5) inertia = null;
  }
  function zoomAt(p, f) {
    const nz = Math.min(12, Math.max(0.35, zoom * f));
    f = nz / zoom;
    ox = p[0] - cx - (p[0] - cx - ox) * f;
    oy = p[1] - cy - (p[1] - cy - oy) * f;
    zoom = nz;
    requestDraw();
  }
  function rotateView(delta, aboutScreen) {
    const c = aboutScreen ? clampDisk(toDisk(aboutScreen), 0.9) : [0, 0];
    V = H.compose(H.rotateAbout(c, delta), V);
    requestDraw();
  }
  function panView(dx, dy) { V = H.compose(H.translate([dx, dy]), V); requestDraw(); }
  function stopMotion() { anim = null; inertia = null; }
  function resetView() { focusNode(model.root, { zoom: 1, upright: true }); }

  // ---------- Treffer ----------
  function hitNode(p, touch) {
    let best = null, bestScore = Infinity;
    const slack = touch ? 12 : 4;
    for (const n of visible) {
      if (!(n.rr > 0.5)) continue;
      const d = Math.hypot(p[0] - n.sx, p[1] - n.sy);
      if (d <= n.rr + slack && d - n.rr < bestScore) { best = n; bestScore = d - n.rr; }
    }
    return best;
  }
  function onRing(p) {
    const C0 = toScreen([0, 0]);
    const d = Math.hypot(p[0] - C0[0], p[1] - C0[1]);
    return d > S() - 2 && d < S() + 34;
  }
  const angleFromCenter = (p) => { const C0 = toScreen([0, 0]); return Math.atan2(p[1] - C0[1], p[0] - C0[0]); };

  // ---------- Zeiger (Maus, Stift, Touch) ----------
  const pointers = new Map();
  let gesture = null;       // {mode, ...}
  let lastTap = { t: 0, node: null, p: [0, 0] };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function pairState() {
    const [a, b] = [...pointers.values()];
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    const p = pos(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    pointers.set(e.pointerId, p);
    stopMotion();
    if (pointers.size === 2) {
      gesture = { mode: 'pinch', moved: true, ...pairState() };
    } else if (pointers.size === 1) {
      const touch = e.pointerType !== 'mouse';
      const node = hitNode(p, touch);
      let mode = 'drag';
      if (e.button === 2 || e.shiftKey) mode = 'rotate';
      else if (e.ctrlKey || e.metaKey) mode = 'pan';
      else if (!node && onRing(p)) mode = 'ring';
      gesture = { mode, start: p, last: p, lastT: performance.now(), moved: false, node, touch, v: [0, 0] };
      canvas.classList.add('grabbing');
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const n = hitNode(p, false);
        if (n !== hover) { hover = n; requestDraw(); }
        canvas.classList.toggle('on-node', !!n);
        canvas.classList.toggle('on-ring', !n && onRing(p));
      }
      return;
    }
    pointers.set(e.pointerId, p);
    if (!gesture) return;
    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const st = pairState();
      V = H.compose(H.dragMap(clampDisk(toDisk(gesture.mid)), clampDisk(toDisk(st.mid))), V);
      let da = st.ang - gesture.ang;
      if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      V = H.compose(H.rotateAbout(clampDisk(toDisk(st.mid), 0.9), da), V);
      zoomAt(st.mid, st.dist / gesture.dist);
      Object.assign(gesture, st);
      requestDraw();
      return;
    }
    const g = gesture;
    if (Math.hypot(p[0] - g.start[0], p[1] - g.start[1]) > (g.touch ? 9 : 4)) g.moved = true;
    if (!g.moved) return;
    const now = performance.now();
    if (g.mode === 'drag') {
      const m = H.dragMap(clampDisk(toDisk(g.last)), clampDisk(toDisk(p)));
      V = H.compose(m, V);
      const d = H.apply(m, [0, 0]), dt = Math.max(1, now - g.lastT);
      g.v = [g.v[0] * 0.4 + 0.6 * d[0] / dt, g.v[1] * 0.4 + 0.6 * d[1] / dt];
    } else if (g.mode === 'rotate' || g.mode === 'ring') {
      let da = angleFromCenter(p) - angleFromCenter(g.last);
      if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      V = H.compose(H.rotate(da), V);
    } else if (g.mode === 'pan') {
      ox += p[0] - g.last[0]; oy += p[1] - g.last[1];
    }
    g.last = p; g.lastT = now;
    requestDraw();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g && g.mode === 'pinch') {
      if (pointers.size === 1) {
        const rest = [...pointers.values()][0];
        gesture = { mode: 'drag', start: rest, last: rest, lastT: performance.now(), moved: true, v: [0, 0], touch: true };
      } else gesture = null;
      return;
    }
    gesture = null;
    canvas.classList.remove('grabbing');
    if (!g || e.type === 'pointercancel') return;
    const p = pos(e), now = performance.now();
    if (!g.moved) {
      const node = hitNode(p, g.touch);
      const dbl = now - lastTap.t < 320 && Math.hypot(p[0] - lastTap.p[0], p[1] - lastTap.p[1]) < 30;
      if (node) {
        if (dbl && lastTap.node === node) focusNode(node, { zoom: zoom * 1.8 });
        else focusNode(node);
      } else if (dbl) zoomAt(p, 1.8);
      else if (g.mode === 'drag') { select(null); }
      lastTap = { t: now, node, p };
      return;
    }
    if (g.mode === 'drag' && now - g.lastT < 60 && !reduced.matches && Math.hypot(g.v[0], g.v[1]) > 1.5e-4) {
      inertia = { v: g.v }; requestDraw();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hover && !pointers.size) { hover = null; requestDraw(); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopMotion();
    const p = pos(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Hh : 1;
    const dy = e.deltaY * unit, dx = e.deltaX * unit;
    if (e.shiftKey || e.altKey) rotateView((dy || dx) * 0.004, p);
    else if (e.ctrlKey) zoomAt(p, Math.exp(-dy * 0.012));        // Trackpad-Pinch
    else zoomAt(p, Math.exp(-dy * 0.0016));
  }, { passive: false });

  // Safari-Trackpad: Drehgeste und Pinch (nur, wenn kein Touch-Pinch laeuft)
  let gs = null;
  window.addEventListener('gesturestart', (e) => { e.preventDefault(); if (pointers.size < 2) gs = { scale: e.scale, rot: e.rotation }; });
  window.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (!gs || pointers.size >= 2) return;
    const p = pos(e);
    zoomAt(p, e.scale / gs.scale);
    rotateView((e.rotation - gs.rot) * Math.PI / 180, p);
    gs = { scale: e.scale, rot: e.rotation };
  });
  window.addEventListener('gestureend', (e) => { e.preventDefault(); gs = null; });

  // ---------- Tastatur ----------
  canvas.addEventListener('keydown', (e) => {
    const step = 0.08;
    const k = e.key;
    let handled = true;
    if (k === 'ArrowLeft') panView(step, 0);
    else if (k === 'ArrowRight') panView(-step, 0);
    else if (k === 'ArrowUp') panView(0, step);
    else if (k === 'ArrowDown') panView(0, -step);
    else if (k === '+' || k === '=') zoomAt([cx, cy], 1.25);
    else if (k === '-' || k === '_') zoomAt([cx, cy], 0.8);
    else if (k === 'q' || k === 'Q') rotateView(-Math.PI / 12);
    else if (k === 'e' || k === 'E') rotateView(Math.PI / 12);
    else if (k === '0' || k === 'Home') resetView();
    else if (k === 'Escape') select(null);
    else if ((k === 'Backspace' || k === 'p') && selected && selected.parent) focusNode(selected.parent);
    else if (k === 'f' && selected && selected.type === 'ref' && selected.target) focusNode(selected.target);
    else if ((k === 'Enter' || k === ' ') && selected) focusNode(selected);
    else if ((k === ']' || k === '[' || k === 'Tab') && visible.length) {
      const sib = selected && selected.parent ? visKids(selected.parent) : [model.root];
      const i = Math.max(0, sib.indexOf(selected));
      const dir = (k === '[' || (k === 'Tab' && e.shiftKey)) ? -1 : 1;
      if (k === 'Tab' && !selected) focusNode(model.root);
      else focusNode(sib[(i + dir + sib.length) % sib.length]);
    }
    else handled = false;
    if (handled) { e.preventDefault(); stopMotion(); if (anim === null) requestDraw(); }
  });

  // ---------- Panel ----------
  const typeName = { object: 'Objekt', array: 'Liste', string: 'Text', number: 'Zahl', literal: 'Wert', ref: 'Verweis' };
  function select(n) {
    const had = !!selected;
    selected = n; renderPanel();
    if (had !== !!n) shiftStage(); else requestDraw();
  }
  // Panel auf/zu: Scheibe gleitet an ihren neuen Platz statt zu springen
  let shift = null;
  function shiftStage() {
    const from = { cx, cy, R };
    resize();
    if (reduced.matches) return;
    const to = { cx, cy, R };
    shift = { from, to, t0: performance.now() };
    cx = from.cx; cy = from.cy; R = from.R;
    requestDraw();
  }
  function stepShift(now) {
    if (!shift) return;
    const t = Math.min(1, (now - shift.t0) / 320), e = 1 - Math.pow(1 - t, 3);
    cx = shift.from.cx + (shift.to.cx - shift.from.cx) * e;
    cy = shift.from.cy + (shift.to.cy - shift.from.cy) * e;
    R = shift.from.R + (shift.to.R - shift.from.R) * e;
    if (t >= 1) shift = null;
  }
  function el(tag, attrs, ...kids) {
    const x = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'on') x.addEventListener('click', v); else if (k === 'class') x.className = v; else x.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) x.append(c);
    return x;
  }
  const nameOf = (n) => (n.key === null ? 'Wurzel' : String(n.key));
  function renderPanel() {
    if (!selected) { panel.hidden = true; panel.replaceChildren(); return; }
    const n = selected;
    panel.hidden = false;
    const crumbs = el('nav', { class: 'crumbs', 'aria-label': 'Pfad' });
    const chain = []; for (let p = n; p; p = p.parent) chain.unshift(p);
    chain.forEach((p, i) => {
      if (i) crumbs.append(el('span', null, '/'));
      crumbs.append(el('button', { on: () => focusNode(p) }, nameOf(p)));
    });
    let body;
    if (n.type === 'object' || n.type === 'array' || n.type === 'ref') {
      let txt = JSON.stringify(n.raw, null, 2);
      if (txt.length > 900) txt = txt.slice(0, 900) + '\n…';
      body = el('pre', null, txt);
    } else body = el('pre', null, JSON.stringify(n.raw));
    const refs = el('div', { class: 'refs' });
    if (n.type === 'ref') {
      refs.append(el('p', null, 'Verweist auf'));
      if (n.target) refs.append(el('button', { on: () => focusNode(n.target) }, readable(n.ref)));
      else refs.append(el('span', { class: 'broken', role: 'note' }, `${n.ref} existiert nicht`));
    }
    if (n.refsIn.length) {
      refs.append(el('p', null, n.refsIn.length === 1 ? 'Verwiesen von 1 Stelle' : `Verwiesen von ${n.refsIn.length} Stellen`));
      n.refsIn.forEach((r) => refs.append(el('button', { on: () => focusNode(r) }, readable(r.path))));
    }
    const acts = el('div', { class: 'acts' });
    if (n.parent) acts.append(el('button', { on: () => focusNode(n.parent) }, 'Zum Elternknoten'));
    if (n.children.length) acts.append(el('button', { on: () => { n.collapsed = !n.collapsed; relayout(); renderPanel(); } }, n.collapsed ? 'Aufklappen' : 'Zuklappen'));
    acts.append(el('button', { on: () => focusNode(n, { zoom: Math.max(zoom, 2) }) }, 'Heranholen'));
    panel.replaceChildren(
      el('h2', null, nameOf(n)),
      el('div', { class: 'type' }, `${typeName[n.type]}${n.children.length ? `, ${n.children.length} Einträge` : ''}, Tiefe ${n.depth}`),
      crumbs, body, refs, acts);
  }
  function renderStats() {
    const m = model;
    $('#stats').textContent = `${m.nodes.length} Knoten, ${m.refs} Verweise${m.broken ? `, ${m.broken} davon ins Leere` : ''}`;
  }

  // ---------- Datensaetze ----------
  let clusterState = 'idle';
  function renderSets() {
    const box = $('#sets');
    box.replaceChildren();
    const chip = (id, label, fn, dis) => {
      const b = el('button', { class: 'chip', 'aria-pressed': String(currentSet === id), on: fn }, label);
      if (dis) b.disabled = true;
      box.append(b);
    };
    for (const [id, s] of Object.entries(SETS)) chip(id, s.label, () => loadData(s.data, id));
    chip('cluster', clusterState === 'loading' ? 'Cluster lädt …' : clusterState === 'error' ? 'Cluster nicht erreichbar' : 'Cluster (live)', loadCluster, clusterState === 'error');
    chip('eigenes', 'Eigenes JSON', openDialog);
  }
  async function loadCluster() {
    clusterState = 'loading'; renderSets();
    try {
      const r = await fetch('api/tree', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      clusterState = 'idle';
      loadData(data, 'cluster');
    } catch (err) { clusterState = 'error'; renderSets(); }
  }
  const dlg = $('#dlg');
  function openDialog() {
    const cur = currentSet in SETS ? SETS[currentSet].data : model.root.raw;
    $('#dlgText').value = JSON.stringify(cur, null, 2);
    $('#dlgErr').textContent = '';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#dlgOk').addEventListener('click', (e) => {
    e.preventDefault();
    try {
      const txt = $('#dlgText').value;
      if (txt.length > 300000) throw new Error('Text ist größer als 300 kB.');
      loadData(JSON.parse(txt), 'eigenes');
      dlg.close();
      canvas.focus();
    } catch (err) {
      $('#dlgErr').textContent = err instanceof SyntaxError ? `Kein gültiges JSON: ${err.message}` : err.message;
    }
  });

  // ---------- Bedienelemente ----------
  $('#bZoomIn').onclick = () => { stopMotion(); zoomAt([cx, cy], 1.35); };
  $('#bZoomOut').onclick = () => { stopMotion(); zoomAt([cx, cy], 1 / 1.35); };
  $('#bHome').onclick = resetView;
  $('#bRotL').onclick = () => { stopMotion(); rotateView(-Math.PI / 8); };
  $('#bRotR').onclick = () => { stopMotion(); rotateView(Math.PI / 8); };
  $('#bParent').onclick = () => { if (selected && selected.parent) focusNode(selected.parent); else resetView(); };
  $('#optValues').onchange = (e) => { showValues = e.target.checked; relayout(); };
  $('#optRefs').onchange = (e) => { showRefs = e.target.checked; requestDraw(); };
  const hint = $('#hint');
  try { if (localStorage.getItem('astrolab-hint') === 'off') hint.hidden = true; } catch (e) { /* ohne Speicher */ }
  $('#hintClose').onclick = () => { hint.hidden = true; try { localStorage.setItem('astrolab-hint', 'off'); } catch (e) { /* egal */ } };

  window.addEventListener('resize', () => { shift = null; resize(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', readColors);
  reduced.addEventListener?.('change', requestDraw);

  // Testhaken fuer die Browser-Pruefung
  window.__astro = {
    get V() { return V; }, get zoom() { return zoom; }, get mode() { return gesture && gesture.mode; }, get selected() { return selected; },
    get visible() { return visible; }, focusNode, find: (path) => model.nodes.find((n) => n.path === path),
  };

  resize(); readColors();
  loadData(SETS.bestellung.data, 'bestellung');
})();
