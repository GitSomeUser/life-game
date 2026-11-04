/**
 * Accumulation simulation. Reads spec/accumulation.json.
 * Spins, reviews, the operation, and flavor cards use separate streams.
 * An investment rolls a fresh chance each landing. It is not on those streams.
 * The triangle sets income, the spending rate, and the death blend.
 * Weights are inverse distance to the vertices.
 * Life$pan+ pays 4% a year on positive savings and charges 4% when savings are negative.
 * Decumulation is not in this version.
 * Death is on the spin stream, so answers do not move the wedge.
 * Life and Life$pan ignore the triangle, the wedge, and borrowing.
 * Life$pan and Life$pan+ turn former paydays into a review.
 * The climb is ages 18-68 only. There is no downslope.
 */

const KINDS = new Set(["event", "payday", "stop", "choice"]);
const TONES = new Set(["good", "bad", "neutral"]);
const GAME_MODES = ["life", "lifespan", "lifespan-plus"];
const SHARED_REVIEW_IDS = ["temp-bonus", "temp-cut", "promo", "expenses", "stay"];

export function isSpanPlus(state) {
  return state?.mode === "lifespan-plus";
}

export function isYearMode(state) {
  return state?.mode === "lifespan" || state?.mode === "lifespan-plus";
}

export function isEntirety(state) {
  return isSpanPlus(state);
}

