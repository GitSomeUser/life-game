import { deathMarkup } from "./death.mjs";
import {
  choosePath,
  createGame,
  currentSpace,
  deathProbability,
  portraitStats,
  resolveChoice,
  spin,
  triangleRates,
} from "./engine.mjs";

const boardEl = document.querySelector("#board");
const kickerEl = document.querySelector("#kicker");
const titleEl = document.querySelector("#event-title");
const detailEl = document.querySelector("#event-detail");
const choicesEl = document.querySelector("#choices");
const flavorCardEl = document.querySelector("#flavor-card");
const flavorStillEl = document.querySelector("#flavor-still");
const flavorCaptionEl = document.querySelector("#flavor-caption");
const ageEl = document.querySelector("#age");
const cashEl = document.querySelector("#cash");
const savingsEl = document.querySelector("#savings");
const payEl = document.querySelector("#pay");
const expensesEl = document.querySelector("#expenses");
const deathChanceEl = document.querySelector("#death-chance");
const yearsEl = document.querySelector("#years");
const figureEl = document.querySelector("#figure");
const playerEl = document.querySelector("#player-name");
const leverReadout = document.querySelector("#lever-readout");
const minimapEl = document.querySelector("#minimap");
const triangleEl = document.querySelector("#triangle");
const shareSumEl = document.querySelector("#share-sum");
const wedgeNote = document.querySelector("#wedge-note");
const deathEl = document.querySelector("#death");
const deathStage = document.querySelector("#death-stage");
const deathCaption = document.querySelector("#death-caption");
const gameNameInput = document.querySelector("#game-name");
const saveBtn = document.querySelector("#save");
const resumeBtn = document.querySelector("#resume");
const newGameBtn = document.querySelector("#new-game");
const saveNote = document.querySelector("#save-note");
const animEl = document.querySelector("#anim");
const speedEl = document.querySelector("#speed");
const logEl = document.querySelector("#log");
const fineEl = document.querySelector("#fine");
const actBtn = document.querySelector("#act");
const seedInput = document.querySelector("#seed");
const copyBtn = document.querySelector("#copy");
const readout = document.querySelector("#roll-readout");
const wheel = document.querySelector("#wheel");

let spec = null;
let state = null;
let inspect = null;
let cols = 10;
let needleTurns = 0;
let shownSpin = 0;
let locked = false;
let pointLocked = false;

const H = { x: 130, y: 22 };
const W = { x: 230, y: 195.205 };
const F = { x: 30, y: 195.205 };
const CORNERS = {
  health: { h: 1, w: 0, f: 0 },
  work: { h: 0, w: 1, f: 0 },
  frugal: { h: 0, w: 0, f: 1 },
  center: { h: 1 / 3, w: 1 / 3, f: 1 / 3 },
};

const params = new URLSearchParams(location.search);
seedInput.value = params.get("seed") || String(Math.floor(Math.random() * 1_000_000_000));
if (params.get("name")) gameNameInput.value = params.get("name");
if (params.get("anim") === "0") animEl.checked = false;
if (params.get("speed") === "1") speedEl.checked = true;

function pointFromQuery() {
  const corner = params.get("corner");
  if (CORNERS[corner]) return { ...CORNERS[corner] };
  if (params.get("h") != null) {
    return {
      h: Number(params.get("h")),
      w: Number(params.get("w")),
      f: Number(params.get("f")),
    };
  }
  return { ...CORNERS.center };
}

