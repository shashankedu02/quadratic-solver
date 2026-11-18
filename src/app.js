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
  niceStep,
  solve,
} from "./quadratic.js";

const $ = (id) => document.getElementById(id);
const canvas = $("graph");
const ctx = canvas.getContext("2d");
const inputs = { a: $("a"), b: $("b"), c: $("c") };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  a: 1,
  b: -5,
  c: 6,
  view: null, // { xMin, xMax, yMin, yMax }
  drag: null, // "vertex" | "shape"
  hover: null, // { x, y } in CSS pixels
  size: { w: 0, h: 0 },
  shapeOffset: 1, // the stretch handle sits at x = h + shapeOffset
};

// ---------------------------------------------------------------- parsing and state

function parse(text) {
  const cleaned = String(text).trim().replace(/−/g, "-").replace(/\s+/g, "");
  if (cleaned === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function setCoefficients({ a, b, c }, { updateInputs = true, refit = true } = {}) {
  Object.assign(state, { a, b, c });
  if (updateInputs) {
    inputs.a.value = toInput(a);
    inputs.b.value = toInput(b);
    inputs.c.value = toInput(c);
    for (const field of document.querySelectorAll(".field")) field.classList.remove("invalid");
    $("input-error").textContent = "";
  }
  if (refit) animateViewTo(fitView(a, b, c));
  render();
}

function toInput(x) {
  return Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(10)));
}

function readInputs() {
  const values = {};
  const errors = [];
  for (const [name, input] of Object.entries(inputs)) {
    const value = parse(input.value);
    const field = input.closest(".field");
    const bad = !Number.isFinite(value) || (name === "a" && value === 0);
    field.classList.toggle("invalid", bad);
    if (!Number.isFinite(value)) errors.push(`${name} must be a number.`);
    else if (name === "a" && value === 0) errors.push("a cannot be 0: that would be a straight line, not a parabola.");
    values[name] = value;
  }
  $("input-error").textContent = errors.join(" ");
  return errors.length ? null : values;
}

// ---------------------------------------------------------------- results

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const { a, b, c } = state;
  const solution = solve(a, b, c);
  const facts = describe(a, b, c);

  $("equation").textContent = `${formatStandard(a, b, c)} = 0`;

  const rootsCard = $("roots-card");
  const roots = $("roots");
  rootsCard.classList.remove("complex", "invalid");
  roots.replaceChildren();
  const addRoot = (name, value) => {
    const row = el("div", "root");
    row.append(el("span", "name", name), el("span", "value", value));
    roots.append(row);
  };
  if (solution.kind === "real") {
    addRoot("x₁ =", format(solution.roots[0]));
    addRoot("x₂ =", format(solution.roots[1]));
    $("roots-note").textContent = "Two distinct real roots: the parabola crosses the x-axis twice.";
  } else if (solution.kind === "repeated") {
    addRoot("x =", format(solution.roots[0]));
    $("roots-note").textContent = "One repeated root: the vertex touches the x-axis.";
  } else if (solution.kind === "complex") {
    rootsCard.classList.add("complex");
    addRoot("x₁ =", formatComplex(solution.roots[0]));
    addRoot("x₂ =", formatComplex(solution.roots[1]));
    $("roots-note").textContent = "No real roots: the parabola never meets the x-axis. The roots are complex conjugates.";
  } else {
    rootsCard.classList.add("invalid");
    addRoot("", solution.message);
    $("roots-note").textContent = "";
  }

  const d = solution.discriminant ?? Number.NaN;
  $("disc").textContent = `Δ = ${format(d)}`;
  $("disc-note").textContent =
    solution.kind === "real" ? "Δ > 0 → two real roots" : solution.kind === "repeated" ? "Δ = 0 → one repeated root" : "Δ < 0 → complex roots";

  $("vertex").textContent = `(${format(facts.vertex.x)}, ${format(facts.vertex.y)})`;
  $("vertex-note").textContent = `${facts.extreme === "minimum" ? "Minimum" : "Maximum"} value ${format(facts.vertex.y)}; opens ${facts.opens}.`;
  $("axis").textContent = `x = ${format(facts.axis)}`;
  $("intercept").textContent = `Crosses the y-axis at (0, ${format(facts.yIntercept)}).`;

  $("form-standard").textContent = `y = ${formatStandard(a, b, c)}`;
  $("form-vertex").textContent = `y = ${formatVertexForm(a, b, c)}`;
  const factored = formatFactored(a, b, c);
  const factoredEl = $("form-factored");
  factoredEl.textContent = factored ? `y = ${factored}` : "Not over the real numbers (Δ < 0).";
  factoredEl.classList.toggle("none", !factored);

  renderSteps(solution, facts);
  canvas.setAttribute(
    "aria-label",
    `Parabola y = ${formatStandard(a, b, c)}, opening ${facts.opens}, vertex at (${format(facts.vertex.x)}, ${format(facts.vertex.y)}).`,
  );
  syncUrl();
  draw();
}

