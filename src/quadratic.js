// Pure maths for ax² + bx + c = 0. No DOM access, so it can be tested with `node --test`.

/** Relative tolerance under which the discriminant is treated as exactly zero. */
export const ZERO_TOLERANCE = 1e-12;

/** Smallest |a| the graph handles accept; at 0 the curve would be a straight line. */
export const MIN_ABS_A = 1e-3;

/**
 * Solve ax² + bx + c = 0.
 *
 * Uses the numerically stable form q = −(b + sign(b)·√D) / 2, x₁ = q / a, x₂ = c / q.
 * The textbook formula (−b ± √D) / 2a subtracts two nearly equal numbers when b² ≫ 4ac and
 * loses most of its digits: for a = 1, b = 10⁸, c = 1 it returns −7.45e-9 instead of −1e-8.
 */
export function solve(a, b, c) {
  for (const [name, value] of [["a", a], ["b", b], ["c", c]]) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { kind: "invalid", message: `${name} must be a finite number.` };
    }
  }
  if (a === 0) {
    return { kind: "not-quadratic", message: "a cannot be 0: the equation would be linear, not quadratic." };
  }

  const discriminant = b * b - 4 * a * c;
  const scale = Math.max(b * b, Math.abs(4 * a * c));
  if (Math.abs(discriminant) <= ZERO_TOLERANCE * scale) {
    const root = clean(-b / (2 * a));
    return { kind: "repeated", discriminant: 0, roots: [root, root] };
  }
  if (discriminant > 0) {
    const sqrtD = Math.sqrt(discriminant);
    const q = -0.5 * (b + (b >= 0 ? sqrtD : -sqrtD));
    const roots = [clean(q / a), clean(c / q)].sort((x, y) => x - y);
    return { kind: "real", discriminant, roots };
  }
  const re = clean(-b / (2 * a));
  const im = Math.sqrt(-discriminant) / Math.abs(2 * a);
  return { kind: "complex", discriminant, roots: [{ re, im: -im }, { re, im }] };
}

/** Turn −0 into 0 so it never prints as "-0". */
function clean(x) {
  return Object.is(x, -0) ? 0 : x;
}

/** Shape facts about y = ax² + bx + c (a ≠ 0). */
export function describe(a, b, c) {
  const h = clean(-b / (2 * a));
  const k = clean(c - (b * b) / (4 * a));
  return {
    vertex: { x: h, y: k },
    axis: h,
    yIntercept: c,
    opens: a > 0 ? "up" : "down",
    extreme: a > 0 ? "minimum" : "maximum",
    sum: clean(-b / a),
    product: clean(c / a),
  };
}

export const evaluate = (a, b, c, x) => (a * x + b) * x + c;

/** Coefficients of the parabola with vertex (h, k) and leading coefficient a. */
export function fromVertex(a, h, k) {
  return { a, b: clean(-2 * a * h), c: clean(a * h * h + k) };
}

/** Leading coefficient that passes through (h + u, y) for a parabola with vertex (h, k). */
export function leadingFromPoint(k, u, y) {
  return (y - k) / (u * u);
}

/** Keep |a| away from 0. Returns the clamped value and whether clamping happened. */
export function clampLeading(a, previousSign = 1) {
  if (Math.abs(a) >= MIN_ABS_A) return { a, clamped: false };
  const sign = a === 0 ? previousSign : Math.sign(a);
  return { a: sign * MIN_ABS_A, clamped: true };
}

/** A "nice" grid step (1, 2 or 5 × 10ⁿ) giving about `target` divisions of `range`. */
export function niceStep(range, target = 8) {
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** A graph window that shows the vertex, real roots and y-intercept with some margin. */
export function fitView(a, b, c) {
  const { vertex } = describe(a, b, c);
  const solution = solve(a, b, c);
  const xs = [vertex.x, 0];
  if (solution.kind === "real" || solution.kind === "repeated") xs.push(...solution.roots);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  const span = Math.max(xMax - xMin, 3 / Math.sqrt(Math.abs(a)), 1e-6);
  const pad = span * 0.22;
  xMin -= pad;
  xMax += pad;

  const ys = [0, vertex.y, c, evaluate(a, b, c, xMin), evaluate(a, b, c, xMax)];
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  const ySpan = Math.max(yMax - yMin, 1e-6);
  yMin -= ySpan * 0.1;
  yMax += ySpan * 0.1;
  return { xMin, xMax, yMin, yMax };
}

/** Human-friendly number: up to 6 significant digits, scientific notation for extremes. */
export function format(x) {
  if (!Number.isFinite(x)) return "—";
  if (x === 0 || Object.is(x, -0)) return "0";
  const abs = Math.abs(x);
  const sign = x < 0 ? "−" : ""; // a true minus sign, not a hyphen
  if (abs >= 1e7 || abs < 1e-4) {
    const [mantissa, exponent] = abs.toExponential(4).split("e");
    return `${sign}${trim(mantissa)} × 10${superscript(Number(exponent))}`;
  }
  return sign + trim(Number(abs.toPrecision(6)).toString());
}

function trim(text) {
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

const SUPERSCRIPTS = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

function superscript(n) {
  return String(n)
    .split("")
    .map((ch) => SUPERSCRIPTS[ch] ?? ch)
    .join("");
}

export function formatComplex({ re, im }) {
  const sign = im < 0 ? "−" : "+";
  const real = re === 0 ? "" : `${format(re)} ${sign} `;
  const imag = `${format(Math.abs(im))}i`;
  return re === 0 ? `${im < 0 ? "−" : ""}${imag}` : `${real}${imag}`;
}

/** "x² − 5x + 6" style rendering of a polynomial. */
export function formatStandard(a, b, c) {
  const terms = [
    [a, "x²"],
    [b, "x"],
    [c, ""],
  ];
  let out = "";
  for (const [coef, unit] of terms) {
    if (coef === 0) continue;
    const abs = Math.abs(coef);
    const body = unit && abs === 1 ? unit : `${format(abs)}${unit}`;
    if (!out) out = `${coef < 0 ? "−" : ""}${body}`;
    else out += ` ${coef < 0 ? "−" : "+"} ${body}`;
  }
  return out || "0";
}

function shift(name, value) {
  if (value === 0) return name;
  return `(${name} ${value > 0 ? "−" : "+"} ${format(Math.abs(value))})`;
}

function leading(a) {
  if (a === 1) return "";
  if (a === -1) return "−";
  return format(a);
}

/** "a(x − h)² + k". */
export function formatVertexForm(a, b, c) {
  const { vertex } = describe(a, b, c);
  const square = vertex.x === 0 ? "x²" : `${shift("x", vertex.x)}²`;
  const tail = vertex.y === 0 ? "" : ` ${vertex.y < 0 ? "−" : "+"} ${format(Math.abs(vertex.y))}`;
  return `${leading(a)}${square}${tail}`;
}

/** "a(x − r₁)(x − r₂)" for real roots, otherwise null. */
export function formatFactored(a, b, c) {
  const solution = solve(a, b, c);
  if (solution.kind === "repeated") {
    const [r] = solution.roots;
    return `${leading(a)}${r === 0 ? "x²" : `${shift("x", r)}²`}`;
  }
  if (solution.kind !== "real") return null;
  const [r1, r2] = solution.roots;
  const factor = (r) => (r === 0 ? "x" : shift("x", r));
  return `${leading(a)}${factor(r1)}${factor(r2)}`;
}