function money(n) {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function choiceLine(space) {
  const prompt = space.choice.prompt;
  const income = triangleRates(spec, state.point).income;
  if (Math.abs(income - 1) < 1e-9) return prompt;
  const yes = space.choice.yes || {};
  const bits = [];
  if (yes.salaryDelta) bits.push(`pay ${money(Math.round(yes.salaryDelta * income))}`);
  if (yes.salarySet != null) bits.push(`pay ${money(Math.round(yes.salarySet * income))}`);
  return bits.length ? `${prompt} At this point: ${bits.join(", ")}.` : prompt;
}

function wedgePath(q) {
  if (q <= 0) return "";
  const a0 = -Math.PI / 2;
  const a1 = a0 + q * Math.PI * 2;
  const r = 96;
  const x0 = 100 + Math.cos(a0) * r;
  const y0 = 100 + Math.sin(a0) * r;
  const x1 = 100 + Math.cos(a1) * r;
  const y1 = 100 + Math.sin(a1) * r;
  if (q < 0.004) {
    return `<line class="wedge" x1="100" y1="100" x2="${x1}" y2="${y1}" stroke="currentColor" stroke-width="2.4"/>`;
  }
  const large = q > 0.5 ? 1 : 0;
  return `<path class="wedge" d="M100 100 L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="currentColor" stroke="none"/>`;
}

function token() {
  return `<svg class="token" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 18h12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function drawWheel(q = 0) {
  const prior = wheel.querySelector(".needle")?.style.transform || "";
  const nums = [];
  const wedge = Math.min(Math.max(q, 0), 1);
  const rest = (1 - wedge) * Math.PI * 2;
  const start = -Math.PI / 2 + wedge * Math.PI * 2;
  for (let n = 1; n <= 10; n += 1) {
    const angle = start + ((n - 0.5) / 10) * rest;
    const x = 100 + Math.cos(angle) * 74;
    const y = 100 + Math.sin(angle) * 74;
    nums.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="11" font-family="Palatino, Georgia, serif">${n}</text>`);
  }
  wheel.innerHTML = `
    <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="1"/>
    <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" stroke-width="1" opacity="0.45"/>
    ${wedgePath(wedge)}
    ${nums.join("")}
    <g class="needle">
      <line x1="100" y1="100" x2="100" y2="28" stroke="currentColor" stroke-width="1.4"/>
      <circle cx="100" cy="100" r="3" fill="currentColor"/>
    </g>`;
  const needle = wheel.querySelector(".needle");
  if (needle && prior) needle.style.transform = prior;
  wheel.dataset.q = String(wedge);
}

function motionOn() {
  if (!animEl.checked || speedEl.checked) return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pointNeedle(roll, death = false) {
  const needle = wheel.querySelector(".needle");
  if (!needle) return;
  const q = Number(wheel.dataset.q) || 0;
  if (!roll && !death) return;
  const base = death ? (q * 360) / 2 : (q * 360) + ((roll - 0.5) / 10) * (1 - q) * 360;
  if (!motionOn()) {
    needle.style.transform = `rotate(${base}deg)`;
    return;
  }
  needleTurns += 2;
  needle.style.transform = `rotate(${needleTurns * 360 + base}deg)`;
}

function resetNeedle() {
  needleTurns = 0;
  shownSpin = 0;
  const needle = wheel.querySelector(".needle");
  if (needle) needle.style.transform = "rotate(0deg)";
}

function seedNumber() {
  const n = Number(seedInput.value);
  if (!Number.isInteger(n) || n < 0) return 1;
  return n >>> 0;
}

function gameName() {
  return gameNameInput.value.trim();
}

function startPath(pathName) {
  if (!gameName()) return;
  const seed = seedNumber();
  state = choosePath(spec, createGame(spec, seed, state.point), pathName);
  pointLocked = true;
  inspect = null;
}

function lastSpin() {
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    if (state.log[i].t === "spin") return state.log[i];
  }
  return null;
}

function logLine(entry) {
  if (entry.t === "decision" && entry.choice === "path") {
    return `${entry.n}. Path ${entry.value} at ${entry.age}. Cash ${money(entry.cash)}.`;
  }
  if (entry.t === "decision") {
    const fate = entry.fate ? `, ${entry.fate}` : "";
    return `${entry.n}. ${entry.title}: ${entry.value}${fate}. Cash ${money(entry.cash)}. Pay ${money(entry.salary)}.`;
  }
  if (entry.t === "spin") {
    const stop = entry.discarded ? `, stop, ${entry.discarded} unused` : "";
    const pay = entry.paydayCash ? `, payday ${money(entry.paydayCash)}` : "";
    return `${entry.n}. Spin ${entry.roll}. ${entry.fromAge} → ${entry.toAge}${stop}${pay}. ${entry.title}. Cash ${money(entry.cash)}.`;
  }
  if (entry.t === "resolve") {
    const name = entry.flavor ? entry.flavor.caption : entry.title;
    return `${entry.n}. ${name}. Cash ${money(entry.cash)}. Pay ${money(entry.salary)}.`;
  }
  if (entry.t === "death") return `${entry.n}. The wedge at ${entry.age}. The life ends on this square.`;
  if (entry.t === "end") return `${entry.n}. ${entry.note} Cash ${money(entry.cash)}.`;
  return `${entry.n}. ${entry.t}`;
}

