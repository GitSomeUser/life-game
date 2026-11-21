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

  const walker = document.createElement("div");
  walker.className = "climb-walker";
  walker.innerHTML = walkerMarkup();
  view.append(track, walker);
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
    detailEl.textContent = state.mode
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
      ? `${count} ${count === 1 ? "Payday" : "Paydays"} passed or landed. Collected ${money(paid.cash)}.`
      : "No Payday this move.";
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

function deltaMark(kind, delta) {
  const eps = kind === "death" ? 1e-12 : 0.5;
  if (!Number.isFinite(delta) || Math.abs(delta) < eps) return "";
  const plus = delta > 0;
  const good = kind === "income" ? plus : !plus;
  const sign = plus ? "+" : "\u2212";
  const word = `${good ? "good" : "bad"}, ${plus ? "above" : "below"} the center`;
  return `<i class="delta ${good ? "good" : "bad"}" aria-label="${word}">${sign}</i>`;
}

function chanceText(q) {
  return `${(q * 100).toFixed(3)}%`;
}

function annualLine(paid) {
  const rate = `Annual pay ${money(state.salary)}`;
  if (!paid?.salaryDelta) return rate;
  const sign = paid.salaryDelta > 0 ? "up" : "down";
  return `${rate}, ${sign} ${money(Math.abs(paid.salaryDelta))}`;
}