function renderSteps(solution, facts) {
  const { a, b, c } = state;
  const list = $("steps");
  list.replaceChildren();
  const step = (...parts) => {
    const li = el("li");
    for (const part of parts) li.append(typeof part === "string" ? document.createTextNode(part) : part);
    list.append(li);
  };
  const code = (text) => el("code", null, text);
  step("Identify the coefficients: ", code(`a = ${format(a)}, b = ${format(b)}, c = ${format(c)}`), ".");
  step("Discriminant: ", code(`Δ = b² − 4ac = (${format(b)})² − 4·(${format(a)})·(${format(c)}) = ${format(solution.discriminant)}`), ".");
  if (solution.kind === "real") {
    step("Δ > 0, so there are two real roots. Stable form: ", code("q = −(b + sign(b)·√Δ) / 2"), ", then ",
      code("x₁ = q / a"), " and ", code("x₂ = c / q"), ".");
    step("Roots: ", code(`x = ${format(solution.roots[0])}`), " and ", code(`x = ${format(solution.roots[1])}`), ".");
  } else if (solution.kind === "repeated") {
    step("Δ = 0, so the root is ", code(`x = −b / 2a = ${format(solution.roots[0])}`), ".");
  } else if (solution.kind === "complex") {
    step("Δ < 0, so the roots are ", code("x = −b/2a ± i·√(−Δ)/2|a|"), " = ",
      code(`${formatComplex(solution.roots[1])}`), " and its conjugate.");
  }
  step("Vertex: ", code(`h = −b/2a = ${format(facts.vertex.x)}`), ", ", code(`k = c − b²/4a = ${format(facts.vertex.y)}`), ".");
  step("Check with Vieta: ", code(`x₁ + x₂ = −b/a = ${format(facts.sum)}`), ", ", code(`x₁·x₂ = c/a = ${format(facts.product)}`), ".");
}

// ---------------------------------------------------------------- graph

function colors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    grid: v("--grid"), gridStrong: v("--grid-strong"), axis: v("--axis"), label: v("--label"),
    accent: v("--accent"), accent2: v("--accent-2"), root: v("--root"), vertex: v("--vertex"),
    shape: v("--shape"), text: v("--text"), bg: v("--bg"),
  };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  state.size = { w: rect.width, h: rect.height };
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

const toPx = (x, y) => {
  const { xMin, xMax, yMin, yMax } = state.view;
  return { x: ((x - xMin) / (xMax - xMin)) * state.size.w, y: state.size.h - ((y - yMin) / (yMax - yMin)) * state.size.h };
};
const toWorld = (px, py) => {
  const { xMin, xMax, yMin, yMax } = state.view;
  return { x: xMin + (px / state.size.w) * (xMax - xMin), y: yMin + ((state.size.h - py) / state.size.h) * (yMax - yMin) };
};

function handles() {
  const { a, b, c } = state;
  const { vertex } = describe(a, b, c);
  const sx = vertex.x + state.shapeOffset;
  return { vertex: toPx(vertex.x, vertex.y), shape: toPx(sx, evaluate(a, b, c, sx)) };
}