function spaceButton(space, mode) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `space ${mode}`;
  btn.dataset.id = space.id;
  btn.innerHTML = `<span class="age">${space.age}</span><span class="name">${space.title}</span><i class="mark ${space.tone}"></i>${mode === "now" ? token() : ""}`;
  btn.setAttribute("aria-label", `${space.age} ${space.title}${mode === "now" ? ", you are here" : ""}`);
  if (mode === "now") btn.setAttribute("aria-current", "true");
  btn.addEventListener("click", () => {
    inspect = space;
    renderStory();
  });
  return btn;
}

function renderBoard() {
  const wide = window.innerWidth >= 900;
  cols = wide ? 10 : 5;
  boardEl.replaceChildren();
  const here = state.path ? currentSpace(spec, state) : null;

  const fork = document.createElement("div");
  fork.className = "fork";
  for (const name of ["study", "work"]) {
    const path = spec.paths[name];
    const wrap = document.createElement("section");
    wrap.className = "path";
    if (state.path && state.path !== name) wrap.classList.add("off");
    const label = document.createElement("p");
    label.className = "path-name";
    label.textContent = path.label;
    wrap.append(label);
    if (state.phase === "choose") {
      const begin = document.createElement("button");
      begin.type = "button";
      begin.className = "path-begin";
      begin.textContent = name === "study" ? "Begin study" : "Begin work";
      begin.disabled = !gameName();
      begin.addEventListener("click", () => {
        startPath(name);
        render();
      });
      wrap.append(begin);
    }
    const row = document.createElement("div");
    row.className = "row";
    for (const space of path.spaces) {
      let mode = "future";
      if (here && space.id === here.id) mode = "now";
      else if (state.path === name && here && space.age < here.age) mode = "passed";
      row.append(spaceButton(space, mode));
    }
    wrap.append(row);
    fork.append(wrap);
  }
  boardEl.append(fork);

  const merge = document.createElement("p");
  merge.className = "merge";
  merge.textContent = "From 22 the paths share one track";
  boardEl.append(merge);

  const shared = document.createElement("div");
  shared.className = "shared";
  shared.style.gridTemplateColumns = `repeat(${cols}, 116px)`;
  spec.paths.shared.spaces.forEach((space, i) => {
    const row = Math.floor(i / cols);
    const along = i % cols;
    const col = row % 2 === 0 ? along + 1 : cols - along;
    let mode = "future";
    if (here && space.id === here.id) mode = "now";
    else if (here && here.age >= 22 && space.age < here.age) mode = "passed";
    const btn = spaceButton(space, mode);
    btn.style.gridColumn = String(col);
    btn.style.gridRow = String(row + 1);
    shared.append(btn);
  });
  boardEl.append(shared);
  queueMicrotask(() => {
    boardEl.querySelector(".space.now")?.scrollIntoView({ inline: "center", block: "nearest" });
  });
}

const moodLine = {
  "cute-funny": "Cute, and a little silly.",
  "funny-sad": "Funny, and a little sad.",
  "pg-scary": "A small scare. Nothing cruel.",
  happy: "A happy beat.",
  exciting: "The year picks up.",
};

function flavorSeen(space) {
  if (!space?.flavor) return null;
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    const entry = state.log[i];
    if (entry.spaceId === space.id && entry.flavor) return entry.flavor;
  }
  return null;
}

function showFlavor(card) {
  if (!card) {
    flavorCardEl.hidden = true;
    flavorStillEl.removeAttribute("src");
    flavorCaptionEl.textContent = "";
    return;
  }
  flavorCardEl.hidden = false;
  flavorStillEl.src = card.still;
  flavorStillEl.alt = card.caption;
  flavorCaptionEl.textContent = moodLine[card.mood] || card.mood;
}

