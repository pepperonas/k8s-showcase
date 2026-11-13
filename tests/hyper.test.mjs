import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const H = createRequire(import.meta.url)('../k8s/web/hyper.js');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearZ = (z, w, eps = 1e-9) => { near(z[0], w[0], eps); near(z[1], w[1], eps); };

test('translate bildet 0 auf p ab und bleibt in der Scheibe', () => {
  const p = [0.3, -0.5];
  nearZ(H.apply(H.translate(p), [0, 0]), p);
  for (const z of [[0.9, 0], [-0.2, 0.7], [0.5, 0.5]]) assert.ok(H.abs2(H.apply(H.translate(p), z)) < 1);
});

test('dragMap bildet den gezogenen Punkt genau auf den Zeiger ab', () => {
  const p0 = [0.2, 0.1], p1 = [-0.4, 0.35];
  nearZ(H.apply(H.dragMap(p0, p1), p0), p1);
});

test('Komposition, Inverse und Normierung', () => {
  const m = H.compose(H.translate([0.4, 0.2]), H.rotate(1.1));
  const z = [0.1, -0.6];
  nearZ(H.apply(H.inverse(m), H.apply(m, z)), z);
  near(H.abs2(m.a) - H.abs2(m.b), 1);
  nearZ(H.apply(H.compose(H.translate([0.1, 0]), H.translate([0.2, 0])), [0, 0]),
        H.apply(H.translate([0.1, 0]), [0.2, 0]));
});

test('Moebius-Abbildungen erhalten den hyperbolischen Abstand', () => {
  const m = H.compose(H.rotateAbout([0.3, 0.3], 0.7), H.translate([-0.5, 0.2]));
  const z = [0.1, 0.2], w = [-0.6, 0.3];
  near(H.distance(H.apply(m, z), H.apply(m, w)), H.distance(z, w), 1e-9);
});

test('rotateAbout laesst den Drehpunkt fest', () => {
  const c = [0.25, -0.4];
  nearZ(H.apply(H.rotateAbout(c, 2.0), c), c);
  near(H.angleOf(H.rotate(0.8)), 0.8);
});

test('geodesicPoint liegt auf dem Durchmesser und teilt die Strecke', () => {
  const w = [0.6, 0.6];
  nearZ(H.geodesicPoint(w, 0), [0, 0]); nearZ(H.geodesicPoint(w, 1), w);
  near(H.distance([0, 0], H.geodesicPoint(w, 0.5)) * 2, H.distance([0, 0], w), 1e-9);
});

test('Geodaeten-Kreise stehen senkrecht auf dem Rand und laufen durch beide Punkte', () => {
  const a = [0.3, 0.1], b = [-0.2, 0.6];
  const g = H.geodesic(a, b);
  assert.equal(g.line, false);
  near(H.abs2(g.c), 1 + g.r * g.r, 1e-9);
  near(Math.hypot(a[0] - g.c[0], a[1] - g.c[1]), g.r, 1e-9);
  near(Math.hypot(b[0] - g.c[0], b[1] - g.c[1]), g.r, 1e-9);
  assert.equal(H.geodesic([0.2, 0.2], [-0.5, -0.5]).line, true);
  assert.equal(H.geodesic([0, 0], [0.5, 0.1]).line, true);
});

const tree = (spec) => ({ children: (spec || []).map(tree) });

test('Layout: Kinder liegen im Elternrahmen, Elternknoten aus Kindsicht bei 180 Grad', () => {
  const t = H.layout(tree([[[], []], [], [[], [], []]]));
  nearZ(t.pos, [0, 0]);
  for (const c of t.children) for (const g of c.children) {
    const local = H.apply(H.inverse(g.frame), c.pos);
    near(Math.atan2(local[1], local[0]) ** 2, Math.PI ** 2, 1e-9);
  }
});

test('Layout: Kegel der Geschwister ueberlappen nicht (vom Elternknoten aus gesehen)', () => {
  const t = H.layout(tree([[[], [], [], []], [[], []], [], [], [[[], []], []]]));
  const check = (n) => {
    const kids = n.children;
    for (const c of kids) assert.ok(2 * H.parallelAngle(c._dist) <= c._share + 1e-9, 'Kegel zu breit');
    kids.forEach(check);
  };
  check(t);
});

test('Layout: alle Knoten liegen in der Scheibe und sind verschieden', () => {
  const t = H.layout(tree([[[], [], []], [[], [[], []]], [], []]));
  const all = []; const walk = (n) => { all.push(n.pos); n.children.forEach(walk); }; walk(t);
  for (const p of all) assert.ok(H.abs2(p) < 1);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
    assert.ok(H.distance(all[i], all[j]) > 0.3, 'Knoten zu dicht');
});
