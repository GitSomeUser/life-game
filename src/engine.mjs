/**
 * Accumulation simulation. Reads spec/accumulation.json.
 * Deterministic: spins, risky choices, and flavor cards use separate streams.
 * The triangle sets income, the spending rate, and the death blend.
 * Weights are inverse distance to the vertices.
 * Entirety pays 4% a year on positive savings and charges 4% when savings are negative.
 * Decumulation is not in this version.
 * Death is on the spin stream, so answers do not move the wedge.
 * Life and Life$pan ignore the triangle, the wedge, and borrowing.
 * Entirety keeps the Stage 2 board. Retirement spaces are not in this version.
 * The climb is ages 18–68 only. There is no downslope.
 */

const KINDS = new Set(["event", "payday", "stop", "choice"]);
const TONES = new Set(["good", "bad", "neutral"]);
const GAME_MODES = ["life", "lifespan", "entirety"];

export function isEntirety(state) {
  return state?.mode === "entirety";
}

function normalizeMode(mode) {
  if (mode === undefined) return "entirety";
  if (mode === null) return null;
  if (!GAME_MODES.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
  return mode;
}

export function track(spec, pathName) {
  const head = spec.paths[pathName];
  if (!head) throw new Error(`Unknown path: ${pathName}`);
  return head.spaces.concat(spec.paths.shared.spaces);
}

export function validate(spec) {
  const errors = [];
  const { ageStart, ageEnd } = spec.meta;
  if (ageStart !== 18 || ageEnd !== 68) errors.push("age range must be 18–68");
  if (spec.meta.yearsPerSpace !== 1) errors.push("stage 1 uses 1 year per space");
  for (const name of ["study", "work"]) {
    const spaces = track(spec, name);
    if (spaces.length !== ageEnd - ageStart + 1) {
      errors.push(`${name} has ${spaces.length} spaces, expected ${ageEnd - ageStart + 1}`);
    }
    spaces.forEach((space, i) => {
      const age = ageStart + i;
      if (space.age !== age) errors.push(`${name} index ${i} is age ${space.age}, expected ${age}`);
      if (!KINDS.has(space.kind)) errors.push(`${space.id} bad kind`);
      if (!TONES.has(space.tone)) errors.push(`${space.id} bad tone`);
      if (!space.id || !space.title || !space.detail || !space.adapts) {
        errors.push(`${space.id || i} missing text`);
      }
      if (space.kind === "choice" && !space.choice?.prompt) errors.push(`${space.id} choice missing prompt`);
      if (space.kind !== "choice" && space.choice) errors.push(`${space.id} choice on non-choice`);
      if (space.flavor && (space.cash || space.salarySet != null || space.salaryDelta)) {
        errors.push(`${space.id} flavor year must not move cash or salary`);
      }
      if (space.flavor && (space.kind !== "event" || space.tone !== "neutral")) {
        errors.push(`${space.id} flavor year must be a neutral event`);
      }
      if (space.terminal && (space.age !== ageEnd || space.kind !== "stop")) {
        errors.push(`${space.id} terminal must be the age-68 stop`);
      }
    });
    const ids = new Set(spaces.map((s) => s.id));
    if (ids.size !== spaces.length) errors.push(`${name} duplicate ids`);
  }
  const cards = spec.flavorCards || [];
  if (!cards.length) errors.push("flavor pool is empty");
  const moods = {};
  const cardIds = new Set();
  for (const card of cards) {
    if (!card.id || !card.mood || !card.caption || !card.still) errors.push("flavor card missing fields");
    if (cardIds.has(card.id)) errors.push(`duplicate flavor card ${card.id}`);
    cardIds.add(card.id);
    moods[card.mood] = (moods[card.mood] || 0) + 1;
    if (card.animation != null) errors.push(`${card.id} animation is later`);
  }
  for (const mood of ["cute-funny", "funny-sad", "pg-scary", "happy", "exciting"]) {
    if ((moods[mood] || 0) < 3) errors.push(`${mood} needs several cards`);
  }
  for (const name of GAME_MODES) {
    if (!spec.meta.modes?.[name]) errors.push(`missing mode ${name}`);
  }
  const triangle = spec.meta.triangle;
  if (!triangle) errors.push("missing triangle");
  else {
    for (const key of ["incomePerAxis", "spendCenter", "spendPerAxis", "healthCostShare", "healthCostAbove", "healthCostBelow", "borrowingRate", "interestRate"]) {
      if (!Number.isFinite(triangle[key]) || triangle[key] < 0) errors.push(`triangle ${key} must be a number`);
    }
  }
  const mortality = spec.mortality;
  if (!mortality?.life?.q || !mortality?.annuity?.q) errors.push("missing mortality series");
  else {
    const span = ageEnd - ageStart + 1;
    for (const name of ["life", "annuity"]) {
      const series = mortality[name].q;
      if (series.length !== span) errors.push(`${name} q has ${series.length} rates, expected ${span}`);
      series.forEach((q, i) => {
        if (!Number.isFinite(q) || q <= 0 || q > 1) errors.push(`${name} q at ${ageStart + i} must be a death probability above 0`);
      });
    }
    if (mortality.life.q.length === mortality.annuity.q.length) {
      mortality.annuity.q.forEach((q, i) => {
        if (!(mortality.life.q[i] > q)) errors.push(`life q at ${ageStart + i} must be above the annuity table`);
      });
    }
    const male = mortality.annuity.male;
    const female = mortality.annuity.female;
    if (male?.length === span && female?.length === span) {
      mortality.annuity.q.forEach((q, i) => {
        if (Math.abs(q - (male[i] + female[i]) / 2) > 1e-9) {
          errors.push(`annuity q at ${ageStart + i} must be the 50/50 mean`);
        }
      });
    }
    if (mortality.perSquare != null && typeof mortality.perSquare !== "object") {
      errors.push("perSquare slot must be null until a later pass");
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return spec;
}

export function centerPoint() {
  return { h: 1 / 3, w: 1 / 3, f: 1 / 3 };
}

export function parsePoint(raw) {
  if (raw == null) return centerPoint();
  const h = Number(raw.h ?? raw.health);
  const w = Number(raw.w ?? raw.work);
  const f = Number(raw.f ?? raw.frugality);
  for (const n of [h, w, f]) {
    if (!Number.isFinite(n) || n < -1e-9 || n > 1 + 1e-9) throw new Error("Triangle weights are from 0 to 1");
  }
  const sum = h + w + f;
  if (Math.abs(sum - 1) > 1e-6) throw new Error("Triangle weights must add to 1");
  return { h: h / sum, w: w / sum, f: f / sum };
}

export function axis(weight) {
  if (weight >= 1 / 3) return (weight - 1 / 3) / (2 / 3);
  return (weight - 1 / 3) / (1 / 3);
}

const VERTEX_H = { x: 0, y: Math.sqrt(3) };
const VERTEX_W = { x: 1, y: 0 };
const VERTEX_F = { x: -1, y: 0 };
const VERTEX_EPS = 1e-8;

function positionXY(point) {
  return {
    x: point.h * VERTEX_H.x + point.w * VERTEX_W.x + point.f * VERTEX_F.x,
    y: point.h * VERTEX_H.y + point.w * VERTEX_W.y + point.f * VERTEX_F.y,
  };
}

export function attributeWeights(position) {
  const point = parsePoint(position);
  const xy = positionXY(point);
  const rows = [
    ["h", VERTEX_H],
    ["w", VERTEX_W],
    ["f", VERTEX_F],
  ].map(([key, vertex]) => ({
    key,
    d: Math.hypot(xy.x - vertex.x, xy.y - vertex.y),
  }));
  const landed = rows.find((row) => row.d <= VERTEX_EPS);
  if (landed) {
    return {
      h: landed.key === "h" ? 1 : 0,
      w: landed.key === "w" ? 1 : 0,
      f: landed.key === "f" ? 1 : 0,
    };
  }
  const inv = rows.map((row) => ({ key: row.key, w: 1 / row.d }));
  const sum = inv.reduce((total, row) => total + row.w, 0);
  const weights = { h: 0, w: 0, f: 0 };
  for (const row of inv) weights[row.key] = row.w / sum;
  return weights;
}

export function triangleRates(spec, point) {
  const position = parsePoint(point);
  const weights = attributeWeights(position);
  const table = spec.meta.triangle;
  const h = axis(weights.h);
  const w = axis(weights.w);
  const f = axis(weights.f);
  const income = 1 + table.incomePerAxis * w;
  const spend = table.spendCenter - table.spendPerAxis * f;
  const healthCost = h >= 0
    ? 1 - table.healthCostAbove * h
    : 1 + table.healthCostBelow * -h;
  return {
    h: weights.h,
    w: weights.w,
    f: weights.f,
    position,
    axis: { h, w, f },
    income,
    spend,
    healthCost,
  };
}

function ratesFor(spec, state) {
  if (isEntirety(state)) return triangleRates(spec, state.point);
  const center = 1 / 3;
  return {
    h: center,
    w: center,
    f: center,
    position: { h: center, w: center, f: center },
    axis: { h: 0, w: 0, f: 0 },
    income: 1,
    spend: spec.meta.triangle.spendCenter,
    healthCost: 1,
  };
}

export function budgetFactor(spec, rates) {
  const share = spec.meta.triangle.healthCostShare;
  return rates.spend * ((1 - share) + share * rates.healthCost);
}

export function borrowingCharge(cash, spec) {
  if (!(cash < 0)) return 0;
  return Math.round(-cash * spec.meta.triangle.borrowingRate);
}

export function savingsInterest(cash, spec) {
  if (!(cash > 0)) return 0;
  return Math.round(cash * spec.meta.triangle.interestRate);
}

export function annualExpenses(income, rates, spec) {
  return Math.round(income * budgetFactor(spec, rates));
}

export function monthlyExpenses(income, rates, spec) {
  return Math.round(annualExpenses(income, rates, spec) / 12);
}

export function livingGap(spec, income, rates) {
  const center = budgetFactor(spec, triangleRates(spec, centerPoint()));
  return Math.round(income * (center - budgetFactor(spec, rates)));
}

export function deathProbability(spec, age, axisH = 0) {
  const t = (axisH + 1) / 2;
  const i = age - spec.meta.ageStart;
  const qLife = spec.mortality.life.q[i];
  const qAnn = spec.mortality.annuity.q[i];
  if (!Number.isFinite(qLife) || !Number.isFinite(qAnn)) throw new Error(`No death probability at ${age}`);
  return Math.min(1, (1 - t) * qLife + t * qAnn);
}

export function lifeExpectancy(spec, age, axisH = 0) {
  let surv = 1;
  let years = 0;
  for (let a = age; a < spec.meta.ageEnd; a += 1) {
    surv *= 1 - deathProbability(spec, a, axisH);
    years += surv;
  }
  return years;
}

export function deathBand(spec, age) {
  const band = spec.mortality.bands.find((row) => age >= row.from && age <= row.to);
  if (!band) throw new Error(`No death band for ${age}`);
  return band;
}

export function outcomeFromUnit(unit, q) {
  if (unit < q) return { death: true, roll: 0 };
  const roll = 1 + Math.floor(((unit - q) / (1 - q)) * 10);
  return { death: false, roll };
}

export function portraitStats(spec, state) {
  const rates = ratesFor(spec, state);
  const age = currentSpace(spec, state)?.age ?? spec.meta.ageStart;
  const income = state.salary;
  const annual = annualExpenses(income, rates, spec);
  const monthly = Math.round(annual / 12);
  const base = rates.income ? income / rates.income : 0;
  const centerIncome = Math.round(base);
  const centerRates = triangleRates(spec, centerPoint());
  const centerBill = annualExpenses(centerIncome, centerRates, spec);
  const spending = annual;
  const borrowing = isEntirety(state) ? borrowingCharge(state.cash, spec) : 0;
  const interest = isEntirety(state) ? savingsInterest(state.cash, spec) : 0;
  const bill = spending + borrowing;
  const death = deathProbability(spec, age, rates.axis.h);
  const deathCenter = deathProbability(spec, age, 0);
  const qi = age - spec.meta.ageStart;
  return {
    savings: state.cash,
    income,
    monthly,
    annual: bill,
    spending,
    borrowing,
    interest,
    death,
    qLife: spec.mortality.life.q[qi],
    qAnn: spec.mortality.annuity.q[qi],
    years: lifeExpectancy(spec, age, rates.axis.h),
    incomeDelta: income - centerIncome,
    expenseDelta: bill - centerBill,
    deathDelta: death - deathCenter,
    rates,
  };
}

function scaleIncome(amount, income) {
  if (!amount) return 0;
  return Math.round(amount * income);
}

function nextUnit(a) {
  let x = a | 0;
  x = (x + 0x6d2b79f5) | 0;
  let t = Math.imul(x ^ (x >>> 15), 1 | x);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: x >>> 0, unit: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

export function createGame(spec, seed, point, mode) {
  validate(spec);
  const s = seed >>> 0;
  return {
    seed: s,
    spinState: s,
    fateState: (s ^ 0xa5a5a5a5) >>> 0,
    flavorState: (s ^ 0x0f1a70c5) >>> 0,
    mode: normalizeMode(mode),
    path: null,
    index: -1,
    cash: spec.meta.startingCash,
    salary: 0,
    expenses: 0,
    point: parsePoint(point),
    phase: "choose",
    pendingChoiceId: null,
    death: null,
    log: [],
  };
}

function applyEffects(cash, salary, effect, rates) {
  if (!effect) return { cash, salary, cashDelta: 0, salaryDelta: 0 };
  const income = rates?.income ?? 1;
  let cashDelta = 0;
  let salaryDelta = 0;
  if (effect.salarySet != null) salary = scaleIncome(effect.salarySet, income);
  if (effect.salaryDelta) {
    const delta = scaleIncome(effect.salaryDelta, income);
    salary += delta;
    salaryDelta = delta;
  }
  if (effect.cash) {
    cash += effect.cash;
    cashDelta = effect.cash;
  }
  return { cash, salary, cashDelta, salaryDelta };
}

function takeLiving(spec, cash, expenses, salary, rates, entirety) {
  if (!entirety) return { cash, expenses: expenses || 0, gap: 0, borrow: 0, interest: 0 };
  const gap = livingGap(spec, salary, rates);
  const borrow = borrowingCharge(cash, spec);
  const interest = savingsInterest(cash, spec);
  return {
    cash: cash + gap + interest - borrow,
    expenses: (expenses || 0) + (gap < 0 ? -gap : 0) + borrow,
    gap,
    borrow,
    interest,
  };
}

function charge(expenses, cashDelta) {
  if (cashDelta < 0) return (expenses || 0) - cashDelta;
  return expenses || 0;
}

function takeFlavor(spec, state) {
  const pool = spec.flavorCards;
  const drawn = nextUnit(state.flavorState);
  const card = pool[Math.floor(drawn.unit * pool.length)];
  return {
    flavorState: drawn.state,
    flavor: {
      id: card.id,
      mood: card.mood,
      caption: card.caption,
      still: card.still,
    },
  };
}

function settleLanding(spec, state, space) {
  let flavorState = state.flavorState;
  let flavor = null;
  if (space.flavor) {
    const drawn = takeFlavor(spec, state);
    flavorState = drawn.flavorState;
    flavor = drawn.flavor;
  }
  const applied = space.flavor
    ? { cash: state.cash, salary: state.salary, cashDelta: 0, salaryDelta: 0 }
    : applyEffects(state.cash, state.salary, space, ratesFor(spec, state));
  return { applied, flavorState, flavor };
}

function baseEntry(state, space, extra) {
  return {
    n: state.log.length + 1,
    path: state.path,
    age: space?.age ?? null,
    spaceId: space?.id ?? null,
    title: space?.title ?? null,
    cash: state.cash,
    salary: state.salary,
    ...extra,
  };
}

export function choosePath(spec, state, pathName) {
  if (state.phase !== "choose") throw new Error("Path is already chosen");
  if (!GAME_MODES.includes(state.mode)) throw new Error("Pick a mode first");
  if (pathName !== "study" && pathName !== "work") throw new Error("Path must be study or work");
  const space = track(spec, pathName)[0];
  let next = {
    ...state,
    path: pathName,
    index: 0,
    log: state.log.concat({
      n: state.log.length + 1,
      t: "decision",
      choice: "path",
      value: pathName,
      age: space.age,
      spaceId: space.id,
      title: space.title,
      cash: state.cash,
      salary: state.salary,
    }),
  };
  if (space.kind === "choice") {
    return { ...next, phase: "choice", pendingChoiceId: space.id };
  }
  const settled = settleLanding(spec, next, space);
  const rates = ratesFor(spec, next);
  const lived = takeLiving(
    spec,
    settled.applied.cash,
    charge(next.expenses, settled.applied.cashDelta),
    settled.applied.salary,
    rates,
    isEntirety(next),
  );
  next = {
    ...next,
    cash: lived.cash,
    salary: settled.applied.salary,
    expenses: lived.expenses,
    flavorState: settled.flavorState,
    phase: space.terminal ? "ended" : "play",
  };
  return {
    ...next,
    log: next.log.concat(
      baseEntry(next, space, {
        t: "resolve",
        cashDelta: settled.applied.cashDelta,
        salaryDelta: settled.applied.salaryDelta,
        livingGap: lived.gap,
        flavor: settled.flavor,
      }),
    ),
  };
}

export function applyRoll(spec, state, roll) {
  if (state.phase !== "play") throw new Error("Cannot spin right now");
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) throw new Error("Roll must be 1–10");
  const spaces = track(spec, state.path);
  const from = spaces[state.index];
  let steps = roll;
  let i = state.index;
  const paydays = [];
  while (steps > 0 && i < spaces.length - 1) {
    i += 1;
    const space = spaces[i];
    if (space.kind === "payday") paydays.push(space);
    if (space.kind === "stop" || i === spaces.length - 1) steps = 0;
    else steps -= 1;
  }
  const moved = i - state.index;
  const discarded = roll - moved;
  let cash = state.cash;
  let salary = state.salary;
  let expenses = state.expenses || 0;
  let flavorState = state.flavorState;
  let flavor = null;
  let cashDelta = 0;
  let salaryDelta = 0;
  let living = 0;
  const rates = ratesFor(spec, state);
  const advanced = isEntirety(state);
  let paydayCash = 0;
  for (const _p of paydays) {
    cash += salary;
    paydayCash += salary;
  }
  for (let n = 1; n < moved; n += 1) {
    const year = takeLiving(spec, cash, expenses, salary, rates, advanced);
    cash = year.cash;
    expenses = year.expenses;
    living += year.gap;
  }
  const landed = spaces[i];
  if (landed.kind !== "choice" && landed.kind !== "payday") {
    const settled = settleLanding(spec, { ...state, cash, salary, flavorState }, landed);
    cash = settled.applied.cash;
    salary = settled.applied.salary;
    cashDelta = settled.applied.cashDelta;
    salaryDelta = settled.applied.salaryDelta;
    flavor = settled.flavor;
    flavorState = settled.flavorState;
    expenses = charge(expenses, cashDelta);
  }
  if (landed.kind !== "choice") {
    const year = takeLiving(spec, cash, expenses, salary, rates, advanced);
    cash = year.cash;
    expenses = year.expenses;
    living += year.gap;
  }
  let next = {
    ...state,
    index: i,
    cash,
    salary,
    expenses,
    flavorState,
  };
  const spinEntry = baseEntry(
    { ...next, log: state.log },
    landed,
    {
      t: "spin",
      roll,
      fromAge: from.age,
      toAge: landed.age,
      discarded,
      paydayAges: paydays.map((p) => p.age),
      paydayCash,
      livingGap: living,
      cash,
      salary,
    },
  );
  next.log = state.log.concat(spinEntry);

  if (landed.kind === "choice") {
    return { ...next, phase: "choice", pendingChoiceId: landed.id };
  }
  if (landed.kind !== "payday") {
    next.log = next.log.concat(
      baseEntry(next, landed, {
        t: "resolve",
        cashDelta,
        salaryDelta,
        flavor,
      }),
    );
  }
  if (landed.terminal || landed.age === spec.meta.ageEnd) {
    next = {
      ...next,
      phase: "ended",
      log: next.log.concat(
        baseEntry(next, landed, {
          t: "end",
          note: "Working life ends at 68.",
        }),
      ),
    };
  } else {
    next = { ...next, phase: "play", pendingChoiceId: null };
  }
  return next;
}

function endDeath(spec, state, age, q) {
  const space = currentSpace(spec, state);
  const band = deathBand(spec, age);
  const custom = spec.mortality.perSquare?.[space.id];
  const animation = custom || band.animation;
  const death = { age, q, band: band.id, animation };
  const next = { ...state, phase: "ended", death };
  return {
    ...next,
    log: state.log.concat(baseEntry(next, space, {
      t: "death",
      q,
      band: band.id,
      animation,
      note: "The wedge.",
    })),
  };
}

export function spin(spec, state) {
  if (state.phase !== "play") throw new Error("Cannot spin right now");
  const drawn = nextUnit(state.spinState);
  const stepped = { ...state, spinState: drawn.state };
  if (!isEntirety(state)) {
    return applyRoll(spec, stepped, 1 + Math.floor(drawn.unit * 10));
  }
  const age = currentSpace(spec, state).age;
  const q = deathProbability(spec, age, triangleRates(spec, state.point).axis.h);
  const outcome = outcomeFromUnit(drawn.unit, q);
  if (outcome.death) return endDeath(spec, stepped, age, q);
  return applyRoll(spec, stepped, outcome.roll);
}

export function resolveChoice(spec, state, accept) {
  if (state.phase !== "choice") throw new Error("No choice is waiting");
  const space = track(spec, state.path)[state.index];
  if (space.id !== state.pendingChoiceId) throw new Error("Choice mismatch");
  let cash = state.cash;
  let salary = state.salary;
  let fateState = state.fateState;
  let fate = null;
  let cashDelta = 0;
  let salaryDelta = 0;
  let spent = 0;
  const rates = ratesFor(spec, state);
  if (accept) {
    const applied = applyEffects(cash, salary, space.choice.yes, rates);
    cash = applied.cash;
    salary = applied.salary;
    cashDelta += applied.cashDelta;
    salaryDelta += applied.salaryDelta;
    if (applied.cashDelta < 0) spent -= applied.cashDelta;
    if (space.choice.fate) {
      const drawn = nextUnit(fateState);
      fateState = drawn.state;
      const success = drawn.unit < space.choice.fate.p;
      fate = success ? "success" : "fail";
      const bonus = success ? space.choice.fate.successCash : space.choice.fate.failCash;
      cash += bonus || 0;
      cashDelta += bonus || 0;
      if ((bonus || 0) < 0) spent -= bonus || 0;
    }
  }
  const lived = takeLiving(spec, cash, (state.expenses || 0) + spent, salary, rates, isEntirety(state));
  cash = lived.cash;
  let next = {
    ...state,
    cash,
    salary,
    expenses: lived.expenses,
    fateState,
    phase: space.terminal ? "ended" : "play",
    pendingChoiceId: null,
  };
  next = {
    ...next,
    log: state.log.concat(
      baseEntry(next, space, {
        t: "decision",
        choice: space.id,
        value: accept ? "yes" : "no",
        fate,
        cashDelta,
        salaryDelta,
      }),
    ),
  };
  if (space.terminal) {
    next = {
      ...next,
      phase: "ended",
      log: next.log.concat(baseEntry(next, space, { t: "end", note: "Working life ends at 68." })),
    };
  }
  return next;
}

export function currentSpace(spec, state) {
  if (!state.path || state.index < 0) return null;
  return track(spec, state.path)[state.index];
}

export function toneCounts(spaces) {
  const counts = { good: 0, bad: 0, neutral: 0 };
  for (const space of spaces) counts[space.tone] += 1;
  return counts;
}