function renderStory() {
  const space = inspect || currentSpace(spec, state);
  choicesEl.replaceChildren();
  if (!space) {
    showFlavor(null);
    kickerEl.textContent = "Age 18 · choose";
    titleEl.textContent = "Study, or work.";
    const income = triangleRates(spec, state.point).income;
    const debt = Math.abs(spec.paths.study.spaces[0].cash);
    const studyPay = Math.round(spec.meta.studySalary * income);
    const workPay = Math.round(spec.meta.workSalary * income);
    detailEl.textContent = `Study costs ${money(debt)} now and pays ${money(studyPay)} a year after 21. Work pays ${money(workPay)} from the first job. Same number of years either way.`;
    return;
  }
  const spun = lastSpin();
  const bits = [`Age ${space.age}`];
  if (space.kind === "stop") bits.push("stop");
  if (space.kind === "payday") bits.push("payday");
  if (space.kind === "choice") bits.push("choice");
  if (inspect && (!currentSpace(spec, state) || inspect.id !== currentSpace(spec, state).id)) bits.push("on the board");
  const card = flavorSeen(space);
  showFlavor(card);
  if (card) bits.push(moodLine[card.mood] || card.mood);
  kickerEl.textContent = bits.join(" · ");
  titleEl.textContent = card ? card.caption : space.title;
  const extra = [];
  if (!inspect && spun && spun.spaceId === space.id && spun.paydayCash) {
    extra.push(`Payday on the way: ${money(spun.paydayCash)}.`);
  }
  if (!inspect && spun && spun.spaceId === space.id && spun.discarded) {
    extra.push(`The move stopped here. ${spun.discarded} steps unused.`);
  }
  const here = currentSpace(spec, state);
  if (!inspect && state.phase === "choice" && here?.choice) extra.unshift(choiceLine(here));
  const lead = card ? "" : space.detail;
  detailEl.textContent = [lead, ...extra].filter(Boolean).join(" ");

  if (state.phase === "choice" && here?.choice) {
    for (const [accept, label] of [
      [true, here.choice.yesLabel],
      [false, here.choice.noLabel],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        state = resolveChoice(spec, state, accept);
        inspect = null;
        render();
      });
      choicesEl.append(btn);
    }
  }
}

function deltaMark(kind, delta) {
  const eps = kind === "death" ? 1e-12 : 0.5;
  if (!Number.isFinite(delta) || Math.abs(delta) < eps) return "";
  const plus = delta > 0;
  const good = kind === "income" ? plus : !plus;
  const sign = plus ? "+" : "−";
  const word = `${good ? "good" : "bad"}, ${plus ? "above" : "below"} the center`;
  return `<i class="delta ${good ? "good" : "bad"}" aria-label="${word}">${sign}</i>`;
}

function chanceText(q) {
  return `${(q * 100).toFixed(3)}%`;
}

function renderStats() {
  const space = currentSpace(spec, state);
  const portrait = portraitStats(spec, state);
  const age = space ? space.age : spec.meta.ageStart;
  ageEl.textContent = space ? String(space.age) : "18";
  cashEl.textContent = money(state.cash);
  cashEl.classList.toggle("debt", state.cash < 0);
  cashEl.setAttribute("aria-label", state.cash < 0 ? `debt ${money(state.cash)}` : money(state.cash));
  savingsEl.textContent = money(portrait.savings);
  payEl.innerHTML = `${money(portrait.income)}${deltaMark("income", portrait.incomeDelta)}`;
  expensesEl.innerHTML = `${money(portrait.monthly)}${deltaMark("expense", portrait.expenseDelta)}`;
  deathChanceEl.innerHTML = `${chanceText(portrait.death)}${deltaMark("death", portrait.deathDelta)}`;
  yearsEl.textContent = portrait.years.toFixed(1);
  playerEl.textContent = gameName() || "One player";
  const rates = portrait.rates;
  leverReadout.textContent = `Health ${rates.h.toFixed(2)} · Work ${rates.w.toFixed(2)} · Frugality ${rates.f.toFixed(2)}. Income ×${rates.income.toFixed(2)}. Spend ${(rates.spend * 100).toFixed(0)}%. Mortality ×${rates.mortality.toFixed(2)}.`;
  const q = deathProbability(spec, age, rates.mortality);
  drawWheel(q);
  if (wedgeNote) wedgeNote.textContent = `Death wedge ${chanceText(q)} of the circle.`;
  drawFigure(rates);
  renderDeath();
}

