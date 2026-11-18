import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampLeading,
  describe,
  evaluate,
  fitView,
  format,
  formatComplex,
  formatFactored,
  formatStandard,
  formatVertexForm,
  fromVertex,
  leadingFromPoint,
  MIN_ABS_A,
  niceStep,
  solve,
} from "../src/quadratic.js";

const close = (actual, expected, rel = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= rel * Math.max(1, Math.abs(expected)), `${actual} ≉ ${expected}`);

test("two real roots, sorted ascending", () => {
  const s = solve(1, -5, 6);
  assert.equal(s.kind, "real");
  assert.deepEqual(s.roots, [2, 3]);
  assert.equal(s.discriminant, 1);
});

test("repeated root", () => {
  assert.deepEqual(solve(1, -4, 4), { kind: "repeated", discriminant: 0, roots: [2, 2] });
});

test("complex roots", () => {
  const s = solve(1, 2, 5);
  assert.equal(s.kind, "complex");
  assert.deepEqual(s.roots, [{ re: -1, im: -2 }, { re: -1, im: 2 }]);
  assert.equal(formatComplex(s.roots[1]), "−1 + 2i");
  assert.equal(formatComplex({ re: 0, im: -3 }), "−3i");
});

test("stable when b² ≫ 4ac (the textbook formula loses the small root)", () => {
  const [small, large] = solve(1, 1e8, 1).roots.slice().sort((x, y) => Math.abs(x) - Math.abs(y));
  close(small, -1e-8, 1e-9);
  close(large, -1e8, 1e-12);
  // Every reported root must satisfy the equation to within rounding of its largest term.
  for (const r of solve(1, 1e8, 1).roots) {
    const terms = Math.max(Math.abs(r * r), Math.abs(1e8 * r), 1);
    assert.ok(Math.abs(evaluate(1, 1e8, 1, r)) / terms < 1e-12, `residual too large at ${r}`);
  }
});

test("negative b and negative a", () => {
  assert.deepEqual(solve(-1, 0, 4).roots, [-2, 2]);
  assert.deepEqual(solve(2, -4, -6).roots, [-1, 3]);
});

test("near-zero discriminant from rounding is treated as a repeated root", () => {
  const s = solve(0.1, 0.2, 0.1); // exact D = 0, floating point gives a tiny residue
  assert.equal(s.kind, "repeated");
  close(s.roots[0], -1);
});

test("c = 0 gives a zero root without -0", () => {
  const s = solve(1, 3, 0);
  assert.deepEqual(s.roots, [-3, 0]);
  assert.ok(!Object.is(s.roots[1], -0));
});

test("rejects a = 0 and non-finite input", () => {
  assert.equal(solve(0, 2, 1).kind, "not-quadratic");
  assert.equal(solve(Number.NaN, 1, 1).kind, "invalid");
  assert.equal(solve(1, Infinity, 1).kind, "invalid");
  assert.equal(solve(1, "2", 1).kind, "invalid");
});

test("describe: vertex, axis, intercept, Vieta", () => {
  const d = describe(1, -5, 6);
  assert.deepEqual(d.vertex, { x: 2.5, y: -0.25 });
  assert.equal(d.opens, "up");
  assert.equal(d.extreme, "minimum");
  assert.equal(d.sum, 5);
  assert.equal(d.product, 6);
  assert.equal(describe(-2, 0, 3).opens, "down");
});

test("vertex round trip keeps the leading coefficient", () => {
  const { a, b, c } = fromVertex(2, 1.5, -3);
  const d = describe(a, b, c);
  close(d.vertex.x, 1.5);
  close(d.vertex.y, -3);
  assert.equal(leadingFromPoint(-3, 1, -1), 2);
});

test("clampLeading never returns 0 and reports clamping", () => {
  assert.deepEqual(clampLeading(0.5), { a: 0.5, clamped: false });
  assert.deepEqual(clampLeading(0.0001), { a: MIN_ABS_A, clamped: true });
  assert.deepEqual(clampLeading(-0.0001), { a: -MIN_ABS_A, clamped: true });
  assert.deepEqual(clampLeading(0, -1), { a: -MIN_ABS_A, clamped: true });
});

test("niceStep picks 1-2-5 steps", () => {
  assert.equal(niceStep(10), 2);
  assert.equal(niceStep(100), 20);
  assert.equal(niceStep(3), 0.5);
  assert.equal(niceStep(0), 1);
});

test("fitView contains the vertex, roots and y-intercept", () => {
  for (const [a, b, c] of [[1, -5, 6], [1, -200, 9999], [-0.5, 1, 4], [1, 2, 5], [0.001, 0, -1]]) {
    const v = fitView(a, b, c);
    const s = solve(a, b, c);
    const d = describe(a, b, c);
    const pts = [[d.vertex.x, d.vertex.y], [0, c]];
    if (s.kind === "real") pts.push(...s.roots.map((r) => [r, 0]));
    for (const [x, y] of pts) {
      assert.ok(x >= v.xMin && x <= v.xMax, `x=${x} outside [${v.xMin}, ${v.xMax}] for ${[a, b, c]}`);
      assert.ok(y >= v.yMin && y <= v.yMax, `y=${y} outside [${v.yMin}, ${v.yMax}] for ${[a, b, c]}`);
    }
    assert.ok(v.xMax > v.xMin && v.yMax > v.yMin);
  }
});

test("number formatting", () => {
  assert.equal(format(2.5), "2.5");
  assert.equal(format(-0), "0");
  assert.equal(format(1 / 3), "0.333333");
  assert.equal(format(1e-8), "1 × 10⁻⁸");
  assert.equal(format(-1.23e9), "−1.23 × 10⁹");
  assert.equal(format(-2.5), "−2.5");
  assert.equal(format(Number.NaN), "—");
});

test("polynomial forms", () => {
  assert.equal(formatStandard(1, -5, 6), "x² − 5x + 6");
  assert.equal(formatStandard(-1, 0, 4), "−x² + 4");
  assert.equal(formatStandard(2, 1, 0), "2x² + x");
  assert.equal(formatVertexForm(1, -5, 6), "(x − 2.5)² − 0.25");
  assert.equal(formatVertexForm(1, 0, 0), "x²");
  assert.equal(formatFactored(1, -5, 6), "(x − 2)(x − 3)");
  assert.equal(formatFactored(2, -4, -6), "2(x + 1)(x − 3)");
  assert.equal(formatFactored(1, -4, 4), "(x − 2)²");
  assert.equal(formatFactored(1, 3, 0), "(x + 3)x");
  assert.equal(formatFactored(1, 2, 5), null);
});
