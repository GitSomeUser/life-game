import { deathMarkup } from "./death.mjs";
import {
  choiceCost,
  choiceFail,
  choiceRaise,
  choosePath,
  createGame,
  freshSeed,
  openingFigures,
  currentSpace,
  deathProbability,
  gutCheckOdds,
  isEntirety,
  isYearMode,
  portraitStats,
  resolveChoice,
  spin,
  spinPay,
  track,
  triangleRates,
} from "./engine.mjs";

const boardEl = document.querySelector("#board");
const kickerEl = document.querySelector("#kicker");
const titleEl = document.querySelector("#event-title");
const detailEl = document.querySelector("#event-detail");
const reviewCardEl = document.querySelector("#review-card");
const reviewOddsEl = document.querySelector("#review-odds");
const reviewResultEl = document.querySelector("#review-result");
const reviewRuleEl = document.querySelector("#review-rule");
const ageLabelEl = document.querySelector("#age-label");
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
const copyBtn = document.querySelector("#copy");
const resumeOpenBtn = document.querySelector("#resume-open");
const readout = document.querySelector("#roll-readout");
const wheel = document.querySelector("#wheel");
const runnerEl = document.querySelector("#runner");
const sceneEl = document.querySelector("#scene");

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
let bank = { shown: null, flash: 0, drop: false };
let sceneTimer = 0;

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
let seedNonce = 1;
let heldSeed = 0;

function mintSeed() {
  const next = freshSeed(Date.now(), seedNonce, state?.seed || heldSeed || 0);
  seedNonce = (seedNonce + 1) >>> 0;
  heldSeed = next;
  return next;
}

function openingSeed() {
  const raw = params.get("seed");
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n >>> 0;
  }
  return mintSeed();
}

if (params.get("name")) gameNameInput.value = params.get("name");
if (params.get("anim") === "0") animEl.checked = false;
if (params.get("speed") === "1") speedEl.checked = true;