function drawFigure(rates) {
  const lean = ((1 - rates.axis.h) / 2) * 10;
  const sharp = rates.axis.w > 0;
  const cap = sharp ? "miter" : "round";
  const join = sharp ? "miter" : "round";
  const width = sharp ? 1.25 : 1.7;
  const hipX = (40 + lean).toFixed(1);
  const shoulder = sharp ? "M22 42 L40 34 L58 42" : "M24 44 Q40 36 56 44";
  const bag = rates.axis.f < 0
    ? `<path d="M58 50 h10 v14 h-10" fill="none" stroke="currentColor" stroke-width="1.2"/>`
    : "";
  const collar = rates.axis.f <= -0.5
    ? `<path d="M34 36 h12 l-2 6 h-8 z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="miter"/>`
    : "";
  figureEl.innerHTML = `
    <circle cx="40" cy="22" r="12" fill="none" stroke="currentColor" stroke-width="${width}"/>
    <path d="M34 26 h12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="${shoulder}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linejoin="${join}" stroke-linecap="${cap}"/>
    <path d="M40 34 L${hipX} 72" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}"/>
    <path d="M30 46 L${(18 + lean * 0.2).toFixed(1)} 66" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}"/>
    <path d="M50 46 L${(64 + lean * 0.2).toFixed(1)} 64" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}"/>
    <path d="M${hipX} 72 L${(28 + lean).toFixed(1)} 108" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}"/>
    <path d="M${hipX} 72 L${(54 + lean * 0.3).toFixed(1)} 108" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}"/>
    ${bag}${collar}`;
}

function pointXY(point) {
  return {
    x: point.h * H.x + point.w * W.x + point.f * F.x,
    y: point.h * H.y + point.w * W.y + point.f * F.y,
  };
}

function barycentric(px, py) {
  const denom = (W.y - F.y) * (H.x - F.x) + (F.x - W.x) * (H.y - F.y);
  let h = ((W.y - F.y) * (px - F.x) + (F.x - W.x) * (py - F.y)) / denom;
  let w = ((F.y - H.y) * (px - F.x) + (H.x - F.x) * (py - F.y)) / denom;
  let f = 1 - h - w;
  h = Math.max(0, h);
  w = Math.max(0, w);
  f = Math.max(0, f);
  const sum = h + w + f || 1;
  return { h: h / sum, w: w / sum, f: f / sum };
}

function drawTriangle() {
  const lockedNow = pointLocked || Boolean(state?.path);
  triangleEl.classList.toggle("locked", lockedNow);
  const spot = pointXY(state.point);
  triangleEl.innerHTML = `
    <polygon class="face" points="${H.x},${H.y} ${W.x},${W.y} ${F.x},${F.y}"/>
    <text class="vertex-label" x="${H.x}" y="${H.y - 8}" text-anchor="middle">Health</text>
    <text class="vertex-label" x="${F.x}" y="${F.y + 16}" text-anchor="start">Frugality</text>
    <text class="vertex-label" x="${W.x}" y="${W.y + 16}" text-anchor="end">Work</text>
    <circle class="handle" cx="${spot.x}" cy="${spot.y}" r="7"/>`;
}

function setPoint(point) {
  if (pointLocked || state?.path) return;
  state = createGame(spec, seedNumber(), point);
  render();
}

function svgPoint(event) {
  const rect = triangleEl.getBoundingClientRect();
  const vb = triangleEl.viewBox.baseVal;
  return {
    x: ((event.clientX - rect.left) / rect.width) * vb.width,
    y: ((event.clientY - rect.top) / rect.height) * vb.height,
  };
}

