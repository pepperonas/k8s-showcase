// Hyperbolische Geometrie im Poincare-Scheibenmodell.
// Komplexe Zahlen als [re, im]; Automorphismen der Scheibe als
// z -> (a z + b) / (conj(b) z + conj(a)) mit |a|^2 - |b|^2 = 1.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hyper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const neg = (a) => [-a[0], -a[1]];
  const conj = (a) => [a[0], -a[1]];
  const abs2 = (a) => a[0] * a[0] + a[1] * a[1];
  const div = (a, b) => {
    const d = abs2(b);
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  };

  const identity = () => ({ a: [1, 0], b: [0, 0] });
  function normalize(m) {
    const k = 1 / Math.sqrt(abs2(m.a) - abs2(m.b));
    return { a: [m.a[0] * k, m.a[1] * k], b: [m.b[0] * k, m.b[1] * k] };
  }
  const apply = (m, z) => div(add(mul(m.a, z), m.b), add(mul(conj(m.b), z), conj(m.a)));
  // m1 nach m2 (erst m2, dann m1)
  const compose = (m1, m2) => normalize({
    a: add(mul(m1.a, m2.a), mul(m1.b, conj(m2.b))),
    b: add(mul(m1.a, m2.b), mul(m1.b, conj(m2.a))),
  });
  const inverse = (m) => ({ a: conj(m.a), b: neg(m.b) });
  // Verschiebung, die 0 auf p abbildet (|p| < 1)
  const translate = (p) => normalize({ a: [1, 0], b: [p[0], p[1]] });
  const rotate = (t) => ({ a: [Math.cos(t / 2), Math.sin(t / 2)], b: [0, 0] });
  // Bildet p0 auf p1 ab (Ziehen eines Punkts)
  const dragMap = (p0, p1) => compose(translate(p1), translate(neg(p0)));
  // Drehung um den Punkt c der Scheibe
  const rotateAbout = (c, t) => compose(translate(c), compose(rotate(t), translate(neg(c))));
  // Drehwinkel einer Abbildung (Richtungsaenderung im Ursprung des Bildes)
  const angleOf = (m) => 2 * Math.atan2(m.a[1], m.a[0]);

  // Punkt auf der Geodaete von 0 nach w, Anteil t der hyperbolischen Strecke
  function geodesicPoint(w, t) {
    const r = Math.sqrt(abs2(w));
    if (r < 1e-12) return [0, 0];
    const rt = Math.tanh(t * Math.atanh(Math.min(r, 1 - 1e-12)));
    return [w[0] * rt / r, w[1] * rt / r];
  }
  const distance = (z, w) => {
    const q = Math.sqrt(abs2(div(add(z, neg(w)), add([1, 0], neg(mul(conj(w), z))))));
    return 2 * Math.atanh(Math.min(q, 1 - 1e-12));
  };

  // Mittelpunkt des Kreises durch drei Punkte, null bei (fast) Kollinearitaet
  function circumcenter(p, q, r) {
    const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
    if (Math.abs(d) < 1e-9) return null;
    const p2 = abs2(p), q2 = abs2(q), r2 = abs2(r);
    return [
      (p2 * (q[1] - r[1]) + q2 * (r[1] - p[1]) + r2 * (p[1] - q[1])) / d,
      (p2 * (r[0] - q[0]) + q2 * (p[0] - r[0]) + r2 * (q[0] - p[0])) / d,
    ];
  }
  // Geodaete zwischen a und b in der Scheibe: Kreis senkrecht zum Rand oder Strecke
  function geodesic(a, b) {
    const cross = a[0] * b[1] - a[1] * b[0];
    const la = abs2(a), lb = abs2(b);
    if (Math.abs(cross) < 1e-7 * Math.max(1e-9, Math.sqrt(la * lb))) return { line: true };
    const far = la > lb ? a : b;                          // stabilere Inversion
    const inv = [far[0] / abs2(far), far[1] / abs2(far)];
    const c = circumcenter(a, b, inv);
    if (!c) return { line: true };
    return { line: false, c, r: Math.sqrt(abs2([c[0] - a[0], c[1] - a[1]])) };
  }

  // Winkel der Parallelitaet: halber Sichtwinkel einer Halbebene im Abstand s
  const parallelAngle = (s) => 2 * Math.atan(Math.exp(-s));

  // Hyperbolisches Layout: jeder Unterbaum liegt in einem Kegel, der seinen
  // Anteil am Winkel des Elternknotens nicht verlaesst (Lamping/Rao-Prinzip).
  function layout(root, opt) {
    const o = Object.assign({ minDist: 1.05, wedge: 0.9 * Math.PI, weightExp: 0.55 }, opt);
    const kids = o.children || ((n) => n.children);
    const weigh = (n) => {
      const ks = kids(n);
      n._leaves = ks.length ? ks.reduce((s, c) => s + weigh(c), 0) : 1;
      return n._leaves;
    };
    weigh(root);
    const place = (n, frame, isRoot) => {
      n.frame = frame;
      n.pos = apply(frame, [0, 0]);
      const ks = kids(n);
      if (!ks.length) return;
      const span = isRoot ? 2 * Math.PI : o.wedge;
      const ws = ks.map((c) => Math.pow(c._leaves, o.weightExp));
      const total = ws.reduce((s, w) => s + w, 0);
      let ang = isRoot ? (ks.length === 1 ? 0 : -Math.PI) : -span / 2;
      ks.forEach((c, i) => {
        const share = span * ws[i] / total;
        const theta = ang + share / 2;
        ang += share;
        // Abstand so gross, dass der Kegel des Kindes (2 * Parallelwinkel) in den Anteil passt
        const s = Math.max(o.minDist, -Math.log(Math.tan(Math.min(share, Math.PI * 1.98) / 4)));
        c._share = share;
        c._dist = s;
        place(c, compose(frame, compose(rotate(theta), translate([Math.tanh(s / 2), 0]))), false);
      });
    };
    place(root, identity(), true);
    return root;
  }

  return {
    mul, add, neg, conj, abs2, div, identity, normalize, apply, compose, inverse,
    translate, rotate, dragMap, rotateAbout, angleOf, geodesicPoint, distance,
    circumcenter, geodesic, parallelAngle, layout,
  };
});