function modeFromQuery() {
  const alias = { novice: "life", beginner: "lifespan", advanced: "lifespan-plus", entirety: "lifespan-plus" };
  const mode = alias[params.get("mode")] || params.get("mode");
  if (mode === "life" || mode === "lifespan" || mode === "lifespan-plus") return mode;
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
  const sign = n < 0 ? "\u2212" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function choiceLine(space) {
  const offer = state.investOffer && state.investOffer.spaceId === space.id ? state.investOffer : null;
  if (offer) {
    const pct = Math.round(offer.p * 100);
    return `Put ${money(offer.stake)} in? ${pct}% chance it doubles. Otherwise you lose it.`;
  }
  const yes = space.choice.yes || {};
  const cost = choiceCost(spec, yes, state.mode);
  const fail = choiceFail(spec, space.choice.fate, state.mode);
  const raise = choiceRaise(spec, yes, state.mode);
  if (space.id === "course") {
    return `Pay ${money(Math.abs(cost))} for an online course that raises your pay by ${money(raise)}?`;
  }
  if (space.id === "move") {
    return `Pay ${money(Math.abs(cost))} against the card balance now? Otherwise it keeps stacking.`;
  }
  if (space.id === "quiet-56") {
    return `Pay ${money(Math.abs(cost))} for the operation now? Wait, and a 1-in-2 emergency costs ${money(Math.abs(fail))}.`;
  }
  const prompt = state.mode === "life" && space.choice.lifePrompt ? space.choice.lifePrompt : space.choice.prompt;
  const income = isEntirety(state) ? triangleRates(spec, state.point).income : 1;
  if (Math.abs(income - 1) < 1e-9) return prompt;
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

function gameName() {
  return gameNameInput.value.trim();
}

function startPath(pathName) {
  if (!state?.mode || state.path) return;
  stopMotion();
  state = choosePath(spec, createGame(spec, state.seed, state.point, state.mode), pathName);
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

function movePay(spun = lastSpin()) {
  if (!spun) return null;
  const index = state.log.lastIndexOf(spun);
  const follow = index >= 0 ? state.log[index + 1] : null;
  const landed = follow && (follow.t === "resolve" || follow.t === "decision") ? follow : null;
  return {
    count: spun.paydayAges?.length || 0,
    cash: spun.paydayCash || 0,
    salaryDelta: landed?.salaryDelta || 0,
    cashDelta: landed?.t === "resolve" ? landed.cashDelta || 0 : 0,
  };
}

function logLine(entry) {
  if (entry.t === "pay") {
    return `${entry.n}. Pay spin ${entry.roll}. Each Payday pays ${money(entry.salary)}.`;
  }
  if (entry.t === "decision" && entry.choice === "path") {
    const where = state?.mode === "life" ? entry.title : `at ${entry.age}`;
    return `${entry.n}. Path ${entry.value} ${where}. Savings ${money(entry.cash)}.`;
  }
  if (entry.t === "decision") {
    const fate = entry.fate ? `, ${entry.fate}` : "";
    const odds = entry.chance != null ? `, ${Math.round(entry.chance * 100)}%` : "";
    return `${entry.n}. ${entry.title}: ${entry.value}${odds}${fate}. Savings ${money(entry.cash)}. Pay ${money(entry.salary)}.`;
  }
  if (entry.t === "spin") {
    const stop = entry.discarded ? `, stop, ${entry.discarded} unused` : "";
    const reviewed = entry.gutChecks?.length ? `, gut check ${entry.gutChecks.map((item) => item.id).join(", ")}` : "";
    if (state?.mode === "life") {
      const count = entry.paydayAges?.length || 0;
      const pay = count
        ? `, ${count} ${count === 1 ? "Payday" : "Paydays"} passed or landed, collected ${money(entry.paydayCash)}`
        : ", no Payday";
      return `${entry.n}. Spin ${entry.roll}. ${entry.title}${stop}${pay}. Savings ${money(entry.cash)}. Annual pay ${money(entry.salary)}.`;
    }
    const year = entry.yearPay || entry.yearBill
      ? `, paid ${money(entry.yearPay)}, expenses ${money(entry.yearBill)}`
      : "";
    const word = entry.moved === 1 ? "year" : "years";
    const passed = Number.isFinite(entry.moved) ? `, ${entry.moved} ${word} passed` : "";
    return `${entry.n}. Spin ${entry.roll}. ${entry.fromAge} \u2192 ${entry.toAge}${passed}${stop}${reviewed}${year}. Savings ${money(entry.cash)}.`;
  }
  if (entry.t === "resolve") {
    const name = entry.flavor ? entry.flavor.caption : entry.title;
    return `${entry.n}. ${name}. Savings ${money(entry.cash)}. Pay ${money(entry.salary)}.`;
  }
  if (entry.t === "death") return `${entry.n}. The wedge at ${entry.age}. The life ends on this square.`;
  if (entry.t === "end") return `${entry.n}. ${entry.note} Savings ${money(entry.cash)}.`;
  return `${entry.n}. ${entry.t}`;
}

function spaceMark(space) {
  if (state?.mode === "life") return "";
  return String(space.age);
}

function spaceName(space) {
  if (isYearMode(state) && space.kind === "payday") return spec.meta.gutCheck.title;
  return space.title;
}

function spaceButton(space, mode) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `space ${mode}`;
  btn.dataset.id = space.id;
  const name = spaceName(space);
  const mark = spaceMark(space);
  btn.innerHTML = `${mark ? `<span class="age">${mark}</span>` : ""}<span class="name">${name}</span><i class="mark ${space.tone}"></i>${mode === "now" ? token() : ""}`;
  btn.setAttribute("aria-label", `${mark ? `${mark} ` : ""}${name}${mode === "now" ? ", you are here" : ""}`);
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
    if (point.space.age === 18 && (point.lane === "study" || point.lane === "work")) {
      btn.classList.add("choice-space");
      const name = btn.querySelector(".name");
      const waiting = state.phase === "choose" && !state.path;
      if (waiting) {
        btn.classList.add("pending");
        const alt = point.lane === "work";
        if (alt) btn.classList.add("alt");
        name?.classList.add("vibrate");
        if (alt) name?.classList.add("alt");
        const tag = document.createElement("span");
        tag.className = alt ? "begin-tag vibrate alt" : "begin-tag vibrate";
        tag.textContent = point.lane === "study" ? "Begin study" : "Make money now";
        btn.append(tag);
        btn.disabled = !state.mode;
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!state.mode) return;
          startPath(point.lane);
          render();
        });
      } else if (state.path) {
        const picked = point.lane === state.path;
        btn.classList.add(picked ? "picked" : "dim");
        name?.classList.add(picked ? "steady" : "dim-choice");
        btn.setAttribute("aria-pressed", picked ? "true" : "false");
      }
    }
    track.append(btn);
  }

  view.append(track);
  const walking = !snap && scrollMs > 0;
  if (walking) view.classList.add("moving");
  const pace = () => {
    if (!walking) return;
    track.style.transitionDuration = `${scrollMs}ms`;
    track.style.transitionTimingFunction = "linear";
  };
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
      pace();
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