function applyModeChrome() {
  const mode = state?.mode || "";
  document.body.classList.toggle("mode-unset", !mode);
  document.body.classList.toggle("mode-plain", mode === "life" || mode === "lifespan");
  document.body.classList.toggle("mode-span", mode === "lifespan");
  document.body.classList.toggle("mode-span-plus", mode === "lifespan-plus");
  document.body.classList.toggle("path-on", Boolean(state?.path));
  const title = mode === "lifespan" ? "Life$pan" : mode === "lifespan-plus" ? "Life$pan+" : "Life";
  document.title = title;
  titleHeading.textContent = title;
  ageLabelEl.textContent = mode === "life" ? "Event" : "Age";
  if (!mode) dekEl.textContent = "Life, Life$pan, or Life$pan+.";
  else if (mode === "life") dekEl.textContent = "Pass or land on Payday and you collect annual pay, even twice in one spin. Other squares change your money only when you land. Retire with the most savings.";
  else dekEl.textContent = "Each square is one year. A spin is years passed, and every year you enter pays and charges that year.";
  retirementEl.hidden = mode !== "lifespan";
  payLabel.textContent = mode === "life" ? "Payday" : mode === "lifespan-plus" ? "Income" : "Pay";
  cashLabel.textContent = "Savings";
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    btn.disabled = Boolean(state.path);
  });
  const notes = {
    "": "",
    life: "Collect annual pay for every Payday you pass or land on. A spin can cross more than one. Any other square adds or subtracts only if you stop on it.",
    lifespan: "Each square is one year. Every year you enter pays that year's salary and charges 60% of it. Former paydays are Gut Checks.",
    "lifespan-plus": "Same years and Gut Checks. The work axis sets the Gut Check odds. Health and frugality set the copy.",
  };
  modeNote.textContent = notes[mode] || "";
  if (!state.path) {
    if (mode === "lifespan-plus") {
      setupLead.textContent = "Drag the point. The triangle hides when Study or Work begins.";
    } else if (mode === "life" || mode === "lifespan") {
      setupLead.textContent = "You can still flip the mode. It locks when Study or Work begins.";
    } else {
      setupLead.textContent = "Life, Life$pan, or Life$pan+.";
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
  const tones = {
    death: [294, 220],
    heyday: [247, 330],
    steady: [262],
    mayday: [330, 247],
  };
  const notes = tones[kind] || [196, 247, 294];
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
  if (state.mode === "life") ageEl.textContent = "\u2014";
  else ageEl.textContent = space ? String(space.age) : "18";
  if (!isEntirety(state)) {
    if (state.mode === "lifespan") {
      const portrait = portraitStats(spec, state);
      expensesEl.className = "";
      expensesEl.textContent = money(portrait.spending);
    }
    savingsEl.innerHTML = `<span class="num">${money(state.cash)}</span>`;
    savingsEl.className = state.cash < 0 ? "bad" : "good";
    payEl.className = "";
    if (state.mode === "life") {
      const paid = movePay();
      const annual = annualLine(paid);
      if (!paid) {
        payEl.innerHTML = `<span class="num">\u2014</span><span class="borrow-note">${annual}</span>`;
      } else if (!paid.count) {
        payEl.innerHTML = `<span class="num">${money(0)}</span><span class="borrow-note">No Payday this move. ${annual}</span>`;
      } else {
        const word = paid.count === 1 ? "Payday" : "Paydays";
        payEl.innerHTML = `<span class="num">${money(paid.cash)}</span><span class="borrow-note">${paid.count} ${word} this move. ${annual}</span>`;
      }
    } else {
      payEl.innerHTML = `<span class="num">${money(state.salary)}</span>`;
    }
    drawWheel(0);
    if (wedgeNote) wedgeNote.textContent = state.mode ? "Spinner 1 through 10." : "";
    figureEl.innerHTML = "";
    renderDeath();
    return;
  }
  const portrait = portraitStats(spec, state);
  const interestNote = portrait.interest > 0 ? `<span class="borrow-note">earns 4% a year</span>` : "";
  savingsEl.innerHTML = `<span class="num">${money(state.cash)}</span>${interestNote}`;
  savingsEl.className = state.cash < 0 ? "bad" : "good";
  payEl.className = portrait.income < 0 ? "bad" : "good";
  payEl.innerHTML = `<span class="num">${money(portrait.income)}</span>${deltaMark("income", portrait.incomeDelta)}`;
  const borrowNote = portrait.borrowing > 0 ? `<span class="borrow-note">includes 4% borrowing</span>` : "";
  expensesEl.className = "bad";
  expensesEl.innerHTML = `${money(portrait.annual)}${deltaMark("expense", portrait.expenseDelta)}${borrowNote}`;
  deathChanceEl.innerHTML = `${chanceText(portrait.death)}${deltaMark("death", portrait.deathDelta)}<span class="qx-gap">${spec.mortality.life.name} ${chanceText(portrait.qLife)} \u00b7 ${spec.mortality.annuity.name} ${chanceText(portrait.qAnn)}</span>`;
  yearsEl.textContent = portrait.years.toFixed(1);
  const rates = portrait.rates;
  leverReadout.textContent = `Health ${rates.h.toFixed(2)} \u00b7 Work ${rates.w.toFixed(2)} \u00b7 Frugality ${rates.f.toFixed(2)}. Income \u00d7${rates.income.toFixed(2)}. Spend ${(rates.spend * 100).toFixed(0)}%.`;
  const q = deathProbability(spec, age, rates.axis.h);
  drawWheel(q);
  if (wedgeNote) wedgeNote.textContent = `Death wedge ${chanceText(q)} of the circle.`;
  drawFigure(rates);
  renderDeath();
}

const fixed = (n) => +n.toFixed(1);

function figureMarkup(rates, { pose = "contact", lead = 0, mouth = "flat", accent = 0 } = {}) {
  const slouch = Math.min(1, Math.max(0, (1 - rates.axis.h) / 2 + accent));
  const focus = (rates.axis.w + 1) / 2;
  const spend = Math.max(0, -rates.axis.f);
  const mix = (upright, slumped) => fixed(upright + (slumped - upright) * slouch);
  const headX = mix(102, 126);
  const headY = mix(24, 46);
  const hipX = mix(90, 76);
  const hipY = mix(74, 88);
  const bowX = mix(94, 132);
  const bowY = mix(50, 72);
  const shoulderX = mix(98, 116);
  const shoulderY = mix(46, 60);
  const kneeY = mix(96, 100);
  const footY = mix(116, 114);
  const stride = {
    front: { knee: [mix(112, 122), mix(96, 102)], foot: [mix(128, 138), mix(116, 110)] },
    back: { knee: [mix(72, 58), kneeY], foot: [mix(56, 46), footY] },
  };
  const passing = {
    front: { knee: [fixed(hipX + 12), fixed(kneeY - 4)], foot: [fixed(hipX + 4), fixed(footY - 8)] },
    back: { knee: [fixed(hipX + 3), kneeY], foot: [fixed(hipX + 1), footY] },
  };
  const legs = pose === "passing" ? passing : stride;
  const arms = pose === "passing"
    ? { front: [fixed(shoulderX + 5), fixed(shoulderY + 26)], back: [fixed(shoulderX - 6), fixed(shoulderY + 26)] }
    : { front: [mix(122, 136), mix(60, 80)], back: [mix(66, 50), mix(64, 76)] };
  const nearLeg = lead ? legs.back : legs.front;
  const farLeg = lead ? legs.front : legs.back;
  const nearArm = lead ? arms.front : arms.back;
  const farArm = lead ? arms.back : arms.front;
  const leg = (row) => `<path d="M${hipX} ${hipY} L${row.knee[0]} ${row.knee[1]} L${row.foot[0]} ${row.foot[1]}"/>`;
  const arm = (hand) => `<path d="M${shoulderX} ${shoulderY} L${hand[0]} ${hand[1]}"/>`;
  const width = (2.8 - 1.55 * focus).toFixed(2);
  const opacity = (0.4 + 0.6 * focus).toFixed(2);
  const dash = focus < 0.5 ? 'stroke-dasharray="2.2 2.6"' : "";
  const join = focus >= 0.5 ? "miter" : "round";
  const cap = focus >= 0.5 ? "butt" : "round";
  const tilt = mouth === "up" ? -2.5 : mouth === "down" ? 2.5 : 0;
  const mouthPath = `M${fixed(headX + 3)} ${fixed(headY + 2 - tilt / 2)} l7 ${tilt}`;
  const bag = spend > 0.05
    ? `<path d="M${shoulderX} ${shoulderY} L${fixed(hipX - 16)} ${fixed(hipY - 4)}"/><rect x="${fixed(hipX - 22)}" y="${fixed(hipY - 8)}" width="14" height="16"/>`
    : "";
  const shoe = (foot) => `M${fixed(foot[0] - 8)} ${foot[1]} h15`;
  const shoes = spend > 0.3 ? `<path d="${shoe(nearLeg.foot)} ${shoe(farLeg.foot)}"/>` : "";
  const bracelet = spend > 0.55 ? `<circle cx="${nearArm[0]}" cy="${nearArm[1]}" r="3.4"/>` : "";
  const neckX = fixed(headX + 4);
  const neckY = fixed(headY + 18);
  const necklace = spend > 0.8
    ? `<path d="M${fixed(headX - 6)} ${fixed(headY + 8)} Q${neckX} ${fixed(headY + 22)} ${fixed(headX + 12)} ${fixed(headY + 8)}"/><circle cx="${neckX}" cy="${neckY}" r="2.4"/>`
    : "";
  return `
    <g fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${join}" opacity="${opacity}" ${dash}>
      <g opacity="0.55">${leg(farLeg)}${arm(farArm)}</g>
      <circle cx="${headX}" cy="${headY}" r="11"/>
      <path class="mouth" d="${mouthPath}"/>
      <path d="M${headX} ${fixed(headY + 11)} Q${bowX} ${bowY} ${hipX} ${hipY}"/>
      ${leg(nearLeg)}${arm(nearArm)}
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      ${bag}${shoes}${bracelet}${necklace}
    </g>`;
}

const STRIDE_ONE_MS = 600;
const STRIDE_SCROLL_MS = 280;
const BEAT_MS = 700;
const PULSE_MS = 500;
const BEAT_MOUTH = { heyday: "up", steady: "flat", mayday: "down" };
const BEAT_ACCENT = { heyday: -0.06, steady: 0, mayday: 0.14 };
const REST = { pose: "contact", lead: 0, mouth: "flat", accent: 0 };
let walk = { ...REST };
let motionTimers = [];
let scrollMs = 0;

function figureRates() {
  return triangleRates(spec, isEntirety(state) ? state.point : CORNERS.center);
}

function drawFigure(rates) {
  figureEl.innerHTML = figureMarkup(rates, { ...walk, pose: "contact", lead: 0 });
}

function walkerMarkup() {
  return `<svg viewBox="36 6 112 120" aria-hidden="true">${figureMarkup(figureRates(), walk)}</svg>`;
}

function paintFigures() {
  if (!spec || !state) return;
  if (isEntirety(state)) drawFigure(figureRates());
  const walker = boardEl.querySelector(".climb-walker");
  if (walker) walker.innerHTML = walkerMarkup();
}

function later(ms, fn) {
  motionTimers.push(setTimeout(fn, ms));
}

function stopMotion() {
  motionTimers.forEach(clearTimeout);
  motionTimers = [];
  walk = { ...REST };
  scrollMs = 0;
  boardEl.querySelector(".climb-view")?.classList.remove("moving");
  payEl.classList.remove("pulse-good", "pulse-bad");
}

function setNum(el, text) {
  const num = el.querySelector(".num");
  if (num) num.textContent = text;
  else el.textContent = text;
}

function movePlan(spun) {
  const strides = spun.moved <= 1 ? 2 : 3;
  const strideMs = spun.moved <= 1 ? STRIDE_ONE_MS : STRIDE_SCROLL_MS;
  const walkMs = strides * strideMs;
  const check = spun.gutChecks?.find((item) => item.landed) || null;
  return { strides, strideMs, walkMs, check, total: walkMs + (check ? BEAT_MS : 0) };
}

function playMove(before, spun, plan) {
  const years = spun.years || [];
  if (years.length) {
    setNum(ageEl, String(spun.fromAge));
    setNum(payEl, money(before.salary));
    setNum(savingsEl, money(before.cash));
    savingsEl.classList.toggle("bad", before.cash < 0);
    savingsEl.classList.toggle("good", before.cash >= 0);
  }
  const poses = plan.strides * 2;
  for (let k = 0; k < poses; k += 1) {
    later((k * plan.strideMs) / 2, () => {
      walk = { ...walk, pose: k % 2 ? "passing" : "contact", lead: Math.floor(k / 2) % 2 };
      paintFigures();
    });
  }
  years.forEach((year, i) => {
    later(((i + 1) / years.length) * plan.walkMs, () => {
      setNum(ageEl, String(year.age));
      setNum(payEl, money(year.salary));
      setNum(savingsEl, money(year.cash));
      savingsEl.classList.toggle("bad", year.cash < 0);
      savingsEl.classList.toggle("good", year.cash >= 0);
    });
  });
  later(plan.walkMs, () => {
    scrollMs = 0;
    boardEl.querySelector(".climb-view")?.classList.remove("moving");
    walk = { ...REST };
    if (boardKey() !== climbSize) renderBoard();
    renderStats();
    paintFigures();
    if (!plan.check) return;
    const id = plan.check.id;
    walk = { ...REST, mouth: BEAT_MOUTH[id], accent: BEAT_ACCENT[id] };
    paintFigures();
    playBeat(id);
    if (id !== "steady") {
      const pulse = id === "heyday" ? "pulse-good" : "pulse-bad";
      payEl.classList.add(pulse);
      later(PULSE_MS, () => payEl.classList.remove(pulse));
    }
    later(BEAT_MS, () => {
      walk = { ...REST };
      paintFigures();
    });
  });
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
  state = createGame(spec, state.seed, point, state.mode);
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
  btn.title = `${spaceMark(space)} ${spaceName(space)}`;
  btn.setAttribute("aria-label", `${spaceMark(space)} ${spaceName(space)}`);
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
  if (!name) return;
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
  stopMotion();
  state = data.state;
  animEl.checked = Boolean(data.animation);
  speedEl.checked = Boolean(data.speedRun);
  pointLocked = Boolean(state.path);
  gameNameInput.value = name;
  inspect = null;
  resetNeedle();
  note(`Resumed ${name}.`);
  render();
}

function newGame() {
  if (!spec) return;
  stopMotion();
  pointLocked = false;
  inspect = null;
  resetNeedle();
  state = createGame(spec, mintSeed(), { ...CORNERS.center }, null);
  note("");
  render();
}

function renderLog() {
  logEl.replaceChildren();
  if (!state.log.length) {
    const li = document.createElement("li");
    li.textContent = "No decisions yet.";
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
  const spun = lastSpin();
  if (state.phase === "choose") {
    actBtn.textContent = "Spin";
    actBtn.disabled = true;
    if (!state.mode) readout.textContent = "Pick Life, Life$pan, or Life$pan+.";
    else if (!isEntirety(state)) readout.textContent = "Choose a path. The spinner is 1 through 10.";
    else readout.textContent = "Choose a path. Drag the point first if you want. The wedge is already on the wheel.";
  } else if (state.phase === "choice") {
    actBtn.textContent = "Spin";
    actBtn.disabled = true;
    readout.textContent = "A choice is waiting.";
  } else if (state.phase === "ended") {
    actBtn.textContent = "New life";
    actBtn.disabled = locked;
    readout.textContent = state.death
      ? `The wedge at ${state.death.age}. The life ends on this square.`
      : state.mode === "life"
        ? `Retired. Savings ${money(state.cash)}. Most savings wins.`
        : `Working life ends at 68 with savings ${money(state.cash)}.`;
  } else {
    actBtn.textContent = "Spin";
    actBtn.disabled = locked;
    if (state.mode === "life" && spun) {
      const paid = movePay(spun);
      readout.textContent = paid.count
        ? `Last spin ${spun.roll}. ${paid.count} ${paid.count === 1 ? "Payday" : "Paydays"}, ${money(paid.cash)}.`
        : `Last spin ${spun.roll}. No Payday.`;
    } else if (isYearMode(state) && spun && Number.isFinite(spun.moved)) {
      const word = spun.moved === 1 ? "year" : "years";
      readout.textContent = `Last spin ${spun.roll}. ${spun.moved} ${word} passed.`;
    } else {
      readout.textContent = spun ? `Last spin ${spun.roll}.` : "Spin when you are ready.";
    }
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
    stopMotion();
    state = createGame(spec, mintSeed(), { ...CORNERS.center }, null);
    pointLocked = false;
    inspect = null;
    resetNeedle();
    render();
    return;
  }
  if (state.phase !== "play") return;
  inspect = null;
  stopMotion();
  const before = state;
  state = spin(spec, state);
  if (speedEl.checked) {
    let guard = 0;
    while (state.phase === "play" && guard++ < 80) state = spin(spec, state);
  }
  const spun = lastSpin();
  const fresh = spun && !state.death && spun.n > before.log.length ? spun : null;
  const plan = motionOn() && fresh ? movePlan(fresh) : null;
  scrollMs = plan ? plan.walkMs : 0;
  locked = motionOn();
  render();
  if (!speedEl.checked) playBeat(state.death ? "death" : "land");
  if (plan) playMove(before, fresh, plan);
  if (locked) {
    setTimeout(() => {
      locked = false;
      renderControls();
    }, Math.max(720, plan?.total || 0));
  }
}

actBtn.addEventListener("click", takeTurn);

copyBtn.addEventListener("click", async () => {
  const text = [`game ${gameName() || "unnamed"}`, leverReadout.textContent, ...state.log.map(logLine)].join("\n");
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
    const mode = btn.dataset.mode;
    const point = isEntirety({ mode }) && state?.point ? state.point : { ...CORNERS.center };
    state = createGame(spec, mintSeed(), point, mode);
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
resumeOpenBtn.addEventListener("click", resumeGame);
newGameBtn.addEventListener("click", newGame);
animEl.addEventListener("change", () => {
  if (!motionOn()) stopMotion();
  renderControls();
  if (spec && state) renderBoard();
});
speedEl.addEventListener("change", () => renderControls());

function boardKey() {
  const viewW = Math.max(boardEl.clientWidth || 0, boardEl.parentElement?.clientWidth || 0, 360);
  const viewH = Math.max(boardEl.clientHeight || 0, boardEl.parentElement?.clientHeight || 0, 280);
  return `${viewW}x${viewH}`;
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!scrollMs) renderBoard();
  }, 150);
});

new ResizeObserver(() => {
  if (!spec || !state || scrollMs) return;
  if (boardKey() === climbSize) return;
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
  state = createGame(spec, openingSeed(), pointFromQuery(), modeFromQuery());
  const preset = params.get("path");
  if ((preset === "study" || preset === "work") && state.mode) startPath(preset);
  render();
}