function normalizeMode(mode) {
  if (mode === undefined) return "lifespan-plus";
  if (mode === null || mode === "") return null;
  if (mode === "entirety") return "lifespan-plus";
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
  if (ageStart !== 18 || ageEnd !== 68) errors.push("age range must be 18-68");
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
  const review = spec.meta.review;
  if (!review) errors.push("missing review");
  else {
    for (const key of ["shift", "tempPay", "permanentPromo", "expenseBump", "promoFloor"]) {
      if (!Number.isFinite(review[key]) || review[key] <= 0 || review[key] > 1) {
        errors.push(`review ${key} must be a fraction above 0`);
      }
    }
    const tables = {
      lifespan: ["big-bonus", "demo", ...SHARED_REVIEW_IDS],
      "lifespan-plus": ["closer", "away", ...SHARED_REVIEW_IDS],
    };
    for (const [mode, ids] of Object.entries(tables)) {
      const bands = review[mode]?.bands || [];
      const sum = bands.reduce((total, band) => total + band.count, 0);
      if (sum !== 100) errors.push(`${mode} review bands sum to ${sum}, expected 100`);
      const seen = new Set();
      for (const band of bands) {
        if (!ids.includes(band.id)) errors.push(`${mode} unknown review ${band.id}`);
        if (seen.has(band.id)) errors.push(`${mode} duplicate review ${band.id}`);
        seen.add(band.id);
        if (band.per !== 100) errors.push(`${mode} ${band.id} odds must be out of 100`);
        if (!band.label) errors.push(`${mode} ${band.id} missing odds label`);
      }
      for (const id of ids) {
        if (!seen.has(id)) errors.push(`${mode} missing review ${id}`);
      }
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
  const center = 1 / 3;
  const rates = isEntirety(state)
    ? triangleRates(spec, state.point)
    : {
      h: center,
      w: center,
      f: center,
      position: { h: center, w: center, f: center },
      axis: { h: 0, w: 0, f: 0 },
      income: 1,
      spend: spec.meta.triangle.spendCenter,
      healthCost: 1,
    };
  const adj = spec.meta.spendAdjust?.[state.mode];
  if (!Number.isFinite(adj) || adj === 0) return rates;
  const spend = Math.min(0.95, Math.max(0.05, rates.spend + adj));
  return { ...rates, spend };
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
  const centerRates = ratesFor(spec, { ...state, point: centerPoint() });
  const centerBill = annualExpenses(centerIncome, centerRates, spec);
  const spending = annual;
  const borrowing = isSpanPlus(state) ? borrowingCharge(state.cash, spec) : 0;
  const interest = isSpanPlus(state) ? savingsInterest(state.cash, spec) : 0;
  const extra = Math.round(income * (state.expenseLoad || 0));
  const spendingWithLoad = spending + extra;
  const bill = spendingWithLoad + borrowing;
  const death = deathProbability(spec, age, rates.axis.h);
  const deathCenter = deathProbability(spec, age, 0);
  const qi = age - spec.meta.ageStart;
  return {
    savings: state.cash,
    income,
    monthly,
    annual: bill,
    spending: spendingWithLoad,
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

let investRandom = Math.random;

export function setInvestRandom(fn) {
  investRandom = typeof fn === "function" ? fn : Math.random;
}

export function drawInvestChance(random = investRandom) {
  return (1 + Math.floor(random() * 8)) / 10;
}

function workStakeOf(spec, mode) {
  const stake = spec?.meta?.workStake;
  if (Number.isFinite(stake)) return stake;
  if (stake && Number.isFinite(stake[mode])) return stake[mode];
  return 0;
}

export function choiceCost(spec, effect, mode) {
  return moneyEffect(effect, mode, spec);
}

export function choiceFail(spec, fate, mode) {
  if (!fate) return 0;
  if (mode === "life" && Number.isFinite(fate.lifeFailCash)) return fate.lifeFailCash;
  return cashMul(spec, mode, fate.failCash || 0, "neg");
}

export function choiceRaise(spec, effect, mode) {
  return salaryDeltaOf(effect, mode, spec);
}

export function openingFigures(spec, mode) {
  const studyOpen = spec.paths.study.spaces[0];
  const studyJob = spec.paths.study.spaces[3];
  const workJob = spec.paths.work.spaces[0];
  const stake = mode === "life"
    ? (Number.isFinite(workJob.lifeCash) ? workJob.lifeCash : 0)
    : workStakeOf(spec, mode);
  return {
    tuition: Math.abs(moneyEffect(studyOpen, mode, spec)),
    studyPay: salarySetOf(studyJob, mode, spec) || 0,
    workPay: salarySetOf(workJob, mode, spec) || 0,
    workStart: spec.meta.startingCash + stake,
  };
}

function cashMul(spec, mode, amount, key) {
  if (!amount || mode === "life") return amount || 0;
  const row = spec?.meta?.cashScale?.[mode];
  const mul = key ? row?.[key] : (amount < 0 ? row?.neg : row?.pos);
  if (!Number.isFinite(mul) || mul === 1) return amount;
  return Math.round(amount * mul);
}

function moneyEffect(effect, mode, spec) {
  if (!effect) return 0;
  if (mode === "life" && Number.isFinite(effect.lifeCash)) return effect.lifeCash;
  if (mode !== "life" && Number.isFinite(effect.cardPay)) return cashMul(spec, mode, effect.cash || 0, "card");
  if (mode !== "life" && (effect.kind === "stop" || effect.id === "study-tuition")) return effect.cash || 0;
  return cashMul(spec, mode, effect.cash || 0);
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
    salaryBase: 0,
    payMod: 1,
    expenseLoad: 0,
    promoted: false,
    startingPay: 0,
    reviewState: (s ^ 0xa5a5f00d) >>> 0,
    expenses: 0,
    cardBalance: 0,
    point: parsePoint(point),
    phase: "choose",
    pendingChoiceId: null,
    investOffer: null,
    lastChoice: null,
    death: null,
    log: [],
  };
}

function payMul(spec, mode) {
  const mul = spec?.meta?.payScale?.[mode];
  return Number.isFinite(mul) ? mul : 1;
}

function salarySetOf(effect, mode, spec) {
  if (!effect) return null;
  if (mode === "life" && Number.isFinite(effect.lifeSalarySet)) return effect.lifeSalarySet;
  if (mode === "lifespan" && Number.isFinite(effect.spanSalarySet)) return effect.spanSalarySet;
  if (mode === "lifespan-plus" && Number.isFinite(effect.plusSalarySet)) return effect.plusSalarySet;
  if (effect.salarySet == null) return null;
  return Math.round(effect.salarySet * payMul(spec, mode));
}

function salaryDeltaOf(effect, mode, spec) {
  if (!effect) return 0;
  if (mode === "life" && Number.isFinite(effect.lifeSalaryDelta)) return effect.lifeSalaryDelta;
  if (mode === "lifespan" && Number.isFinite(effect.spanSalaryDelta)) return effect.spanSalaryDelta;
  if (mode === "lifespan-plus" && Number.isFinite(effect.plusSalaryDelta)) return effect.plusSalaryDelta;
  return Math.round((effect.salaryDelta || 0) * payMul(spec, mode));
}

function applyEffects(cash, salary, effect, rates, salaryBase = 0, mode = null, spec = null) {
  if (!effect) return { cash, salary, salaryBase, cashDelta: 0, salaryDelta: 0, salarySet: null };
  const income = rates?.income ?? 1;
  let cashDelta = 0;
  let salaryDelta = 0;
  let salarySet = null;
  const set = salarySetOf(effect, mode, spec);
  if (set != null) {
    salary = scaleIncome(set, income);
    salaryBase = set;
    salarySet = set;
  }
  const rawDelta = salaryDeltaOf(effect, mode, spec);
  if (rawDelta) {
    const delta = scaleIncome(rawDelta, income);
    salary += delta;
    salaryDelta = delta;
    salaryBase += rawDelta;
  }
  const hit = moneyEffect(effect, mode, spec);
  if (hit) {
    cash += hit;
    cashDelta = hit;
  }
  return { cash, salary, salaryBase, cashDelta, salaryDelta, salarySet };
}

function settleYear(spec, cash, expenses, salary, rates, mode, expenseLoad = 0) {
  const idle = { cash, expenses: expenses || 0, pay: 0, bill: 0, gap: 0, borrow: 0, interest: 0 };
  if (mode !== "lifespan" && mode !== "lifespan-plus") return idle;
  const pay = salary || 0;
  const bill = annualExpenses(pay, rates, spec) + Math.round(pay * (expenseLoad || 0));
  let next = cash + pay - bill;
  let spent = (expenses || 0) + bill;
  let interest = 0;
  let borrow = 0;
  if (mode === "lifespan-plus") {
    interest = savingsInterest(next, spec);
    borrow = borrowingCharge(next, spec);
    next = next + interest - borrow;
    spent += borrow;
  }
  return { cash: next, expenses: spent, pay, bill, gap: 0, borrow, interest };
}

export function freshSeed(now, nonce, previous = 0) {
  const time = Number(now) >>> 0;
  const n = Number(nonce) >>> 0;
  let seed = (Math.imul(time ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(n ^ 0x85ebca6b, 0xc2b2ae35)) >>> 0;
  if (!seed) seed = 1;
  const prev = Number(previous) >>> 0;
  if (seed === prev) seed = (seed + 1 + (n & 0xffff)) >>> 0 || 1;
  return seed;
}

function stepCards(spec, balance, space, mode) {
  const rate = mode === "life" && Number.isFinite(spec.meta.lifeCardRate) ? spec.meta.lifeCardRate : (spec.meta.cardRate || 0);
  const rawStart = mode === "life" && Number.isFinite(space.lifeCardStart) ? space.lifeCardStart : (space.cardStart || 0);
  const start = mode === "life" ? rawStart : cashMul(spec, mode, rawStart, "card");
  let next = balance || 0;
  if (space.card === "open") next += start;
  else if (next > 0) next = Math.round(next * (1 + rate));
  if (space.card === "stack" && next > 0) next += space.cardAdd || 0;
  if (space.card === "due") return { balance: 0, paid: next };
  return { balance: next, paid: 0 };
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
    ? { cash: state.cash, salary: state.salary, salaryBase: state.salaryBase || 0, cashDelta: 0, salaryDelta: 0, salarySet: null }
    : applyEffects(state.cash, state.salary, space, ratesFor(spec, state), state.salaryBase || 0, state.mode, spec);
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
  const salaryBase = settled.applied.salaryBase ?? next.salaryBase ?? 0;
  const startingPay = next.startingPay || settled.applied.salarySet || 0;
  let stake = 0;
  if (pathName === "work" && (next.mode === "lifespan" || next.mode === "lifespan-plus")) {
    stake = workStakeOf(spec, next.mode);
  }
  const lived = settleYear(
    spec,
    settled.applied.cash + stake,
    charge(next.expenses, settled.applied.cashDelta),
    settled.applied.salary,
    rates,
    next.mode,
    next.expenseLoad || 0,
  );
  next = {
    ...next,
    cash: lived.cash,
    salary: settled.applied.salary,
    salaryBase,
    startingPay,
    expenses: lived.expenses,
    flavorState: settled.flavorState,
    phase: space.terminal ? "ended" : "play",
  };
  return {
    ...next,
    log: next.log.concat(
      baseEntry(next, space, {
        t: "resolve",
        cashDelta: settled.applied.cashDelta + stake,
        salaryDelta: settled.applied.salaryDelta,
        livingGap: lived.gap,
        yearPay: lived.pay,
        yearBill: lived.bill,
        flavor: settled.flavor,
      }),
    ),
  };
}

export function reviewBands(spec, mode) {
  const table = mode === "lifespan" ? spec.meta.review.lifespan : spec.meta.review["lifespan-plus"];
  if (!table?.bands) throw new Error("Missing review odds for this mode");
  return table.bands;
}

export function reviewFromUnit(spec, unit, mode = "lifespan-plus") {
  const bands = reviewBands(spec, mode);
  const ticket = Math.floor(unit * 100);
  if (!Number.isFinite(ticket) || ticket < 0 || ticket > 99) throw new Error("Review draw is out of range");
  let cursor = 0;
  for (const band of bands) {
    cursor += band.count;
    if (ticket < cursor) return band;
  }
  return bands[bands.length - 1];
}

function shiftWork(point, delta) {
  const current = parsePoint(point);
  let w = current.w + delta;
  if (w < 0) w = 0;
  if (w > 1) w = 1;
  const rest = 1 - w;
  const other = current.h + current.f;
  if (other <= 1e-12) return { h: rest / 2, w, f: rest / 2 };
  return {
    h: rest * (current.h / other),
    w,
    f: rest * (current.f / other),
  };
}

function raisePay(salary, salaryBase, rate) {
  return {
    salary: Math.round(salary * (1 + rate)),
    salaryBase: Math.round(salaryBase * (1 + rate)),
  };
}

function lowerPay(salary, salaryBase, startingPay, rate, floorRate) {
  const floor = Math.round((startingPay || 0) * floorRate);
  let nextSalary = Math.round(salary * (1 - rate));
  let nextBase = Math.round((salaryBase || 0) * (1 - rate));
  let held = false;
  if (startingPay && nextSalary < floor) {
    held = true;
    if (salary > 0) nextBase = Math.round((salaryBase || 0) * (floor / salary));
    else nextBase = floor;
    nextSalary = floor;
  }
  return { salary: nextSalary, salaryBase: nextBase, held };
}

export function applyReview(spec, state, unit) {
  const band = reviewFromUnit(spec, unit, state.mode);
  const table = spec.meta.review;
  let cash = state.cash;
  let salary = state.salary || 0;
  let salaryBase = state.salaryBase || 0;
  let payMod = state.payMod ?? 1;
  let point = state.point;
  let expenseLoad = state.expenseLoad || 0;
  let promoted = Boolean(state.promoted);
  const startingPay = state.startingPay || 0;
  if (!salaryBase && salary && state.mode !== "lifespan-plus") salaryBase = salary;
  let held = false;
  let expenseAdded = 0;
  const beforeCash = cash;
  const beforeSalary = salary;
  if (band.id === "closer") {
    point = shiftWork(point, table.shift);
  } else if (band.id === "away") {
    point = shiftWork(point, -table.shift);
  } else if (band.id === "big-bonus" && salaryBase > 0) {
    cash += Math.round(beforeSalary * table.tempPay);
    const raised = raisePay(salary, salaryBase, table.permanentPromo);
    salary = raised.salary;
    salaryBase = raised.salaryBase;
    promoted = true;
  } else if (band.id === "demo" && salaryBase > 0) {
    expenseAdded = Math.round(beforeSalary * table.expenseBump);
    cash -= expenseAdded;
    const lowered = lowerPay(salary, salaryBase, startingPay, table.permanentPromo, table.promoFloor);
    salary = lowered.salary;
    salaryBase = lowered.salaryBase;
    held = lowered.held;
  } else if (band.id === "temp-bonus") {
    cash += Math.round(salary * table.tempPay);
  } else if (band.id === "temp-cut") {
    cash -= Math.round(salary * table.tempPay);
  } else if (band.id === "promo" && salaryBase > 0) {
    const raised = raisePay(salary, salaryBase, table.permanentPromo);
    salary = raised.salary;
    salaryBase = raised.salaryBase;
    promoted = true;
  } else if (band.id === "expenses") {
    expenseLoad += table.expenseBump;
    expenseAdded = Math.round(beforeSalary * table.expenseBump);
  }
  return {
    cash,
    salary,
    salaryBase,
    payMod,
    point,
    expenseLoad,
    promoted,
    startingPay,
    held,
    band,
    expenseAdded,
    cashDelta: cash - beforeCash,
  };
}

export function applyRoll(spec, state, roll) {
  if (state.phase !== "play") throw new Error("Cannot spin right now");
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) throw new Error("Roll must be 1-10");
  const spaces = track(spec, state.path);
  const from = spaces[state.index];
  let steps = roll;
  let i = state.index;
  while (steps > 0 && i < spaces.length - 1) {
    i += 1;
    const space = spaces[i];
    if (space.kind === "stop" || i === spaces.length - 1) steps = 0;
    else steps -= 1;
  }
  const moved = i - state.index;
  const discarded = roll - moved;
  let cash = state.cash;
  let salary = state.salary;
  let salaryBase = state.salaryBase || 0;
  let expenses = state.expenses || 0;
  let flavorState = state.flavorState;
  let flavor = null;
  let cashDelta = 0;
  let salaryDelta = 0;
  let living = 0;
  let point = state.point;
  let payMod = state.payMod ?? 1;
  let expenseLoad = state.expenseLoad || 0;
  let reviewState = state.reviewState;
  let promoted = Boolean(state.promoted);
  let startingPay = state.startingPay || 0;
  const reviews = [];
  const paydayAges = [];
  let paydayCash = 0;
  let yearPay = 0;
  let yearBill = 0;
  let cardBalance = state.cardBalance || 0;
  let cardPaid = 0;
  const view = () => ({
    ...state,
    cash,
    salary,
    salaryBase,
    point,
    payMod,
    expenseLoad,
    promoted,
    startingPay,
    flavorState,
  });

  for (let n = 1; n <= moved; n += 1) {
    const space = spaces[state.index + n];
    const landing = n === moved;
    if (space.kind === "payday") {
      paydayAges.push(space.age);
      if (!isYearMode(state)) {
        cash += salary;
        paydayCash += salary;
      } else {
        const drawn = nextUnit(reviewState);
        reviewState = drawn.state;
        const beforeSalary = salary;
        const applied = applyReview(spec, view(), drawn.unit);
        cash = applied.cash;
        salary = applied.salary;
        salaryBase = applied.salaryBase;
        point = applied.point;
        payMod = applied.payMod;
        expenseLoad = applied.expenseLoad;
        promoted = applied.promoted;
        reviews.push({
          age: space.age,
          spaceId: space.id,
          id: applied.band.id,
          label: applied.band.label,
          cashDelta: applied.cashDelta,
          expenseAdded: applied.expenseAdded,
          salaryBefore: beforeSalary,
          salaryAfter: applied.salary,
          payMod: applied.payMod,
          held: applied.held,
        });
      }
    }
    if (landing && space.kind !== "choice" && space.kind !== "payday") {
      const settled = settleLanding(spec, view(), space);
      cash = settled.applied.cash;
      salary = settled.applied.salary;
      salaryBase = settled.applied.salaryBase ?? salaryBase;
      if (!startingPay && settled.applied.salarySet) startingPay = settled.applied.salarySet;
      cashDelta = settled.applied.cashDelta;
      salaryDelta = settled.applied.salaryDelta;
      flavor = settled.flavor;
      flavorState = settled.flavorState;
      expenses = charge(expenses, cashDelta);
    }
    const cards = stepCards(spec, cardBalance, space, state.mode);
    cardBalance = cards.balance;
    if (cards.paid) {
      cash -= cards.paid;
      expenses += cards.paid;
      cardPaid += cards.paid;
    }
    const year = settleYear(spec, cash, expenses, salary, ratesFor(spec, view()), state.mode, expenseLoad);
    cash = year.cash;
    expenses = year.expenses;
    living += year.gap;
    yearPay += year.pay;
    yearBill += year.bill;
  }
  const landed = spaces[i];
  let next = {
    ...state,
    index: i,
    cash,
    salary,
    salaryBase,
    expenses,
    flavorState,
    point,
    payMod,
    expenseLoad,
    reviewState,
    promoted,
    startingPay,
    cardBalance,
    lastChoice: null,
    investOffer: null,
  };
  const spinEntry = baseEntry(
    { ...next, log: state.log },
    landed,
    {
      t: "spin",
      roll,
      fromAge: from.age,
      toAge: landed.age,
      moved,
      discarded,
      paydayAges,
      paydayCash,
      yearPay,
      yearBill,
      cardPaid,
      cardBalance,
      reviews,
      livingGap: living,
      cash,
      salary,
    },
  );
  next.log = state.log.concat(spinEntry);

  if (landed.kind === "choice") {
    const stake = landed.choice?.invest;
    const offer = Number.isFinite(stake)
      ? { spaceId: landed.id, stake, p: drawInvestChance() }
      : null;
    return { ...next, phase: "choice", pendingChoiceId: landed.id, investOffer: offer };
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
  let salaryBase = state.salaryBase || 0;
  let startingPay = state.startingPay || 0;
  let fateState = state.fateState;
  let fate = null;
  let cashDelta = 0;
  let salaryDelta = 0;
  let spent = 0;
  let cardBalance = state.cardBalance || 0;
  const rates = ratesFor(spec, state);
  if (accept) {
    const applied = applyEffects(cash, salary, space.choice.yes, rates, salaryBase, state.mode, spec);
    cash = applied.cash;
    salary = applied.salary;
    salaryBase = applied.salaryBase;
    if (!startingPay && applied.salarySet) startingPay = applied.salarySet;
    cashDelta += applied.cashDelta;
    salaryDelta += applied.salaryDelta;
    if (applied.cashDelta < 0) spent -= applied.cashDelta;
    const yes = space.choice.yes || {};
    const rawCardPay = state.mode === "life" && Number.isFinite(yes.lifeCardPay) ? yes.lifeCardPay : yes.cardPay;
    const cardPay = state.mode === "life" ? rawCardPay : cashMul(spec, state.mode, rawCardPay || 0, "card");
    if (cardPay) cardBalance = Math.max(0, cardBalance - cardPay);
  }
  let chance = null;
  const offer = state.investOffer && state.investOffer.spaceId === space.id ? state.investOffer : null;
  if (offer) {
    chance = offer.p;
    if (accept) {
      const stake = offer.stake;
      cash -= stake;
      cashDelta -= stake;
      spent += stake;
      const success = investRandom() < offer.p;
      fate = success ? "success" : "fail";
      if (success) {
        const doubled = stake * 2;
        cash += doubled;
        cashDelta += doubled;
      }
    }
  }
  const fateOn = space.choice.fate?.when || "yes";
  const runFate = !offer && space.choice.fate && (fateOn === "always" || (fateOn === "yes" && accept) || (fateOn === "no" && !accept));
  if (runFate) {
    const drawn = nextUnit(fateState);
    fateState = drawn.state;
    const success = drawn.unit < space.choice.fate.p;
    fate = success ? "success" : "fail";
    const rawFail = state.mode === "life" && Number.isFinite(space.choice.fate.lifeFailCash)
      ? space.choice.fate.lifeFailCash
      : space.choice.fate.failCash;
    const failCash = state.mode === "life" ? rawFail : cashMul(spec, state.mode, rawFail || 0, "neg");
    const bonus = success ? space.choice.fate.successCash : failCash;
    cash += bonus || 0;
    cashDelta += bonus || 0;
    if ((bonus || 0) < 0) spent -= bonus || 0;
  }
  let next = {
    ...state,
    cash,
    salary,
    salaryBase,
    startingPay,
    cardBalance,
    expenses: (state.expenses || 0) + spent,
    fateState,
    phase: space.terminal ? "ended" : "play",
    pendingChoiceId: null,
    investOffer: null,
    lastChoice: { spaceId: space.id, accept, chance },
  };
  next = {
    ...next,
    log: state.log.concat(
      baseEntry(next, space, {
        t: "decision",
        choice: space.id,
        value: accept ? "yes" : "no",
        fate,
        chance,
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