function gutResult(check) {
  return spec.meta.gutCheck.results.find((row) => row.id === check.id);
}

function gutSentence(check) {
  const copy = spec.meta.gutCheck.copy;
  const result = gutResult(check);
  const held = check.held ? ` ${copy.floor}` : "";
  return `${result.label}. ${result.line} Pay is ${money(check.salaryAfter)}.${held}`;
}

function showGutCheck(checks) {
  if (!checks?.length) {
    reviewCardEl.hidden = true;
    reviewOddsEl.replaceChildren();
    reviewResultEl.textContent = "";
    reviewRuleEl.textContent = "";
    return;
  }
  const gut = spec.meta.gutCheck;
  reviewCardEl.hidden = false;
  reviewOddsEl.replaceChildren();
  const odds = gutCheckOdds(spec, state.mode, state.point);
  for (const result of gut.results) {
    const li = document.createElement("li");
    li.textContent = `${result.label} ${Math.round(odds[result.id] * 100)}%`;
    reviewOddsEl.append(li);
  }
  const lines = [];
  for (const check of checks) {
    if (check.landed) {
      const lead = check.weak ? gut.copy[check.weak] : gut.copy.review;
      lines.push(`${lead} ${gutSentence(check)}`);
    } else {
      const passed = gut.copy.pass.replace("{age}", check.age).replace("{label}", gutResult(check).label);
      lines.push(`${passed} Pay ${money(check.salaryAfter)}.${check.held ? ` ${gut.copy.floor}` : ""}`);
    }
  }
  reviewResultEl.textContent = lines.join(" ");
  reviewRuleEl.textContent = gut.copy.rule;
  reviewCardEl.scrollIntoView({ block: "nearest" });
}

