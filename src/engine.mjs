/**
 * Accumulation simulation. Reads spec/accumulation.json.
 * Deterministic: spins, risky choices, and flavor cards use separate streams.
 * The triangle sets income, the spending rate, and mortality.
 * Interest and decumulation are not in this version.
 * Death is on the spin stream, so answers do not move the wedge.
 */

const KINDS = new Set(["event", "payday", "stop", "choice"]);
const TONES = new Set(["good", "bad", "neutral"]);

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
  const triangle = spec.meta.triangle;
  if (!triangle) errors.push("missing triangle");
  else {
    for (const key of ["incomePerAxis", "spendCenter", "spendPerAxis", "healthCostShare", "mortalityAbove", "mortalityBelow", "healthCostAbove", "healthCostBelow"]) {
      if (!Number.isFinite(triangle[key]) || triangle[key] < 0) errors.push(`triangle ${key} must be a number`);
    }
  }
  const mortality = spec.mortality;
  if (!mortality?.longer?.q || !mortality?.shorter?.q) errors.push("missing mortality series");
  else {
    const span = ageEnd - ageStart + 1;
    for (const name of ["longer", "shorter"]) {
      const series = mortality[name].q;
      if (series.length !== span) errors.push(`${name} q has ${series.length} rates, expected ${span}`);
      series.forEach((q, i) => {
        if (!Number.isFinite(q) || q <= 0 || q > 1) errors.push(`${name} q at ${ageStart + i} must be a death probability above 0`);
      });
    }
    if (mortality.longer.q.length === mortality.shorter.q.length) {
      mortality.longer.q.forEach((q, i) => {
        if (!(mortality.shorter.q[i] > q)) errors.push(`shorter q at ${ageStart + i} must be above the longer table`);
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

export function triangleRates(spec, point) {
  const weights = parsePoint(point);
  const table = spec.meta.triangle;
  const h = axis(weights.h);
  const w = axis(weights.w);
  const f = axis(weights.f);
  const income = 1 + table.incomePerAxis * w;
  const spend = table.spendCenter - table.spendPerAxis * f;
  const mortality = h >= 0
    ? 1 - table.mortalityAbove * h
    : 1 + table.mortalityBelow * -h;
  const healthCost = h >= 0
    ? 1 - table.healthCostAbove * h
    : 1 + table.healthCostBelow * -h;
  return { h: weights.h, w: weights.w, f: weights.f, axis: { h, w, f }, income, spend, mortality, healthCost };
}

export function budgetFactor(spec, rates) {
  const share = spec.meta.triangle.healthCostShare;
  return rates.spend * ((1 - share) + share * rates.healthCost);
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

export function deathProbability(spec, age, mortalityMultiplier = 1) {
  const q = spec.mortality.longer.q[age - spec.meta.ageStart];
  if (!Number.isFinite(q)) throw new Error(`No death probability at ${age}`);
  return Math.min(1, q * mortalityMultiplier);
}

export function lifeExpectancy(spec, age, mortalityMultiplier = 1) {
  let surv = 1;
  let years = 0;
  for (let a = age; a < spec.meta.ageEnd; a += 1) {
    surv *= 1 - deathProbability(spec, a, mortalityMultiplier);
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
  const rates = triangleRates(spec, state.point);
  const age = currentSpace(spec, state)?.age ?? spec.meta.ageStart;
  const income = state.salary;
  const annual = annualExpenses(income, rates, spec);
  const monthly = Math.round(annual / 12);
  const base = rates.income ? income / rates.income : 0;
  const centerIncome = Math.round(base);
  const centerRates = triangleRates(spec, centerPoint());
  const centerMonthly = Math.round(annualExpenses(centerIncome, centerRates, spec) / 12);
  const death = deathProbability(spec, age, rates.mortality);
  const deathCenter = deathProbability(spec, age, 1);
  return {
    savings: Math.max(state.cash, 0),
    income,
    monthly,
    annual,
    death,
    years: lifeExpectancy(spec, age, rates.mortality),
    incomeDelta: income - centerIncome,
    expenseDelta: monthly - centerMonthly,
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

export function createGame(spec, seed, point) {
  validate(spec);
  const s = seed >>> 0;
  return {
    seed: s,
    spinState: s,
    fateState: (s ^ 0xa5a5a5a5) >>> 0,
    flavorState: (s ^ 0x0f1a70c5) >>> 0,
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

function takeLiving(spec, cash, expenses, salary, rates) {
  const gap = livingGap(spec, salary, rates);
  return {
    cash: cash + gap,
    expenses: (expenses || 0) + (gap < 0 ? -gap : 0),
    gap,
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
    : applyEffects(state.cash, state.salary, space, triangleRates(spec, state.point));
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
  const lived = takeLiving(
    spec,
    settled.applied.cash,
    charge(next.expenses, settled.applied.cashDelta),
    settled.applied.salary,
    triangleRates(spec, next.point),
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
  const rates = triangleRates(spec, state.point);
  let paydayCash = 0;
  for (const _p of paydays) {
    cash += salary;
    paydayCash += salary;
  }
  for (let n = 1; n < moved; n += 1) {
    const year = takeLiving(spec, cash, expenses, salary, rates);
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
    const year = takeLiving(spec, cash, expenses, salary, rates);
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
  const age = currentSpace(spec, state).age;
  const q = deathProbability(spec, age, triangleRates(spec, state.point).mortality);
  const drawn = nextUnit(state.spinState);
  const stepped = { ...state, spinState: drawn.state };
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
  const rates = triangleRates(spec, state.point);
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
  const lived = takeLiving(spec, cash, (state.expenses || 0) + spent, salary, rates);
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