function renderDeath() {
  if (!state.death) {
    deathEl.hidden = true;
    deathStage.innerHTML = "";
    return;
  }
  deathEl.hidden = false;
  deathStage.classList.toggle("still", !motionOn());
  deathStage.innerHTML = deathMarkup(state.death.animation);
  deathCaption.textContent = `Age ${state.death.age}. The wedge.`;
}

function miniMark(space, mode) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `mini ${mode}`;
  btn.title = `${space.age} ${space.title}`;
  btn.setAttribute("aria-label", `${space.age} ${space.title}`);
  btn.addEventListener("click", () => {
    inspect = space;
    renderStory();
  });
  return btn;
}

function renderMinimap() {
  minimapEl.replaceChildren();
  const here = state.path ? currentSpace(spec, state) : null;
  const fork = document.createElement("div");
  fork.className = "mini-fork";
  for (const name of ["study", "work"]) {
    const path = document.createElement("div");
    path.className = "mini-path";
    if (state.path && state.path !== name) path.classList.add("off");
    for (const space of spec.paths[name].spaces) {
      let mode = "future";
      if (here && space.id === here.id) mode = "now";
      else if (state.path === name && here && space.age < here.age) mode = "passed";
      path.append(miniMark(space, mode));
    }
    fork.append(path);
  }
  const shared = document.createElement("div");
  shared.className = "mini-shared";
  for (const space of spec.paths.shared.spaces) {
    let mode = "future";
    if (here && space.id === here.id) mode = "now";
    else if (here && here.age >= 22 && space.age < here.age) mode = "passed";
    shared.append(miniMark(space, mode));
  }
  minimapEl.append(fork, shared);
}

function renderShares() {
  const lockedNow = pointLocked || Boolean(state?.path);
  document.querySelector("#setup").classList.toggle("locked", lockedNow);
  const rates = triangleRates(spec, state.point);
  shareSumEl.textContent = `Weights ${rates.h.toFixed(2)} + ${rates.w.toFixed(2)} + ${rates.f.toFixed(2)} = 1.`;
  document.querySelectorAll("[data-corner]").forEach((btn) => {
    btn.disabled = lockedNow;
  });
  drawTriangle();
}

function note(text) {
  saveNote.textContent = text;
}

function saveGame() {
  const name = gameName();
  if (!name) {
    note("Name the game first.");
    return;
  }
  localStorage.setItem(`life-game:${name}`, JSON.stringify({
    name,
    player: name,
    version: spec.meta.version,
    state,
    animation: animEl.checked,
    speedRun: speedEl.checked,
  }));
  note(`Saved ${name}.`);
}

function resumeGame() {
  const name = gameName();
  if (!name) {
    note("Name the game first.");
    return;
  }
  const raw = localStorage.getItem(`life-game:${name}`);
  if (!raw) {
    note("No save under that name.");
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    note("That save could not be read.");
    return;
  }
  if (!data?.state || data.version !== spec.meta.version) {
    note("That save is from another version.");
    return;
  }
  state = data.state;
  animEl.checked = Boolean(data.animation);
  speedEl.checked = Boolean(data.speedRun);
  pointLocked = Boolean(state.path);
  seedInput.value = String(state.seed);
  inspect = null;
  resetNeedle();
  note(`Resumed ${name}.`);
  render();
}

function newGame() {
  if (!spec) return;
  pointLocked = false;
  inspect = null;
  resetNeedle();
  state = createGame(spec, seedNumber(), state?.point);
  note("The point is open.");
  render();
}

function renderLog() {
  logEl.replaceChildren();
  if (!state.log.length) {
    const li = document.createElement("li");
    li.textContent = "No decisions yet. The seed is fixed once you begin.";
    logEl.append(li);
    return;
  }
  for (const entry of state.log) {
    const li = document.createElement("li");
    li.textContent = logLine(entry);
    logEl.append(li);
  }
  logEl.lastElementChild?.scrollIntoView({ block: "nearest" });
}

