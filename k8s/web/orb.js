// Gemeinsame Darstellung der Astrolabium-Scheibe: Glaskugel, Messingring, hyperbolisches
// Gitter, beleuchtete Knoten, Lichtteilchen. Wird von tree.js und landing.js benutzt.
// Teures (Sterne, Kugel-Sprites, Glow) wird einmal vorgerendert und nur noch kopiert.
(function (root) {
  'use strict';

  // ---------- Farben ----------
  function rgb(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
  }
  const mix = (hex, toWhite, t) => {
    const a = rgb(hex), b = toWhite ? [255, 255, 255] : [0, 0, 0];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  };
  const rgba = (hex, a) => { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const isDark = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };

  // ---------- Sprites ----------
  const cache = new Map();
  function orbSprite(color, dark) {
    const key = 'orb' + color + dark;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(128), g = c.getContext('2d'), r = 60, m = 64;
    // Koerper: Licht von oben links, Kante dunkler
    const body = g.createRadialGradient(m - r * 0.38, m - r * 0.42, r * 0.04, m, m, r);
    body.addColorStop(0, mix(color, true, dark ? 0.72 : 0.6));
    body.addColorStop(0.3, mix(color, true, 0.18));
    body.addColorStop(0.75, color);
    body.addColorStop(1, mix(color, false, dark ? 0.5 : 0.32));
    g.fillStyle = body; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    // Randlicht unten rechts (zurueckgeworfenes Licht der Scheibe)
    const rim = g.createRadialGradient(m - r * 0.2, m - r * 0.25, r * 0.6, m, m, r);
    rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(0.86, 'rgba(255,255,255,0)'); rim.addColorStop(1, `rgba(255,255,255,${dark ? 0.22 : 0.35})`);
    g.fillStyle = rim; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    // Glanzpunkt
    const spec = g.createRadialGradient(m - r * 0.36, m - r * 0.44, 0, m - r * 0.36, m - r * 0.44, r * 0.32);
    spec.addColorStop(0, 'rgba(255,255,255,.85)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(m, m, r, 0, 7); g.fill();
    cache.set(key, c);
    return c;
  }
  function glowSprite(color, strength) {
    const key = 'glow' + color + strength;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(color, strength)); gr.addColorStop(0.35, rgba(color, strength * 0.35)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    cache.set(key, c);
    return c;
  }
  // Sternenstaub hinter der Scheibe (nur dunkles Thema), fester Zufall fuer ruhiges Bild
  function starField(w, h, ink) {
    const key = `stars${w}x${h}${ink}`;
    if (cache.has(key)) return cache.get(key);
    for (const k of cache.keys()) if (k.startsWith('stars')) cache.delete(k);
    const d = Math.ceil(Math.hypot(w, h)), c = canvas(d), g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count = Math.round(d * d / 9000);
    for (let i = 0; i < count; i++) {
      const x = rnd() * d, y = rnd() * d, r = rnd() < 0.08 ? 1.3 : 0.7, a = 0.12 + rnd() * 0.35;
      g.fillStyle = rgba(ink, a); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    cache.set(key, c);
    return c;
  }

  // ---------- Szene ----------
  function drawBackdrop(ctx, w, h, cx, cy, S, rot, col) {
    const dark = isDark(col.plane);
    ctx.fillStyle = col.plane; ctx.fillRect(0, 0, w, h);
    // weiches Licht hinter der Kugel
    const halo = ctx.createRadialGradient(cx, cy, S * 0.6, cx, cy, S * 1.9);
    halo.addColorStop(0, rgba(col.brass, dark ? 0.1 : 0.12)); halo.addColorStop(1, rgba(col.brass, 0));
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    if (dark) {
      const st = starField(w, h, col.ink);
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(rot * 0.12);   // leichte Parallaxe zur Drehung
      ctx.drawImage(st, -st.width / 2, -st.height / 2); ctx.restore();
    }
    // Schlagschatten unter der Kugel
    const sh = ctx.createRadialGradient(cx + S * 0.06, cy + S * 0.12, S * 0.85, cx + S * 0.06, cy + S * 0.12, S * 1.18);
    sh.addColorStop(0, `rgba(0,0,0,${dark ? 0.55 : 0.18})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx + S * 0.06, cy + S * 0.12, S * 1.18, 0, 7); ctx.fill();
  }

  function drawDisk(ctx, cx, cy, S, col) {
    const dark = isDark(col.plane);
    const base = ctx.createRadialGradient(cx - S * 0.3, cy - S * 0.35, S * 0.05, cx, cy, S * 1.05);
    base.addColorStop(0, mix(col.disk, true, dark ? 0.1 : 0.4));
    base.addColorStop(0.55, col.disk);
    base.addColorStop(1, mix(col.disk, false, dark ? 0.5 : 0.1));
    ctx.fillStyle = base; ctx.beginPath(); ctx.arc(cx, cy, S, 0, 7); ctx.fill();
  }
  // Glas oben drauf: Randvignette (Tiefe zum Rand hin) und Spiegelung
  function drawGlass(ctx, cx, cy, S, col) {
    const dark = isDark(col.plane);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, S, 0, 7); ctx.clip();
    const vig = ctx.createRadialGradient(cx, cy, S * 0.62, cx, cy, S);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, `rgba(0,0,0,${dark ? 0.55 : 0.16})`);
    ctx.fillStyle = vig; ctx.fillRect(cx - S, cy - S, 2 * S, 2 * S);
    // Spiegelung als gestauchter Kreisverlauf: laeuft weich aus, keine Formkante
    ctx.save();
    ctx.translate(cx - S * 0.36, cy - S * 0.5); ctx.rotate(-0.55); ctx.scale(1, 0.55);
    const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.62);
    spec.addColorStop(0, `rgba(255,255,255,${dark ? 0.1 : 0.3})`); spec.addColorStop(0.55, `rgba(255,255,255,${dark ? 0.035 : 0.1})`); spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec; ctx.fillRect(-S, -S, 2 * S, 2 * S);
    ctx.restore();
    // feine Lichtkante oben links
    ctx.lineWidth = Math.max(1, S * 0.006); ctx.strokeStyle = `rgba(255,255,255,${dark ? 0.16 : 0.5})`;
    ctx.beginPath(); ctx.arc(cx, cy, S - 1.5, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }

  // Hyperbolisches Gitter um die Wurzel: Kreise und Durchmesser, mit der Ebene verzerrt.
  // Moebius-Abbildungen bilden Kreise auf Kreise ab, deshalb genuegen drei Punkte je Kreis.
  function drawGrid(ctx, H, V, toScreen, geoPath, S, col, alpha) {
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = col['brass-dim']; ctx.globalAlpha = alpha;
    for (let d = 1; d <= 4; d++) {
      const r = Math.tanh(d / 2);
      const p = [0, 2.1, 4.2].map((t) => toScreen(H.apply(V, [r * Math.cos(t), r * Math.sin(t)])));
      const c = H.circumcenter(p[0], p[1], p[2]);
      if (!c) continue;
      const rad = Math.hypot(p[0][0] - c[0], p[0][1] - c[1]);
      if (rad < 2) continue;
      ctx.beginPath(); ctx.arc(c[0], c[1], rad, 0, 7); ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const t = k * Math.PI / 12, e = 0.9995;
      ctx.beginPath(); geoPath(H.apply(V, [e * Math.cos(t), e * Math.sin(t)]), H.apply(V, [-e * Math.cos(t), -e * Math.sin(t)])); ctx.stroke();
    }
    ctx.restore();
  }

  // Messingring: Metallglanz mit fester Lichtrichtung, gravierte Teilung dreht mit der Ansicht
  function drawRing(ctx, cx, cy, S, rot, col, band) {
    band = band || 24;
    const dark = isDark(col.plane);
    const r0 = S + 2, r1 = S + 2 + band;
    // Ringflaeche: zwei getrennte Kreise (moveTo dazwischen, sonst verbindet eine Linie sie zu einem Keil)
    const annulus = () => {
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, 2 * Math.PI);
      ctx.moveTo(cx + r0, cy);
      ctx.arc(cx, cy, r0, 0, 2 * Math.PI, true);
    };
    let fill;
    if (ctx.createConicGradient) {
      fill = ctx.createConicGradient(-Math.PI * 0.75, cx, cy);
      const hi = mix(col.brass, true, 0.55), lo = mix(col.brass, false, 0.45);
      [[0, hi], [0.12, col.brass], [0.3, lo], [0.5, mix(col.brass, true, 0.25)], [0.62, col.brass], [0.8, lo], [1, hi]].forEach(([p, c]) => fill.addColorStop(p, c));
    } else fill = col.brass;
    ctx.save();
    ctx.globalAlpha = dark ? 0.9 : 1;
    annulus(); ctx.fillStyle = fill; ctx.fill();
    ctx.globalAlpha = 1;
    // Abschattung zur Innenkante: der Ring liegt hoeher als das Glas
    const bevel = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    bevel.addColorStop(0, 'rgba(0,0,0,.35)'); bevel.addColorStop(0.18, 'rgba(0,0,0,0)'); bevel.addColorStop(0.85, 'rgba(255,255,255,0)'); bevel.addColorStop(1, 'rgba(255,255,255,.18)');
    annulus(); ctx.fillStyle = bevel; ctx.fill();
    // Teilung, eingraviert: dunkle Linie mit heller Kante daneben
    const tick = (a, len, wdt) => {
      ctx.moveTo(cx + Math.cos(a) * (r0 + 3), cy + Math.sin(a) * (r0 + 3));
      ctx.lineTo(cx + Math.cos(a) * (r0 + 3 + len), cy + Math.sin(a) * (r0 + 3 + len));
    };
    for (const [style, off] of [['rgba(255,255,255,.35)', 0.004], ['rgba(20,14,4,.75)', 0]]) {
      ctx.beginPath();
      for (let i = 0; i < 72; i++) tick(rot + i * Math.PI / 36 + off, i % 6 === 0 ? band * 0.62 : band * 0.3);
      ctx.strokeStyle = style; ctx.lineWidth = 1.1; ctx.stroke();
    }
    // Markierung der Drehung: kleiner Edelstein
    const mx = cx + Math.cos(rot) * (r1 - band * 0.3), my = cy + Math.sin(rot) * (r1 - band * 0.3);
    ctx.drawImage(glowSprite(col.ref, 0.7), mx - 14, my - 14, 28, 28);
    ctx.drawImage(orbSprite(col.ref, dark), mx - 4.5, my - 4.5, 9, 9);
    // Kanten
    ctx.lineWidth = 1;
    ctx.strokeStyle = mix(col.brass, false, 0.5); ctx.beginPath(); ctx.arc(cx, cy, r1 + 0.5, 0, 7); ctx.stroke();
    ctx.strokeStyle = mix(col.brass, true, 0.4); ctx.beginPath(); ctx.arc(cx, cy, r0 - 0.5, Math.PI, Math.PI * 1.75); ctx.stroke();
    ctx.restore();
  }

  // Knoten als beleuchtete Kugel; kleine Knoten flach (Sprites lohnen sich unter 2,5 px nicht)
  function drawNode(ctx, x, y, r, color, kind, opts) {
    const o = opts || {};
    const dark = o.dark !== false;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    if (o.glow) {
      const g = r * (2.6 + o.glow);
      ctx.drawImage(glowSprite(color, Math.min(0.9, 0.35 + 0.3 * o.glow)), x - g, y - g, 2 * g, 2 * g);
    }
    if (kind === 'ring') {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
      ctx.fillStyle = o.fill || 'rgba(0,0,0,.35)'; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = color; ctx.stroke();
      if (r > 4) { ctx.drawImage(orbSprite(color, dark), x - r * 0.36 - r * 0.18, y - r * 0.36 - r * 0.18, r * 0.36, r * 0.36); }
    } else if (r < 2.5) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.drawImage(orbSprite(color, dark), x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Bewegung in der hyperbolischen Ebene ----------
  // Punkt auf der Geodaete von a nach b, Anteil t der hyperbolischen Strecke
  function geoLerp(H, a, b, t) {
    if (t >= 1) return b;
    if (t <= 0) return a;
    const T = H.translate(H.neg(a));
    return H.apply(H.translate(a), H.geodesicPoint(H.apply(T, b), t));
  }
  // Lichtteilchen entlang einer Geodaete: Kopf mit Schweif
  function drawComet(ctx, H, toScreen, a, b, t, color, size) {
    for (let k = 4; k >= 0; k--) {
      const tt = t - k * 0.025;
      if (tt <= 0 || tt >= 1) continue;
      const p = toScreen(geoLerp(H, a, b, tt));
      const s = size * (1 - k * 0.17);
      ctx.globalAlpha = 1 - k * 0.2;
      ctx.drawImage(glowSprite(color, 0.9), p[0] - s * 2, p[1] - s * 2, s * 4, s * 4);
    }
    ctx.globalAlpha = 1;
  }

  root.Orb = { rgb, mix, rgba, isDark, orbSprite, glowSprite, drawBackdrop, drawDisk, drawGlass, drawGrid, drawRing, drawNode, geoLerp, drawComet };
})(typeof self !== 'undefined' ? self : this);
