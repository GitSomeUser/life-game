import { deathMarkup } from "./death.mjs";
import {
  choosePath,
  createGame,
  currentSpace,
  deathProbability,
  isEntirety,
  portraitStats,
  resolveChoice,
  spin,
  track,
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
const modeNote = document.querySelector("#mode-note");
const retirementEl = document.querySelector("#retirement");
const titleHeading = document.querySelector("#title");
const dekEl = document.querySelector("#dek");
const payLabel = document.querySelector("#pay-label");
const cashLabel = document.querySelector("#cash-label");
const setupLead = document.querySelector("#setup-lead");
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
let playerSlot = 0;
let audioCtx = null;
let climbShift = null;
let climbSize = "";

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

function mintSeed() {
  const time = Date.now() >>> 0;
  const noise = Math.floor(Math.random() * 4294967296) >>> 0;
  return (Math.imul(time ^ 0x9e3779b1, 0x85ebca6b) ^ noise) >>> 0 || 1;
}

seedInput.value = params.get("seed") ?? String(mintSeed());
if (params.get("name")) gameNameInput.value = params.get("name");
if (params.get("anim") === "0") animEl.checked = false;
if (params.get("speed") === "1") speedEl.checked = true;

function modeFromQuery() {
  const alias = { novice: "life", beginner: "lifespan", advanced: "entirety" };
  const mode = alias[params.get("mode")] || params.get("mode");
  if (mode === "life" || mode === "lifespan" || mode === "entirety") return mode;
  return null;
}

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
  const income = isEntirety(state) ? triangleRates(spec, state.point).income : 1;
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

function savedName() {
  const typed = gameName();
  const seed = String(state?.seed ?? seedNumber());
  if (!typed) return "";
  return typed.endsWith(`-${seed}`) ? typed : `${typed}-${seed}`;
}

function startPath(pathName) {
  if (!gameName() || !state?.mode) return;
  const seed = seedNumber();
  state = choosePath(spec, createGame(spec, seed, state.point, state.mode), pathName);
  pointLocked = true;
  inspect = null;
  playBeat("land");
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

function climbPoints(width) {
  const pad = 78;
  const usable = Math.max(220, width - pad * 2);
  const per = 6;
  const points = [];
  spec.paths.study.spaces.forEach((space, i) => {
    points.push({ space, lane: "study", x: pad + usable * 0.16, row: i });
  });
  spec.paths.work.spaces.forEach((space, i) => {
    points.push({ space, lane: "work", x: pad + usable * 0.84, row: i });
  });
  spec.paths.shared.spaces.forEach((space, i) => {
    const band = Math.floor(i / per);
    const along = i % per;
    const dir = band % 2 === 0 ? along : per - 1 - along;
    points.push({
      space,
      lane: "shared",
      x: pad + (dir / (per - 1)) * usable,
      row: 4 + band,
    });
  });
  const rowH = 72;
  const maxRow = Math.max(...points.map((point) => point.row));
  points.forEach((point) => {
    point.y = (maxRow - point.row) * rowH + 48;
  });
  return { points, height: maxRow * rowH + 140, width };
}

function routePath(points, lane) {
  const rows = points.filter((point) => point.lane === lane).sort((a, b) => a.space.age - b.space.age);
  return rows.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function renderBoard() {
  const here = state.path ? currentSpace(spec, state) : null;
  const viewW = Math.max(boardEl.clientWidth || 0, boardEl.parentElement?.clientWidth || 0, 360);
  const viewH = Math.max(boardEl.clientHeight || 0, boardEl.parentElement?.clientHeight || 0, 280);
  climbSize = `${viewW}x${viewH}`;
  const layout = climbPoints(viewW);
  const anchor = here
    ? layout.points.find((point) => point.space.id === here.id)
    : layout.points.find((point) => point.lane === "work" && point.space.age === 18);
  const shift = (viewH - 108) - (anchor?.y || 0);
  const snap = !motionOn();

  const view = document.createElement("div");
  view.className = snap ? "climb-view snap" : "climb-view";
  const track = document.createElement("div");
  track.className = "climb-track";
  track.style.height = `${layout.height}px`;
  const face = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  face.setAttribute("class", "climb-mountain");
  face.setAttribute("viewBox", `0 0 ${viewW} ${layout.height}`);
  face.setAttribute("width", String(viewW));
  face.setAttribute("height", String(layout.height));
  face.innerHTML = `<polygon class="face" points="0,${layout.height} ${Math.round(viewW * 0.08)},${layout.height} ${Math.round(viewW * 0.9)},28 ${viewW},28 ${viewW},${layout.height}"/>`;
  const route = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  route.setAttribute("class", "climb-route");
  route.setAttribute("viewBox", `0 0 ${viewW} ${layout.height}`);
  route.setAttribute("width", String(viewW));
  route.setAttribute("height", String(layout.height));
  const studyOff = state.path && state.path !== "study" ? " off" : "";
  const workOff = state.path && state.path !== "work" ? " off" : "";
  const studyPts = routePath(layout.points, "study");
  const workPts = routePath(layout.points, "work");
  const sharedPts = routePath(layout.points, "shared");
  const joinStudy = layout.points.find((point) => point.lane === "study" && point.space.age === 21);
  const joinWork = layout.points.find((point) => point.lane === "work" && point.space.age === 21);
  const merge = layout.points.find((point) => point.lane === "shared");
  const join = (from) => from && merge ? ` M${from.x.toFixed(1)},${from.y.toFixed(1)} L${merge.x.toFixed(1)},${merge.y.toFixed(1)}` : "";
  route.innerHTML = `<path class="${studyOff.trim()}" d="M${studyPts.replace(/ /g, " L")}${join(joinStudy)}"/><path class="${workOff.trim()}" d="M${workPts.replace(/ /g, " L")}${join(joinWork)}"/><path d="M${sharedPts.replace(/ /g, " L")}"/>`;
  track.append(face, route);

  for (const point of layout.points) {
    let mode = "future";
    if (here && point.space.id === here.id) mode = "now";
    else if (state.path && point.lane === state.path && here && point.space.age < here.age) mode = "passed";
    else if (state.path === "study" || state.path === "work") {
      if (point.lane !== "shared" && point.lane !== state.path) mode = "off";
      else if (point.lane === "shared" && here && point.space.age < here.age) mode = "passed";
    }
    const btn = spaceButton(point.space, mode === "off" ? "future" : mode);
    if (mode === "off") btn.classList.add("off");
    btn.style.left = `${point.x}px`;
    btn.style.top = `${point.y}px`;
    if (state.phase === "choose" && point.space.age === 18 && (point.lane === "study" || point.lane === "work")) {
      const tag = document.createElement("span");
      tag.className = "begin-tag";
      tag.textContent = point.lane === "study" ? "Begin study" : "Begin work";
      btn.append(tag);
      btn.disabled = !gameName() || !state.mode;
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!gameName() || !state.mode) return;
        startPath(point.lane);
        render();
      });
    }
    track.append(btn);
  }

  const walker = document.createElement("div");
  walker.className = "climb-walker";
  walker.innerHTML = `<svg viewBox="0 0 64 72" aria-hidden="true"><circle cx="30" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M30 18 L26 36 L14 62 M26 36 L40 58 M22 28 L44 34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  view.append(track, walker);
  boardEl.className = "climb";
  boardEl.replaceChildren(view);
  const apply = () => {
    track.style.transform = `translateY(${shift}px)`;
  };
  if (!snap && climbShift != null && climbShift !== shift) {
    track.style.transition = "none";
    track.style.transform = `translateY(${climbShift}px)`;
    requestAnimationFrame(() => {
      track.style.transition = "";
      apply();
    });
  } else {
    apply();
  }
  climbShift = shift;
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
    kickerEl.textContent = state.mode ? "Age 18 · choose" : "Pick a mode";
    titleEl.textContent = state.mode ? "Study, or work." : "Life, Life$pan, or Entirety.";
    const income = isEntirety(state) ? triangleRates(spec, state.point).income : 1;
    const debt = Math.abs(spec.paths.study.spaces[0].cash);
    const studyPay = Math.round(spec.meta.studySalary * income);
    const workPay = Math.round(spec.meta.workSalary * income);
    detailEl.textContent = state.mode
      ? `Study costs ${money(debt)} now and pays ${money(studyPay)} a year after 21. Work pays ${money(workPay)} from the first job. Same number of years either way.`
      : "Life is the traditional game. Life$pan is the entire life. Entirety keeps the triangle and the death wedge. Retirement is not built yet.";
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

function applyModeChrome() {
  const mode = state?.mode || "";
  document.body.classList.toggle("mode-unset", !mode);
  document.body.classList.toggle("mode-plain", mode === "life" || mode === "lifespan");
  document.body.classList.toggle("mode-entirety", mode === "entirety");
  document.body.classList.toggle("path-on", Boolean(state?.path));
  const title = mode === "lifespan" ? "Life$pan" : mode === "entirety" ? "Entirety" : "Life";
  document.title = title;
  titleHeading.textContent = title;
  if (!mode) dekEl.textContent = "Pick Life, Life$pan, or Entirety.";
  else if (mode === "lifespan") dekEl.textContent = "The entire life, ages 18–68.";
  else if (mode === "entirety") dekEl.textContent = "The entire life with realism, ages 18–68.";
  else dekEl.textContent = "A working life, ages 18–68.";
  retirementEl.hidden = mode !== "lifespan";
  payLabel.textContent = mode === "entirety" ? "Income" : "Pay";
  cashLabel.textContent = mode === "entirety" ? "Savings" : "Cash";
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    btn.disabled = Boolean(state.path);
  });
  const notes = {
    "": "",
    life: "Traditional Game of Life. Age, cash, and pay. The spinner is 1 through 10.",
    lifespan: "",
    entirety: "Triangle during setup. Both mortality tables, the walker, income, expenses, and savings.",
  };
  modeNote.textContent = notes[mode] || "";
  if (!state.path) {
    if (mode === "entirety") {
      setupLead.textContent = "Drag the point. The triangle hides when Study or Work begins.";
    } else if (mode === "life" || mode === "lifespan") {
      setupLead.textContent = "You can still flip the mode. It locks when Study or Work begins.";
    } else {
      setupLead.textContent = "Pick Life, Life$pan, or Entirety.";
    }
  }
  const roster = playerRoster();
  const slot = roster[playerSlot] || roster[0];
  playerEl.textContent = slot.name;
  const countEl = document.querySelector("#player-count");
  if (countEl) countEl.textContent = `${playerSlot + 1} of ${roster.length}`;
}

function playerRoster() {
  return [{ name: gameName() || "One player" }];
}

function cyclePlayer(dir) {
  const roster = playerRoster();
  playerSlot = (playerSlot + dir + roster.length) % roster.length;
  applyModeChrome();
}

function playBeat(kind = "land") {
  if (speedEl.checked || !animEl.checked) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = audioCtx || new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  const notes = kind === "death" ? [294, 220] : [196, 247, 294];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const start = t + i * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

function renderStats() {
  applyModeChrome();
  const space = currentSpace(spec, state);
  const age = space ? space.age : spec.meta.ageStart;
  ageEl.textContent = space ? String(space.age) : "18";
  if (!isEntirety(state)) {
    savingsEl.textContent = money(state.cash);
    savingsEl.className = "";
    payEl.className = "";
    payEl.textContent = money(state.salary);
    drawWheel(0);
    if (wedgeNote) wedgeNote.textContent = state.mode ? "Spinner 1 through 10." : "";
    figureEl.innerHTML = "";
    renderDeath();
    return;
  }
  const portrait = portraitStats(spec, state);
  savingsEl.textContent = money(state.cash);
  savingsEl.className = state.cash < 0 ? "bad" : "good";
  payEl.className = portrait.income < 0 ? "bad" : "good";
  payEl.innerHTML = `${money(portrait.income)}${deltaMark("income", portrait.incomeDelta)}`;
  const borrowNote = portrait.borrowing > 0 ? `<span class="borrow-note">includes 4% borrowing</span>` : "";
  expensesEl.className = "bad";
  expensesEl.innerHTML = `${money(portrait.annual)}${deltaMark("expense", portrait.expenseDelta)}${borrowNote}`;
  deathChanceEl.innerHTML = `${chanceText(portrait.death)}${deltaMark("death", portrait.deathDelta)}<span class="qx-gap">${spec.mortality.life.name} ${chanceText(portrait.qLife)} · ${spec.mortality.annuity.name} ${chanceText(portrait.qAnn)}</span>`;
  yearsEl.textContent = portrait.years.toFixed(1);
  const rates = portrait.rates;
  leverReadout.textContent = `Health ${rates.h.toFixed(2)} · Work ${rates.w.toFixed(2)} · Frugality ${rates.f.toFixed(2)}. Income ×${rates.income.toFixed(2)}. Spend ${(rates.spend * 100).toFixed(0)}%.`;
  const q = deathProbability(spec, age, rates.axis.h);
  drawWheel(q);
  if (wedgeNote) wedgeNote.textContent = `Death wedge ${chanceText(q)} of the circle.`;
  drawFigure(rates);
  renderDeath();
}

function drawFigure(rates) {
  const slouch = (1 - rates.axis.h) / 2;
  const focus = (rates.axis.w + 1) / 2;
  const spend = Math.max(0, -rates.axis.f);
  const mix = (upright, slumped) => +(upright + (slumped - upright) * slouch).toFixed(1);
  const headX = mix(102, 126);
  const headY = mix(24, 46);
  const hipX = mix(90, 76);
  const hipY = mix(74, 88);
  const bowX = mix(94, 132);
  const bowY = mix(50, 72);
  const shoulderX = mix(98, 116);
  const shoulderY = mix(46, 60);
  const backHandX = mix(66, 50);
  const backHandY = mix(64, 76);
  const handX = mix(122, 136);
  const handY = mix(60, 80);
  const backKneeX = mix(72, 58);
  const backKneeY = mix(96, 100);
  const backFootX = mix(56, 46);
  const backFootY = mix(116, 114);
  const kneeX = mix(112, 122);
  const kneeY = mix(96, 102);
  const frontFootX = mix(128, 138);
  const frontFootY = mix(116, 110);
  const width = (2.8 - 1.55 * focus).toFixed(2);
  const opacity = (0.4 + 0.6 * focus).toFixed(2);
  const dash = focus < 0.5 ? 'stroke-dasharray="2.2 2.6"' : "";
  const join = focus >= 0.5 ? "miter" : "round";
  const cap = focus >= 0.5 ? "butt" : "round";
  const bag = spend > 0.05
    ? `<path d="M${shoulderX} ${shoulderY} L${(hipX - 16).toFixed(1)} ${(hipY - 4).toFixed(1)}"/><rect x="${(hipX - 22).toFixed(1)}" y="${(hipY - 8).toFixed(1)}" width="14" height="16"/>`
    : "";
  const shoes = spend > 0.3
    ? `<path d="M${(backFootX - 9).toFixed(1)} ${backFootY} h15 M${(frontFootX - 6).toFixed(1)} ${frontFootY} h16"/>`
    : "";
  const bracelet = spend > 0.55
    ? `<circle cx="${handX}" cy="${handY}" r="3.4"/>`
    : "";
  const neckX = (headX + 4).toFixed(1);
  const neckY = (headY + 18).toFixed(1);
  const necklace = spend > 0.8
    ? `<path d="M${(headX - 6).toFixed(1)} ${(headY + 8).toFixed(1)} Q${neckX} ${(headY + 22).toFixed(1)} ${(headX + 12).toFixed(1)} ${(headY + 8).toFixed(1)}"/><circle cx="${neckX}" cy="${neckY}" r="2.4"/>`
    : "";
  figureEl.innerHTML = `
    <g fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${opacity}" ${dash}>
      <circle cx="${headX}" cy="${headY}" r="11"/>
      <path d="M${(headX + 3).toFixed(1)} ${(headY + 2).toFixed(1)} h7"/>
      <path d="M${headX} ${(headY + 11).toFixed(1)} Q${bowX} ${bowY} ${hipX} ${hipY}"/>
      <path d="M${shoulderX} ${shoulderY} L${backHandX} ${backHandY}"/>
      <path d="M${shoulderX} ${shoulderY} L${handX} ${handY}"/>
      <path d="M${hipX} ${hipY} L${backKneeX} ${backKneeY} L${backFootX} ${backFootY}"/>
      <path d="M${hipX} ${hipY} L${kneeX} ${kneeY} L${frontFootX} ${frontFootY}"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      ${bag}${shoes}${bracelet}${necklace}
    </g>`;
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
  if (pointLocked || state?.path || !isEntirety(state)) return;
  state = createGame(spec, seedNumber(), point, state.mode);
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
  const spaces = state.path ? track(spec, state.path) : track(spec, "work");
  const col = document.createElement("div");
  col.className = "mini-climb";
  for (const space of spaces) {
    let mode = "future";
    if (here && space.id === here.id) mode = "now";
    else if (here && space.age < here.age) mode = "passed";
    col.append(miniMark(space, mode));
  }
  minimapEl.append(col);
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
  const typed = gameName();
  if (!typed) {
    note("Name the game first.");
    return;
  }
  const name = savedName();
  localStorage.setItem(`life-game:${name}`, JSON.stringify({
    name,
    player: typed,
    version: spec.meta.version,
    state,
    animation: animEl.checked,
    speedRun: speedEl.checked,
  }));
  note(`Saved ${name}. Resume that full name.`);
}

function resumeGame() {
  const typed = gameName();
  if (!typed) {
    note("Name the game first.");
    return;
  }
  const names = [typed];
  const full = savedName();
  if (full && full !== typed) names.push(full);
  let raw = null;
  let name = typed;
  for (const candidate of names) {
    raw = localStorage.getItem(`life-game:${candidate}`);
    if (raw) {
      name = candidate;
      break;
    }
  }
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
  gameNameInput.value = name;
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
  seedInput.value = String(mintSeed());
  state = createGame(spec, seedNumber(), { ...CORNERS.center }, null);
  note("Pick a mode.");
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
    if (!state.mode) readout.textContent = "Pick a mode, then name the game.";
    else if (!isEntirety(state)) {
      readout.textContent = gameName()
        ? "Choose a path. The spinner is 1 through 10."
        : "Name the game, then choose a path.";
    } else {
      readout.textContent = gameName()
        ? "Choose a path. The wedge is already on the wheel."
        : "Name the game, drag the point, then choose a path.";
    }
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
    state = createGame(spec, seedNumber(), { ...CORNERS.center }, null);
    pointLocked = false;
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
  if (!speedEl.checked) playBeat(state.death ? "death" : "land");
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

document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!spec || state?.path) return;
    state = createGame(spec, seedNumber(), isEntirety({ mode: btn.dataset.mode }) ? state.point : { ...CORNERS.center }, btn.dataset.mode);
    note("");
    render();
  });
});

triangleEl.addEventListener("pointerdown", (event) => {
  if (!spec || pointLocked || state?.path || !isEntirety(state)) return;
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

document.querySelector("#player-prev").addEventListener("click", () => cyclePlayer(-1));
document.querySelector("#player-next").addEventListener("click", () => cyclePlayer(1));
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

new ResizeObserver(() => {
  if (!spec || !state) return;
  const viewW = boardEl.clientWidth || boardEl.parentElement?.clientWidth || 0;
  const viewH = boardEl.clientHeight || boardEl.parentElement?.clientHeight || 0;
  const key = `${viewW}x${viewH}`;
  if (!viewH || key === climbSize) return;
  renderBoard();
}).observe(boardEl);

drawWheel(0);

const specRes = await fetch("./spec/accumulation.json");
if (!specRes.ok) {
  titleEl.textContent = "The board did not load.";
  detailEl.textContent = "Start a local server from this folder, then open the page. file:// cannot read the spec.";
} else {
  spec = await specRes.json();
  fineEl.textContent = `${spec.meta.rules.join(" ")} Amounts, the triangle, and both mortality series live in the board spec. One player. Stats are public.`;
  state = createGame(spec, seedNumber(), pointFromQuery(), modeFromQuery());
  const preset = params.get("path");
  if ((preset === "study" || preset === "work") && gameName() && state.mode) startPath(preset);
  render();
}
