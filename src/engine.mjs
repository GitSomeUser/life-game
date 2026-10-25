/**
 * Accumulation simulation. Reads spec/accumulation.json.
 * Deterministic: spins, risky choices, and flavor cards use separate streams.
 * Levers, when set, scale income and expenses. Lifespan, interest, mortality,
 * and retirement decisions are not in this version.
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
  const levers = spec.meta.levers;
  if (levers) {
    for (const name of ["health", "work", "frugality"]) {
      const row = levers[name];
      if (!row) errors.push(`missing lever ${name}`);
      else {
        for (const key of ["incomeBps", "expenseBps", "happinessBps"]) {
          if (!Number.isInteger(row[key]) || row[key] < 0) errors.push(`${name} ${key} must be a basis point count`);
        }
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return spec;
}

export function parseLevers(raw) {
  if (raw == null) return null;
  const health = raw.health;
  const work = raw.work;
  const frugality = raw.frugality;
  for (const n of [health, work, frugality]) {
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      throw new Error("Lever shares are whole numbers from 0 to 100");
    }
  }
  if (health + work + frugality !== 100) throw new Error("Lever shares must add to 100");
  return { health, work, frugality };
}

export function multipliers(spec, state) {
  const levers = state?.levers;
  const table = spec.meta.levers;
  if (!levers || !table) return { income: 10000, expense: 10000, happiness: 10000 };
  const blend = (key) => Math.round(
    (levers.health * table.health[key] + levers.work * table.work[key] + levers.frugality * table.frugality[key]) / 100,
  );
  return { income: blend("incomeBps"), expense: blend("expenseBps"), happiness: blend("happinessBps") };
}

export function portraitStats(spec, state) {
  const mult = multipliers(spec, state);
  return {
    savings: Math.max(state.cash, 0),
    expenses: state.expenses || 0,
    income: state.salary,
    happiness: Math.round(mult.happiness / 100),
    incomeBps: mult.income,
    expenseBps: mult.expense,
  };
}

function scale(amount, bps) {
  if (!amount) return 0;
  return Math.round((amount * bps) / 10000);
}

function nextUnit(a) {
  let x = a | 0;
  x = (x + 0x6d2b79f5) | 0;
  let t = Math.imul(x ^ (x >>> 15), 1 | x);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { state: x >>> 0, unit: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

export function createGame(spec, seed, levers) {
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
    levers: parseLevers(levers),
    phase: "choose",
    pendingChoiceId: null,
    log: [],
  };
}

function applyEffects(cash, salary, effect, mult) {
  if (!effect) return { cash, salary, cashDelta: 0, salaryDelta: 0 };
  const income = mult?.income ?? 10000;
  const expense = mult?.expense ?? 10000;
  let cashDelta = 0;
  let salaryDelta = 0;
  if (effect.salarySet != null) salary = scale(effect.salarySet, income);
  if (effect.salaryDelta) {
    const delta = scale(effect.salaryDelta, income);
    salary += delta;
    salaryDelta = delta;
  }
  if (effect.cash) {
    const delta = scale(effect.cash, effect.cash < 0 ? expense : income);
    cash += delta;
    cashDelta = delta;
  }
  return { cash, salary, cashDelta, salaryDelta };
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
    : applyEffects(state.cash, state.salary, space, multipliers(spec, state));
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
  next = {
    ...next,
    cash: settled.applied.cash,
    salary: settled.applied.salary,
    expenses: charge(next.expenses, settled.applied.cashDelta),
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
  const salary = state.salary;
  let paydayCash = 0;
  for (const _p of paydays) {
    cash += salary;
    paydayCash += salary;
  }
  const landed = spaces[i];
  let next = {
    ...state,
    index: i,
    cash,
    salary,
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
      cash,
      salary,
    },
  );
  next.log = state.log.concat(spinEntry);

  if (landed.kind === "choice") {
    return { ...next, phase: "choice", pendingChoiceId: landed.id };
  }
  if (landed.kind !== "payday") {
    const settled = settleLanding(spec, next, landed);
    next = {
      ...next,
      cash: settled.applied.cash,
      salary: settled.applied.salary,
      expenses: charge(next.expenses, settled.applied.cashDelta),
      flavorState: settled.flavorState,
    };
    next.log = next.log.concat(
      baseEntry(next, landed, {
        t: "resolve",
        cashDelta: settled.applied.cashDelta,
        salaryDelta: settled.applied.salaryDelta,
        flavor: settled.flavor,
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

export function spin(spec, state) {
  if (state.phase !== "play") throw new Error("Cannot spin right now");
  const drawn = nextUnit(state.spinState);
  const roll = 1 + Math.floor(drawn.unit * 10);
  return applyRoll(spec, { ...state, spinState: drawn.state }, roll);
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
  if (accept) {
    const mult = multipliers(spec, state);
    const applied = applyEffects(cash, salary, space.choice.yes, mult);
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
      const scaled = scale(bonus || 0, (bonus || 0) < 0 ? mult.expense : mult.income);
      cash += scaled;
      cashDelta += scaled;
      if (scaled < 0) spent -= scaled;
    }
  }
  let next = {
    ...state,
    cash,
    salary,
    expenses: (state.expenses || 0) + spent,
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
