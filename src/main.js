import { choosePath, createGame, currentSpace, resolveChoice, spin } from "./engine.mjs";

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
const payEl = document.querySelector("#pay");
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

const params = new URLSearchParams(location.search);
seedInput.value = params.get("seed") || String(Math.floor(Math.random() * 1_000_000_000));

function money(n) {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function token() {
  return `<svg class="token" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 18h12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

function drawWheel() {
  const nums = [];
  for (let n = 1; n <= 10; n += 1) {
    const angle = ((n - 1) / 10) * Math.PI * 2 - Math.PI / 2;
    const x = 100 + Math.cos(angle) * 74;
    const y = 100 + Math.sin(angle) * 74;
    nums.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-size="11" font-family="Palatino, Georgia, serif">${n}</text>`);
  }
  wheel.innerHTML = `
    <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="1"/>
    <circle cx="100" cy="100" r="62" fill="none" stroke="currentColor" stroke-width="1" opacity="0.45"/>
    ${nums.join("")}
    <g class="needle">
      <line x1="100" y1="100" x2="100" y2="28" stroke="currentColor" stroke-width="1.4"/>
      <circle cx="100" cy="100" r="3" fill="currentColor"/>
    </g>`;
}

function pointNeedle(roll) {
  const needle = wheel.querySelector(".needle");
  if (!needle || !roll) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = (roll - 1) * 36;
  if (reduce) {
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

function startPath(pathName) {
  const seed = seedNumber();
  if (!state || state.phase !== "choose" || state.seed !== seed || state.log.length) {
    state = createGame(spec, seed);
  }
  state = choosePath(spec, state, pathName);
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
    const debt = Math.abs(spec.paths.study.spaces[0].cash);
    detailEl.textContent = `Study costs ${money(debt)} now and pays ${money(spec.meta.studySalary)} a year after 21. Work pays ${money(spec.meta.workSalary)} from the first job. Same number of years either way.`;
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
  if (!inspect && state.phase === "choice" && here?.choice) extra.unshift(here.choice.prompt);
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

function renderStats() {
  const space = currentSpace(spec, state);
  ageEl.textContent = space ? String(space.age) : "18";
  cashEl.textContent = money(state.cash);
  cashEl.classList.toggle("debt", state.cash < 0);
  cashEl.setAttribute("aria-label", state.cash < 0 ? `debt ${money(state.cash)}` : money(state.cash));
  payEl.textContent = money(state.salary);
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
    readout.textContent = "Choose a path. Then spin 1 through 10.";
  } else if (state.phase === "choice") {
    actBtn.textContent = "Spin";
    actBtn.disabled = true;
    readout.textContent = "A choice is waiting.";
  } else if (state.phase === "ended") {
    actBtn.textContent = "New life";
    actBtn.disabled = locked;
    readout.textContent = `Working life ends at 68 with ${money(state.cash)}.`;
  } else {
    actBtn.textContent = "Spin";
    actBtn.disabled = locked;
    readout.textContent = spun ? `Last spin ${spun.roll}.` : "Spin when you are ready.";
  }
  if (spun && spun.n !== shownSpin) {
    shownSpin = spun.n;
    pointNeedle(spun.roll);
  }
}

function render() {
  renderStats();
  renderStory();
  renderBoard();
  renderLog();
  renderControls();
}

actBtn.addEventListener("click", () => {
  if (locked) return;
  if (state.phase === "ended") {
    state = createGame(spec, seedNumber());
    inspect = null;
    resetNeedle();
    render();
    return;
  }
  if (state.phase !== "play") return;
  inspect = null;
  state = spin(spec, state);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  locked = !reduce;
  render();
  if (locked) {
    setTimeout(() => {
      locked = false;
      renderControls();
    }, 720);
  }
});

copyBtn.addEventListener("click", async () => {
  const text = [`seed ${state.seed}`, ...state.log.map(logLine)].join("\n");
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
  actBtn.click();
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderBoard, 150);
});

drawWheel();

const specRes = await fetch("./spec/accumulation.json");
if (!specRes.ok) {
  titleEl.textContent = "The board did not load.";
  detailEl.textContent = "Start a local server from this folder, then open the page. file:// cannot read the spec.";
} else {
  spec = await specRes.json();
  fineEl.textContent = `${spec.meta.rules.join(" ")} Amounts live in the board spec.`;
  state = createGame(spec, seedNumber());
  const preset = params.get("path");
  if (preset === "study" || preset === "work") state = choosePath(spec, state, preset);
  render();
}