function renderControls() {
  seedInput.readOnly = state.phase !== "choose";
  const spun = lastSpin();
  if (state.phase === "choose") {
    actBtn.textContent = "Spin";
    actBtn.disabled = true;
    readout.textContent = gameName()
      ? "Choose a path. The wedge is already on the wheel."
      : "Name the game, drag the point, then choose a path.";
  } else if (state.phase === "choice") {
    actBtn.textContent = "Spin";
    actBtn.disabled = true;
    readout.textContent = "A choice is waiting.";
  } else if (state.phase === "ended") {
    actBtn.textContent = "New life";
    actBtn.disabled = locked;
    readout.textContent = state.death
      ? `The wedge at ${state.death.age}. The life ends on this square.`
      : `Working life ends at 68 with ${money(state.cash)}.`;
  } else {
    actBtn.textContent = "Spin";
    actBtn.disabled = locked;
    readout.textContent = spun ? `Last spin ${spun.roll}.` : "Spin when you are ready.";
  }
  if (state.death && shownSpin !== -1) {
    shownSpin = -1;
    pointNeedle(0, true);
  } else if (spun && spun.n !== shownSpin) {
    shownSpin = spun.n;
    pointNeedle(spun.roll);
  }
}

function render() {
  renderShares();
  renderStats();
  renderMinimap();
  renderStory();
  renderBoard();
  renderLog();
  renderControls();
}

function takeTurn() {
  if (locked) return;
  if (state.phase === "ended") {
    const point = state.point;
    state = createGame(spec, seedNumber(), point);
    pointLocked = true;
    inspect = null;
    resetNeedle();
    render();
    return;
  }
  if (state.phase !== "play") return;
  inspect = null;
  state = spin(spec, state);
  if (speedEl.checked) {
    let guard = 0;
    while (state.phase === "play" && guard++ < 80) state = spin(spec, state);
  }
  locked = motionOn();
  render();
  if (locked) {
    setTimeout(() => {
      locked = false;
      renderControls();
    }, 720);
  }
}

actBtn.addEventListener("click", takeTurn);

copyBtn.addEventListener("click", async () => {
  const text = [`game ${gameName() || "unnamed"}`, leverReadout.textContent, `seed ${state.seed}`, ...state.log.map(logLine)].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied";
  } catch {
    copyBtn.textContent = "Select the log";
  }
  setTimeout(() => {
    copyBtn.textContent = "Copy log";
  }, 1200);
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  if (event.code !== "Space" && event.code !== "Enter") return;
  if (state.phase !== "play") return;
  event.preventDefault();
  takeTurn();
});

document.querySelectorAll("[data-corner]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!spec) return;
    setPoint(CORNERS[btn.dataset.corner]);
  });
});

triangleEl.addEventListener("pointerdown", (event) => {
  if (!spec || pointLocked || state?.path) return;
  triangleEl.setPointerCapture(event.pointerId);
  const place = (ev) => {
    const spot = svgPoint(ev);
    state = { ...state, point: barycentric(spot.x, spot.y) };
    render();
  };
  place(event);
  const move = (ev) => place(ev);
  const up = () => {
    triangleEl.removeEventListener("pointermove", move);
    triangleEl.removeEventListener("pointerup", up);
  };
  triangleEl.addEventListener("pointermove", move);
  triangleEl.addEventListener("pointerup", up);
});

gameNameInput.addEventListener("input", () => {
  if (!spec || !state) return;
  if (pointLocked || state?.path) {
    playerEl.textContent = gameName() || "One player";
    return;
  }
  render();
});

saveBtn.addEventListener("click", saveGame);
resumeBtn.addEventListener("click", resumeGame);
newGameBtn.addEventListener("click", newGame);
animEl.addEventListener("change", () => renderControls());
speedEl.addEventListener("change", () => renderControls());

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderBoard, 150);
});

drawWheel(0);

const specRes = await fetch("./spec/accumulation.json");
if (!specRes.ok) {
  titleEl.textContent = "The board did not load.";
  detailEl.textContent = "Start a local server from this folder, then open the page. file:// cannot read the spec.";
} else {
  spec = await specRes.json();
  fineEl.textContent = `${spec.meta.rules.join(" ")} Amounts, the triangle, and both mortality series live in the board spec. One player. Stats are public.`;
  state = createGame(spec, seedNumber(), pointFromQuery());
  const preset = params.get("path");
  if ((preset === "study" || preset === "work") && gameName()) startPath(preset);
  render();
}