function renderStory() {
  const space = inspect || currentSpace(spec, state);
  choicesEl.replaceChildren();
  if (!space) {
    showFlavor(null);
    kickerEl.textContent = state.mode ? "Choose" : "";
    titleEl.textContent = state.mode ? "Study, or make money right away." : "";
    const income = isEntirety(state) ? triangleRates(spec, state.point).income : 1;
    const figures = openingFigures(spec, state.mode);
    const debt = figures.tuition;
    const studyPay = Math.round(figures.studyPay * income);
    const workPay = Math.round(figures.workPay * income);
    const workStart = figures.workStart;
    const stake = workStart - spec.meta.startingCash;
    const unit = state.mode === "life" ? "squares" : "years";
    const workLine = stake
      ? `Work makes money right away: no tuition, and you start with ${money(workStart)}.`
      : `Work makes money right away: no tuition, so you keep ${money(workStart)} instead of taking on that debt.`;
    detailEl.textContent = state.mode === "life"
      ? `Savings and pay start at $0. Study costs ${money(debt)} now, and pay stays $0 until the first job. Work skips that bill. Either way, a spin from 1 to 10 sets what every Payday pays: work ${money(figures.workFloor)} to ${money(figures.workPay)}, study ${money(figures.studyFloor)} to ${money(figures.studyPay)}.`
      : state.mode
      ? `Study costs ${money(debt)} now and pays ${money(studyPay)} a year after 21. ${workLine} Pay starts at ${money(workPay)}. Same number of ${unit} either way. The house, the cards, the investments, and the kids swing the ending.`
      : "";
    showGutCheck(null);
    if (state.mode && state.phase === "choose") {
      for (const [lane, label, cls] of [
        ["study", "Begin study", "vibrate"],
        ["work", "Make money now", "vibrate alt"],
      ]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice decision";
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = label;
        btn.append(span);
        btn.addEventListener("click", () => {
          startPath(lane);
          render();
        });
        choicesEl.append(btn);
      }
    }
    return;
  }
  const spun = lastSpin();
  const bits = [state.mode === "life" ? "Event" : `Age ${space.age}`];
  if (space.kind === "stop") bits.push("stop");
  if (space.kind === "payday") bits.push(isYearMode(state) ? "gut check" : "payday");
  if (space.kind === "choice") bits.push("choice");
  if (inspect && (!currentSpace(spec, state) || inspect.id !== currentSpace(spec, state).id)) bits.push("on the board");
  const card = flavorSeen(space);
  showFlavor(card);
  if (card) bits.push(moodLine[card.mood] || card.mood);
  kickerEl.textContent = bits.join(" \u00b7 ");
  titleEl.textContent = card ? card.caption : spaceName(space);
  const extra = [];
  if (!inspect && spun && spun.spaceId === space.id && isYearMode(state) && Number.isFinite(spun.moved)) {
    const word = spun.moved === 1 ? "year" : "years";
    extra.push(`${spun.moved} ${word} passed. You are ${spun.toAge}.`);
  }
  if (!inspect && spun && spun.spaceId === space.id && state.mode === "life") {
    const paid = movePay(spun);
    const count = paid.count;
    const passed = count
      ? `Paid this turn ${money(paid.cash)}.`
      : "No pay this turn.";
    const bits = [passed];
    if (paid.cashDelta) {
      const sign = paid.cashDelta > 0 ? "+" : "\u2212";
      bits.push(`This square ${sign}${money(Math.abs(paid.cashDelta))}.`);
    }
    if (paid.salaryDelta) {
      const sign = paid.salaryDelta > 0 ? "up" : "down";
      bits.push(`Annual pay ${sign} ${money(Math.abs(paid.salaryDelta))}.`);
    }
    extra.push(bits.join(" "));
  }
  if (!inspect && spun && isYearMode(state) && (spun.yearPay || spun.yearBill)) {
    extra.push(`Paid ${money(spun.yearPay)} and charged ${money(spun.yearBill)}.`);
  }
  if (!inspect && spun?.cardPaid) extra.push(`The cards come due: ${money(spun.cardPaid)}.`);
  if (!inspect && state.cardBalance > 0) extra.push(`Card balance ${money(state.cardBalance)}. It stacks each space.`);
  const checks = !inspect && spun && spun.spaceId === space.id ? spun.gutChecks : null;
  showGutCheck(checks);
  if (!inspect && spun && spun.spaceId === space.id && spun.discarded) {
    extra.push(`The move stopped here. ${spun.discarded} steps unused.`);
  }
  const here = currentSpace(spec, state);
  const onHere = !inspect || inspect.id === here?.id;
  const waiting = onHere && state.phase === "choice" && here?.choice;
  const settled = onHere && state.lastChoice && here?.choice && state.lastChoice.spaceId === here.id && state.phase !== "choice";
  if (waiting) extra.unshift(choiceLine(here));
  if (state.phase === "salary") {
    const band = spec.meta.lifePaySpin[state.path];
    extra.unshift(`Spin for pay. A 1 pays ${money(band.floor)} every Payday. A 10 pays ${money(band.floor + 9 * band.step)}.`);
  }
  let lead = card ? "" : space.detail;
  if (!card && isYearMode(state) && space.kind === "payday") {
    const rule = checks?.length ? "" : spec.meta.gutCheck.copy.rule;
    lead = [spec.meta.gutCheck.spaceCopy?.[space.id], rule].filter(Boolean).join(" ");
  }
  detailEl.textContent = [lead, ...extra].filter(Boolean).join(" ");

  if (waiting || settled) {
    const picked = settled ? Boolean(state.lastChoice.accept) : null;
    for (const [accept, label] of [
      [true, here.choice.yesLabel],
      [false, here.choice.noLabel],
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice decision";
      const span = document.createElement("span");
      if (picked == null) span.className = accept ? "vibrate" : "vibrate alt";
      else span.className = accept === picked ? "steady" : "dim-choice";
      btn.setAttribute("aria-pressed", picked != null && accept === picked ? "true" : "false");
      btn.disabled = picked != null;
      span.textContent = label;
      btn.append(span);
      if (picked == null) {
        btn.addEventListener("click", () => {
          state = resolveChoice(spec, state, accept);
          inspect = null;
          render();
        });
      }
      choicesEl.append(btn);
    }
  }
}