function draw() {
  if (!state.view || !state.size.w) return;
  const { w, h } = state.size;
  const col = colors();
  const { a, b, c } = state;
  const { xMin, xMax, yMin, yMax } = state.view;
  ctx.clearRect(0, 0, w, h);

  // Grid: about 8–10 lines per axis whatever the scale.
  const xs = niceStep(xMax - xMin, Math.max(4, w / 90));
  const ys = niceStep(yMax - yMin, Math.max(4, h / 70));
  ctx.lineWidth = 1;
  ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillStyle = col.label;
  const origin = toPx(0, 0);
  const labelY = Math.min(Math.max(origin.y + 14, 14), h - 6);
  const labelX = Math.min(Math.max(origin.x + 6, 6), w - 40);
  for (let x = Math.ceil(xMin / xs) * xs; x <= xMax; x += xs) {
    const p = toPx(x, 0);
    ctx.strokeStyle = col.grid;
    line(p.x, 0, p.x, h);
    if (Math.abs(x) > xs / 2) ctx.fillText(format(x), p.x + 4, labelY);
  }
  for (let y = Math.ceil(yMin / ys) * ys; y <= yMax; y += ys) {
    const p = toPx(0, y);
    ctx.strokeStyle = col.grid;
    line(0, p.y, w, p.y);
    if (Math.abs(y) > ys / 2) ctx.fillText(format(y), labelX, p.y - 4);
  }
  ctx.strokeStyle = col.axis;
  ctx.lineWidth = 1.25;
  if (origin.y >= 0 && origin.y <= h) line(0, origin.y, w, origin.y);
  if (origin.x >= 0 && origin.x <= w) line(origin.x, 0, origin.x, h);

  const facts = describe(a, b, c);

  // Axis of symmetry.
  const axisPx = toPx(facts.axis, 0).x;
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = col.vertex;
  ctx.globalAlpha = 0.35;
  line(axisPx, 0, axisPx, h);
  ctx.restore();

  // Curve with a soft glow.
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, col.accent);
  gradient.addColorStop(1, col.accent2);
  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.shadowColor = col.accent;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  let started = false;
  for (let px = 0; px <= w; px += 1.5) {
    const x = xMin + (px / w) * (xMax - xMin);
    const py = toPx(x, evaluate(a, b, c, x)).y;
    const clamped = Math.max(-h, Math.min(2 * h, py)); // keep huge values from breaking the path
    if (!started) {
      ctx.moveTo(px, clamped);
      started = true;
    } else ctx.lineTo(px, clamped);
  }
  ctx.stroke();
  ctx.restore();

  // Roots and y-intercept.
  const solution = solve(a, b, c);
  if (solution.kind === "real" || solution.kind === "repeated") {
    for (const r of new Set(solution.roots)) dot(toPx(r, 0), 5.5, col.root, col.bg);
  }
  dot(toPx(0, c), 4, col.label, col.bg);

  // Hover readout.
  const readout = $("readout");
  if (state.hover && !state.drag) {
    const world = toWorld(state.hover.x, state.hover.y);
    const y = evaluate(a, b, c, world.x);
    const p = toPx(world.x, y);
    ctx.save();
    ctx.strokeStyle = col.gridStrong;
    ctx.setLineDash([3, 4]);
    line(p.x, 0, p.x, h);
    ctx.restore();
    dot(p, 4, col.text, col.bg);
    readout.textContent = `x ${format(world.x)} · y ${format(y)}`;
    readout.style.left = `${Math.min(p.x, w - 170)}px`;
    readout.style.top = `${Math.max(28, Math.min(p.y, h - 8))}px`;
    readout.classList.add("show");
  } else readout.classList.remove("show");

  // Drag handles.
  const hp = handles();
  ring(hp.shape, col.shape, state.drag === "shape");
  ring(hp.vertex, col.vertex, state.drag === "vertex");
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(p, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function ring(p, color, active) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, active ? 13 : 11, 0, Math.PI * 2);
  ctx.fillStyle = `color-mix(in srgb, ${color} 22%, transparent)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = active ? 18 : 10;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- view animation

let animation = null;
function animateViewTo(target) {
  if (!state.view || reduceMotion.matches) {
    state.view = target;
    draw();
    return;
  }
  const from = { ...state.view };
  const start = performance.now();
  cancelAnimationFrame(animation);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 260);
    const e = 1 - (1 - t) ** 3;
    state.view = Object.fromEntries(Object.keys(target).map((k) => [k, from[k] + (target[k] - from[k]) * e]));
    draw();
    if (t < 1) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
}

function zoom(factor) {
  const { xMin, xMax, yMin, yMax } = state.view;
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  animateViewTo({
    xMin: cx - ((xMax - xMin) / 2) * factor,
    xMax: cx + ((xMax - xMin) / 2) * factor,
    yMin: cy - ((yMax - yMin) / 2) * factor,
    yMax: cy + ((yMax - yMin) / 2) * factor,
  });
}

// ---------------------------------------------------------------- interaction

function pointer(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitHandle(p) {
  const hp = handles();
  if (Math.hypot(p.x - hp.vertex.x, p.y - hp.vertex.y) < 18) return "vertex";
  if (Math.hypot(p.x - hp.shape.x, p.y - hp.shape.y) < 18) return "shape";
  return null;
}

function notice(text) {
  $("notice").textContent = text;
}

function applyDrag(p) {
  const world = toWorld(p.x, p.y);
  const { a, b, c } = state;
  const { vertex } = describe(a, b, c);
  if (state.drag === "vertex") {
    setCoefficients(fromVertex(a, world.x, world.y), { refit: false });
  } else {
    const raw = leadingFromPoint(vertex.y, state.shapeOffset, world.y);
    const { a: next, clamped } = clampLeading(raw, Math.sign(a));
    notice(clamped ? "a is held at ±0.001 here: at a = 0 the curve would become a straight line." : "");
    setCoefficients(fromVertex(next, vertex.x, vertex.y), { refit: false });
  }
}

canvas.addEventListener("pointerdown", (event) => {
  const p = pointer(event);
  state.drag = hitHandle(p);
  if (!state.drag) return;
  state.shapeOffset = Math.max(niceStep(state.view.xMax - state.view.xMin, 8), 1e-6);
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("grabbing");
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  const p = pointer(event);
  if (state.drag) {
    applyDrag(p);
    return;
  }
  state.hover = p;
  canvas.classList.toggle("grab", Boolean(hitHandle(p)));
  draw();
});

function endDrag() {
  if (!state.drag) return;
  state.drag = null;
  canvas.classList.remove("grabbing");
  animateViewTo(fitView(state.a, state.b, state.c));
  draw();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => {
  state.hover = null;
  draw();
});

canvas.addEventListener("keydown", (event) => {
  const { a, b, c } = state;
  const { vertex } = describe(a, b, c);
  const stepX = niceStep(state.view.xMax - state.view.xMin, 40);
  const stepY = niceStep(state.view.yMax - state.view.yMin, 40);
  let next = null;
  if (event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    const factor = event.key === "ArrowUp" ? 1.1 : 1 / 1.1;
    next = fromVertex(a * factor, vertex.x, vertex.y);
  } else if (event.key === "ArrowLeft") next = fromVertex(a, vertex.x - stepX, vertex.y);
  else if (event.key === "ArrowRight") next = fromVertex(a, vertex.x + stepX, vertex.y);
  else if (event.key === "ArrowUp") next = fromVertex(a, vertex.x, vertex.y + stepY);
  else if (event.key === "ArrowDown") next = fromVertex(a, vertex.x, vertex.y - stepY);
  else if (event.key === "f" || event.key === "F") {
    animateViewTo(fitView(a, b, c));
    event.preventDefault();
    return;
  }
  if (next) {
    setCoefficients(next, { refit: false });
    event.preventDefault();
  }
});

for (const input of Object.values(inputs)) {
  input.addEventListener("input", () => {
    const values = readInputs();
    if (values) setCoefficients(values, { updateInputs: false });
    clearPreset();
  });
  input.addEventListener("blur", () => {
    if (readInputs()) inputs[input.name].value = toInput(state[input.name]);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    stepCoefficient(input.name, event.key === "ArrowUp" ? 1 : -1, event.shiftKey ? 10 : 1);
  });
}

function stepCoefficient(name, direction, multiplier = 1) {
  const current = state[name];
  const size = Math.abs(current) >= 10 ? niceStep(Math.abs(current), 10) : current % 1 !== 0 ? 0.1 : 1;
  let value = Number((current + direction * size * multiplier).toPrecision(12));
  if (name === "a" && value === 0) value = direction * size; // step over the forbidden 0
  setCoefficients({ ...state, [name]: value });
  clearPreset();
}

for (const button of document.querySelectorAll(".step")) {
  button.addEventListener("click", () => stepCoefficient(button.closest(".field").dataset.name, Number(button.dataset.step)));
}

function clearPreset() {
  for (const chip of document.querySelectorAll(".chip")) chip.classList.remove("active");
}

for (const chip of document.querySelectorAll("[data-preset]")) {
  chip.addEventListener("click", () => {
    const [a, b, c] = chip.dataset.preset.split(",").map(Number);
    notice("");
    setCoefficients({ a, b, c });
    clearPreset();
    chip.classList.add("active");
  });
}

$("zoom-in").addEventListener("click", () => zoom(0.75));
$("zoom-out").addEventListener("click", () => zoom(1 / 0.75));
$("fit").addEventListener("click", () => animateViewTo(fitView(state.a, state.b, state.c)));

$("copy-link").addEventListener("click", async () => {
  const button = $("copy-link");
  try {
    await navigator.clipboard.writeText(window.location.href);
    button.textContent = "Link copied";
  } catch {
    button.textContent = "Copy the address bar";
  }
  setTimeout(() => (button.textContent = "Copy link"), 1800);
});

// ---------------------------------------------------------------- URL state

let urlTimer = null;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const params = new URLSearchParams({ a: toInput(state.a), b: toInput(state.b), c: toInput(state.c) });
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, 200);
}

function initialCoefficients() {
  const params = new URLSearchParams(location.search);
  const a = parse(params.get("a") ?? "");
  const b = parse(params.get("b") ?? "");
  const c = parse(params.get("c") ?? "");
  if ([a, b, c].every(Number.isFinite) && a !== 0) return { a, b, c };
  return { a: 1, b: -5, c: 6 };
}

// ---------------------------------------------------------------- start

new ResizeObserver(resize).observe(canvas);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
const start = initialCoefficients();
state.view = fitView(start.a, start.b, start.c);
setCoefficients(start, { refit: false });
document.querySelector('[data-preset="1,-5,6"]').classList.toggle("active", start.a === 1 && start.b === -5 && start.c === 6);
