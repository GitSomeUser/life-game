import assert from "node:assert/strict";
import test from "node:test";
import spec from "../spec/accumulation.json" with { type: "json" };
import {
  annualExpenses,
  applyGutCheck,
  choiceCost,
  applyRoll,
  attributeWeights,
  axis,
  choosePath,
  freshSeed,
  createGame,
  currentSpace,
  deathProbability,
  gutCheckFromUnit,
  gutCheckOdds,
  isEntirety,
  lifeExpectancy,
  monthlyExpenses,
  outcomeFromUnit,
  portraitStats,
  resolveChoice,
  savingsInterest,
  setInvestRandom,
  drawInvestChance,
  spin,
  toneCounts,
  track,
  triangleRates,
  validate,
  weakGoal,
} from "../src/engine.mjs";

test("spec maps one space to each age from 18 through 68 on both paths", () => {
  validate(spec);
  for (const name of ["study", "work"]) {
    const ages = track(spec, name).map((s) => s.age);
    assert.deepEqual(ages, Array.from({ length: 51 }, (_, i) => 18 + i));
  }
});

test("study pays tuition immediately and sets salary only at the job stop", () => {
  const tuition = spec.paths.study.spaces[0].cash;
  const salary = spec.paths.study.spaces[3].plusSalarySet;
  let state = choosePath(spec, createGame(spec, 7), "study");
  const owed = spec.meta.startingCash + tuition;
  const borrow = Math.round(-owed * spec.meta.triangle.borrowingRate);
  assert.ok(owed < 0);
  assert.equal(state.cash, owed - borrow);
  assert.equal(state.salary, 0);
  assert.equal(currentSpace(spec, state).id, "study-tuition");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "study-role");
  assert.equal(state.salary, salary);
  assert.equal(spec.meta.studySalary, spec.paths.study.spaces[3].salarySet);
  assert.equal(state.phase, "play");
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.equal(spinEntry.discarded, 7);
});

test("work collects the early payday when passing it, then can raise only on a landing", () => {
  const job = spec.paths.work.spaces[0];
  const pay = job.lifeSalarySet;
  const raise = spec.paths.work.spaces[3].lifeSalaryDelta;
  const opened = spec.meta.startingCash + job.lifeCash;
  let state = choosePath(spec, createGame(spec, 3, undefined, "life"), "work");
  assert.equal(state.salary, pay);
  state = applyRoll(spec, state, 1);
  assert.equal(currentSpace(spec, state).age, 19);
  assert.equal(state.cash, opened + pay);
  const spun = state.log.find((e) => e.t === "spin");
  assert.equal(spun.paydayCash, pay);
  assert.equal(spun.gutChecks.length, 0);
  state = applyRoll(spec, state, 2);
  assert.equal(currentSpace(spec, state).id, "work-raise");
  assert.equal(state.salary, pay + raise);
});

test("a stop cuts the move and still pays salaries passed on the way", () => {
  const job = spec.paths.work.spaces[0];
  const pay = job.lifeSalarySet;
  const opened = spec.meta.startingCash + job.lifeCash;
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").lifeCash;
  let state = choosePath(spec, createGame(spec, 1, undefined, "life"), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  assert.equal(state.cash, opened + pay + pay + party);
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.deepEqual(spinEntry.paydayAges, [19, 23]);
  assert.equal(spinEntry.paydayCash, pay + pay);
  assert.equal(spinEntry.toAge, 26);
  assert.equal(state.phase, "play");
});

test("landing on a choice waits, and the same seed replays spins and fate", () => {
  setInvestRandom(() => 0.2);
  const play = (accept) => {
    let state = choosePath(spec, createGame(spec, 42), "study");
    const rolls = [];
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 80) {
      if (state.phase === "choice") state = resolveChoice(spec, state, accept);
      else {
        const before = state.log.length;
        state = spin(spec, state);
        const spun = state.log.slice(before).find((e) => e.t === "spin");
        if (spun) rolls.push(spun.roll);
      }
    }
    assert.equal(state.phase, "ended");
    assert.equal(currentSpace(spec, state).age, 68);
    return { state, rolls };
  };
  const yes = play(true);
  const no = play(false);
  assert.deepEqual(yes.rolls, no.rolls);
  assert.notEqual(yes.state.cash, no.state.cash);
  const again = play(true);
  assert.equal(again.state.cash, yes.state.cash);
  assert.deepEqual(again.state.log, yes.state.log);
  setInvestRandom(Math.random);
});

test("passing a payday then landing on a cost pays salary once and the cost once", () => {
  let state = choosePath(spec, createGame(spec, 9, undefined, "life"), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  state = applyRoll(spec, state, 3);
  assert.equal(currentSpace(spec, state).id, "child");
  const job = spec.paths.work.spaces[0];
  const pay = job.lifeSalarySet;
  const opened = spec.meta.startingCash + job.lifeCash;
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").lifeCash;
  const child = spec.paths.shared.spaces.find((s) => s.id === "child").lifeCash;
  const lastSpin = [...state.log].reverse().find((e) => e.t === "spin");
  assert.deepEqual(lastSpin.paydayAges, [28]);
  assert.equal(lastSpin.paydayCash, pay);
  assert.equal(state.cash, opened + pay + pay + party + pay + child);
});

test("the operation stays on the fate stream, and an investment does not", () => {
  let state = choosePath(spec, createGame(spec, 99), "work");
  const reach = (id) => {
    let guard = 0;
    while (currentSpace(spec, state).id !== id && guard++ < 80) {
      if (state.phase === "choice") state = resolveChoice(spec, state, false);
      else state = applyRoll(spec, state, 1);
    }
  };
  reach("quiet-56");
  assert.equal(currentSpace(spec, state).id, "quiet-56");
  assert.equal(state.phase, "choice");
  const after = resolveChoice(spec, state, false);
  assert.ok(after.log.at(-1).fate === "success" || after.log.at(-1).fate === "fail");
  const paid = resolveChoice(spec, state, true);
  assert.equal(paid.log.at(-1).fate, null);
  assert.equal(paid.fateState, state.fateState);
  assert.equal(paid.cash, state.cash + choiceCost(spec, currentSpace(spec, state).choice.yes, state.mode));
});

test("both paths reach 68 for several seeds and policies", () => {
  for (const seed of [1, 2, 3, 8, 21]) {
    for (const path of ["study", "work"]) {
      for (const accept of [true, false]) {
        let state = choosePath(spec, createGame(spec, seed), path);
        let guard = 0;
        while (state.phase !== "ended" && guard++ < 100) {
          state = state.phase === "choice" ? resolveChoice(spec, state, accept) : spin(spec, state);
        }
    assert.equal(state.phase, "ended", `${path} seed ${seed} accept ${accept}`);
    const end = state.death ? state.death.age : currentSpace(spec, state).age;
    assert.ok(state.death || end === 68, `${path} seed ${seed}`);
        assert.equal(Number.isFinite(state.cash), true);
        assert.equal(state.log[0].choice, "path");
      }
    }
  }
});

test("no-stakes years draw a flavor card and leave cash alone", () => {
  const locked = {
    "study-tuition": -124000,
    child: -52000,
    twins: -78000,
    partnership: -28000,
    home: -420000,
  };
  for (const [id, cash] of Object.entries(locked)) {
    const space = track(spec, "study").find((s) => s.id === id) || track(spec, "work").find((s) => s.id === id);
    assert.equal(space.cash, cash);
    assert.equal(space.flavor, undefined);
  }
  assert.equal(spec.paths.study.spaces[3].salarySet, 68000);
  assert.equal(spec.paths.study.spaces[3].lifeSalarySet, 165000);
  assert.equal(spec.paths.study.spaces[3].plusSalarySet, 100000);
  assert.equal(spec.paths.work.spaces[0].salarySet, 48000);
  assert.equal(spec.paths.work.spaces[0].lifeSalarySet, 125000);
  assert.equal(spec.paths.work.spaces[0].lifeCash, 300000);
  assert.equal(spec.paths.work.spaces[3].salaryDelta, 10000);
  assert.equal(spec.paths.work.spaces[3].lifeSalaryDelta, 15000);
  for (const id of ["study-nights", "quiet-37", "reunion", "farewell"]) {
    const space = track(spec, "study").find((s) => s.id === id);
    assert.equal(space.flavor, true);
    assert.equal(space.cash, undefined);
    assert.equal(space.kind, "event");
    assert.equal(space.tone, "neutral");
  }
  let state = choosePath(spec, createGame(spec, 5), "study");
  const before = state.cash;
  state = applyRoll(spec, state, 1);
  assert.equal(currentSpace(spec, state).id, "study-nights");
  assert.equal(state.cash, before - Math.round(-before * spec.meta.triangle.borrowingRate));
  assert.equal(state.log.findLast((entry) => entry.t === "resolve").cashDelta, 0);
  assert.equal(state.salary, 0);
  const card = state.log.at(-1).flavor;
  assert.ok(card.id && card.caption && card.still);
  const again = applyRoll(spec, choosePath(spec, createGame(spec, 5), "study"), 1);
  assert.equal(again.log.at(-1).flavor.id, card.id);
  const walk = (accept) => {
    let s = choosePath(spec, createGame(spec, 11), "work");
    const ids = [];
    let guard = 0;
    while (s.phase !== "ended" && guard++ < 80) {
      s = s.phase === "choice" ? resolveChoice(spec, s, accept) : applyRoll(spec, s, 1);
      const flav = s.log.at(-1).flavor;
      if (flav) ids.push(flav.id);
    }
    return ids;
  };
  const otherAnswers = walk(true);
  const declinedIds = walk(false);
  assert.deepEqual(otherAnswers, declinedIds);
  assert.ok(otherAnswers.length > 0);
});

test("the center and the three corners match the triangle", () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
  const center = triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  close(center.income, 1);
  close(center.spend, 0.6);
  close(center.healthCost, 1);
  close(center.h, 1 / 3);
  close(axis(1 / 3), 0);
  assert.equal(annualExpenses(48000, center, spec), 28800);
  assert.equal(monthlyExpenses(48000, center, spec), 2400);

  const health = triangleRates(spec, { h: 1, w: 0, f: 0 });
  close(health.income, 0.8);
  close(health.spend, 0.8);
  close(health.h, 1);
  close(health.healthCost, 0.5);
  const healthIncome = Math.round(48000 * 0.8);
  const healthAnnual = Math.round(healthIncome * 0.8 * (0.75 + 0.25 * 0.5));
  assert.equal(annualExpenses(healthIncome, health, spec), healthAnnual);

  const work = triangleRates(spec, { h: 0, w: 1, f: 0 });
  close(work.income, 1.2);
  close(work.spend, 0.8);
  close(work.h, 0);
  close(work.healthCost, 1.2);
  const workIncome = Math.round(48000 * 1.2);
  assert.equal(annualExpenses(workIncome, work, spec), Math.round(workIncome * 0.8 * (0.75 + 0.25 * 1.2)));

  const frugal = triangleRates(spec, { h: 0, w: 0, f: 1 });
  close(frugal.income, 0.8);
  close(frugal.spend, 0.4);
  close(frugal.h, 0);
  close(frugal.healthCost, 1.2);
  const frugalIncome = Math.round(48000 * 0.8);
  assert.equal(annualExpenses(frugalIncome, frugal, spec), Math.round(frugalIncome * 0.4 * (0.75 + 0.25 * 1.2)));

  let studied = choosePath(spec, createGame(spec, 7, { h: 1, w: 0, f: 0 }), "study");
  const studiedOwed = spec.meta.startingCash - 124000;
  assert.equal(studied.cash, studiedOwed - Math.round(-studiedOwed * spec.meta.triangle.borrowingRate));
  assert.equal(studied.salary, 0);
  studied = applyRoll(spec, studied, 10);
  assert.equal(studied.salary, Math.round(spec.paths.study.spaces[3].plusSalarySet * 0.8));

  let hired = choosePath(spec, createGame(spec, 3, { h: 0, w: 1, f: 0 }), "work");
  assert.equal(hired.salary, workIncome);
  const centerHire = choosePath(spec, createGame(spec, 3), "work");
  assert.equal(centerHire.salary, 48000);
  const centerRates = triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  const plusRates = { ...centerRates, spend: centerRates.spend + spec.meta.spendAdjust["lifespan-plus"] };
  const centerBill = annualExpenses(48000, plusRates, spec);
  const centerAfter = spec.meta.startingCash + spec.meta.workStake["lifespan-plus"] + 48000 - centerBill;
  assert.equal(centerHire.cash, centerAfter + Math.round(centerAfter * spec.meta.triangle.interestRate));
  hired = applyRoll(spec, hired, 1);
  assert.equal(currentSpace(spec, hired).kind, "payday");
  const corner = hired.log.find((entry) => entry.t === "spin").gutChecks[0];
  const step = spec.meta.gutCheck.results.find((row) => row.id === corner.id).rate;
  assert.equal(corner.salaryBefore, workIncome);
  assert.equal(hired.salary, Math.round(workIncome * (1 + step)));

  let plain = choosePath(spec, createGame(spec, 1, { h: 0, w: 0, f: 1 }), "work");
  assert.equal(plain.salary, frugalIncome);
  plain = applyRoll(spec, plain, 10);
  assert.equal(currentSpace(spec, plain).id, "partnership");
  assert.ok(plain.log.find((entry) => entry.t === "spin").gutChecks.length >= 1);
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").cash;
  assert.equal(party, -28000);

  const age = 18;
  assert.equal(deathProbability(spec, age, 1), spec.mortality.annuity.q[0]);
  assert.equal(deathProbability(spec, age, -1), spec.mortality.life.q[0]);
  close(deathProbability(spec, age, 0), (spec.mortality.life.q[0] + spec.mortality.annuity.q[0]) / 2);
  assert.ok(lifeExpectancy(spec, age, 1) > lifeExpectancy(spec, age, 0));
  assert.ok(lifeExpectancy(spec, age, 0) > lifeExpectancy(spec, age, -1));
  assert.equal(lifeExpectancy(spec, 68, 0), 0);
  assert.equal(spec.mortality.annuity.q.length, 51);
  assert.equal(spec.mortality.life.q.length, 51);
  spec.mortality.annuity.q.forEach((q, i) => {
    assert.ok(spec.mortality.life.q[i] > q);
    assert.ok(Math.abs(q - (spec.mortality.annuity.male[i] + spec.mortality.annuity.female[i]) / 2) < 1e-9);
  });
  const edgeMid = attributeWeights({ h: 0, w: 1 / 2, f: 1 / 2 });
  const edgeNearWork = attributeWeights({ h: 0, w: 4 / 5, f: 1 / 5 });
  const edgeNearFrugal = attributeWeights({ h: 0, w: 1 / 5, f: 4 / 5 });
  assert.ok(edgeMid.h > edgeNearWork.h);
  assert.ok(edgeMid.h > edgeNearFrugal.h);
  assert.ok(edgeMid.h > 0);
  assert.ok(edgeMid.h < 1 / 3);
  const edgeRates = triangleRates(spec, { h: 0, w: 1 / 2, f: 1 / 2 });
  assert.ok(edgeRates.axis.h > -1 && edgeRates.axis.h < 0);
  assert.ok(deathProbability(spec, age, edgeRates.axis.h) < deathProbability(spec, age, -1));
  assert.ok(deathProbability(spec, age, edgeRates.axis.h) > deathProbability(spec, age, 0));

  const stats = portraitStats(spec, hired);
  assert.equal(stats.income, hired.salary);
  assert.ok(stats.incomeDelta > 0);
  assert.ok(stats.expenseDelta > 0);
  assert.ok(stats.deathDelta > 0);
  const centerStats = portraitStats(spec, centerHire);
  assert.equal(centerStats.incomeDelta, 0);
  assert.equal(centerStats.expenseDelta, 0);
  assert.equal(centerStats.deathDelta, 0);

  assert.deepEqual(outcomeFromUnit(0.00001, 0.2), { death: true, roll: 0 });
  assert.deepEqual(outcomeFromUnit(0.2, 0.2), { death: false, roll: 1 });
  assert.equal(outcomeFromUnit(0.999, 0.2).roll, 10);

  const play = (point) => {
    let state = choosePath(spec, createGame(spec, 11, point), "work");
    const marks = [];
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 80) {
      state = state.phase === "choice" ? resolveChoice(spec, state, false) : spin(spec, state);
      const last = state.log.at(-1);
      if (last.flavor) marks.push(`f:${last.flavor.id}`);
      if (last.t === "death") marks.push(`d:${last.age}`);
    }
    return marks;
  };
  assert.deepEqual(play({ h: 0, w: 1, f: 0 }), play({ h: 0, w: 1, f: 0 }));

  let died = null;
  for (let seed = 1; seed < 4000 && !died; seed += 1) {
    let state = choosePath(spec, createGame(spec, seed, { h: 0, w: 1, f: 0 }), "work");
    let guard = 0;
    while (state.phase === "play" && guard++ < 80) state = spin(spec, state);
    if (state.death) died = { seed, age: state.death.age, q: state.death.q };
  }
  assert.ok(died, "a work-corner life should be able to hit the wedge");
  const replay = (seed) => {
    let state = choosePath(spec, createGame(spec, seed, { h: 0, w: 1, f: 0 }), "work");
    let guard = 0;
    while (state.phase === "play" && guard++ < 80) state = spin(spec, state);
    return state;
  };
  const once = replay(died.seed);
  const twice = replay(died.seed);
  assert.equal(once.death.age, twice.death.age);
  assert.equal(once.index, twice.index);
  assert.deepEqual(once.log, twice.log);
});

test("life and lifespan ignore the triangle and the wedge", () => {
  const point = { h: 0, w: 1, f: 0 };
  const life = choosePath(spec, createGame(spec, 7, point, "life"), "study");
  assert.equal(life.mode, "life");
  assert.equal(isEntirety(life), false);
  const lifeTuition = spec.paths.study.spaces[0].lifeCash;
  const yearTuition = spec.paths.study.spaces[0].cash;
  assert.equal(life.cash, spec.meta.startingCash + lifeTuition);
  assert.equal(yearTuition, -124000);
  assert.notEqual(lifeTuition, yearTuition);
  const placed = applyRoll(spec, life, 10);
  assert.equal(placed.salary, spec.paths.study.spaces[3].lifeSalarySet);
  assert.equal(placed.death, null);

  const lifespan = choosePath(spec, createGame(spec, 7, point, "lifespan"), "study");
  assert.equal(lifespan.cash, spec.meta.startingCash + yearTuition);
  assert.notEqual(lifespan.cash, life.cash);
  assert.equal(lifespan.salary, life.salary);

  const entirety = choosePath(spec, createGame(spec, 7, point, "lifespan-plus"), "study");
  assert.equal(isEntirety(entirety), true);
  assert.equal(entirety.mode, "lifespan-plus");
  const owed = spec.meta.startingCash + yearTuition;
  assert.equal(entirety.cash, owed - Math.round(-owed * spec.meta.triangle.borrowingRate));

  const hired = choosePath(spec, createGame(spec, 3, point, "life"), "work");
  assert.equal(hired.salary, spec.paths.work.spaces[0].lifeSalarySet);
  assert.equal(hired.cash, spec.meta.startingCash + spec.paths.work.spaces[0].lifeCash);

  const play = (mode, seed) => {
    let state = choosePath(spec, createGame(spec, seed, point, mode), "work");
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 80) {
      state = state.phase === "choice" ? resolveChoice(spec, state, false) : spin(spec, state);
    }
    return state;
  };
  let died = null;
  for (let seed = 1; seed < 4000 && !died; seed += 1) {
    if (play("lifespan-plus", seed).death) died = seed;
  }
  assert.ok(died, "an entirety life should be able to hit the wedge");
  const plain = play("life", died);
  const same = play("lifespan", died);
  assert.equal(plain.death, null);
  assert.equal(same.death, null);
  assert.equal(currentSpace(spec, plain).age, 68);
  assert.equal(currentSpace(spec, same).age, 68);
  assert.ok(plain.log.some((entry) => entry.paydayCash > 0));
  assert.ok(same.log.some((entry) => entry.gutChecks?.length));
  assert.equal(same.log.some((entry) => entry.paydayCash > 0), false);
  const spun = plain.log.find((entry) => entry.t === "spin");
  assert.ok(spun.roll >= 1 && spun.roll <= 10);
  assert.equal(plain.log.some((entry) => entry.t === "death"), false);
  assert.equal(spec.paths.retirement, undefined);
  assert.equal(spec.meta.ageEnd, 68);
  assert.throws(() => choosePath(spec, createGame(spec, 1, point, null), "work"), /mode/);
});

test("entirety pays 4 percent on positive savings and still borrows when negative", () => {
  const rate = spec.meta.triangle.interestRate;
  assert.equal(rate, 0.04);
  assert.equal(spec.meta.triangle.borrowingRate, 0.04);
  assert.equal(savingsInterest(10000, spec), 400);
  assert.equal(savingsInterest(0, spec), 0);
  assert.equal(savingsInterest(-2500, spec), 0);
  const hired = choosePath(spec, createGame(spec, 3), "work");
  assert.equal(hired.mode, "lifespan-plus");
  const hiredRates = triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  const hiredPlus = { ...hiredRates, spend: hiredRates.spend + spec.meta.spendAdjust["lifespan-plus"] };
  const hiredBill = annualExpenses(spec.meta.workSalary, hiredPlus, spec);
  const hiredAfter = spec.meta.startingCash + spec.meta.workStake["lifespan-plus"] + spec.meta.workSalary - hiredBill;
  assert.equal(hired.cash, hiredAfter + Math.round(hiredAfter * rate));
  const life = choosePath(spec, createGame(spec, 3, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }, "life"), "work");
  assert.equal(life.cash, spec.meta.startingCash + spec.paths.work.spaces[0].lifeCash);
  const spanRates = { ...hiredRates, spend: hiredRates.spend + spec.meta.spendAdjust.lifespan };
  const spanBill = annualExpenses(spec.meta.workSalary, spanRates, spec);
  const span = choosePath(spec, createGame(spec, 3, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }, "lifespan"), "work");
  assert.equal(span.cash, spec.meta.startingCash + spec.meta.workStake.lifespan + spec.meta.workSalary - spanBill);
  assert.notEqual(span.cash, life.cash);
  const owed = spec.meta.startingCash - 124000;
  const studied = choosePath(spec, createGame(spec, 7), "study");
  assert.ok(owed < 0);
  assert.equal(studied.cash, owed - Math.round(-owed * spec.meta.triangle.borrowingRate));
  assert.equal(spec.paths.retirement, undefined);
  assert.equal(spec.meta.ageEnd, 68);
});

const keep = (pay) => pay - annualExpenses(pay, triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }), spec);

const firstCheck = (mode, id, roll = 2, point) => {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = applyRoll(spec, choosePath(spec, createGame(spec, seed, point, mode), "work"), roll);
    const check = state.log.find((entry) => entry.t === "spin").gutChecks[0];
    if (check?.id === id) return state;
  }
  throw new Error(`no ${id} seed`);
};

test("life still collects a payday salary on land or pass and does not annualize", () => {
  const job = spec.paths.work.spaces[0];
  const pay = job.lifeSalarySet;
  const opened = spec.meta.startingCash + job.lifeCash;
  const hired = choosePath(spec, createGame(spec, 12, undefined, "life"), "work");
  const moved = applyRoll(spec, hired, 5);
  assert.equal(currentSpace(spec, moved).id, "pay-23");
  const spun = moved.log.find((entry) => entry.t === "spin");
  assert.deepEqual(spun.paydayAges, [19, 23]);
  assert.equal(spun.paydayCash, pay * 2);
  assert.equal(moved.cash, opened + pay * 2);
  assert.equal(moved.salary, pay);
  assert.equal(spun.yearPay, 0);
  assert.equal(spun.yearBill, 0);
  assert.deepEqual(spun.years, []);
  assert.deepEqual(spun.gutChecks, []);
});

test("year modes settle pay minus living on every entered paid year and add no payday salary", () => {
  for (const mode of ["lifespan", "lifespan-plus"]) {
    const hired = choosePath(spec, createGame(spec, 12, undefined, mode), "work");
    const moved = applyRoll(spec, hired, 5);
    const spun = moved.log.find((entry) => entry.t === "spin");
    assert.equal(currentSpace(spec, moved).id, "pay-23");
    assert.equal(spun.paydayCash, 0, mode);
    assert.deepEqual(spun.years.map((year) => year.age), [19, 20, 21, 22, 23]);
    assert.deepEqual(spun.gutChecks.map((check) => check.age), [19, 23]);
    const raised = spun.gutChecks[0].salaryAfter;
    const pays = [spec.meta.workSalary, raised, raised, raised, raised];
    let cash = hired.cash;
    spun.years.forEach((year, i) => {
      assert.equal(year.pay, pays[i], `${mode} pay at ${year.age}`);
      assert.equal(year.bill, Math.round(pays[i] * 0.6), `${mode} bill at ${year.age}`);
      cash += keep(pays[i]);
      if (mode === "lifespan-plus") cash += savingsInterest(cash, spec);
      assert.equal(year.cash, cash, `${mode} cash at ${year.age}`);
    });
    assert.equal(moved.cash, cash);
    assert.equal(spun.yearPay, pays.reduce((a, b) => a + b, 0));
  }
});

test("years before a salary settle no pay and no living cost", () => {
  const studied = choosePath(spec, createGame(spec, 4, undefined, "lifespan"), "study");
  assert.equal(studied.salary, 0);
  const intern = applyRoll(spec, studied, 2);
  const spun = intern.log.find((entry) => entry.t === "spin");
  assert.equal(currentSpace(spec, intern).id, "study-intern");
  assert.deepEqual(spun.years.map((year) => [year.pay, year.bill]), [[0, 0], [0, 0]]);
  assert.equal(intern.cash, studied.cash + choiceCost(spec, spec.paths.study.spaces[2], "lifespan"));
  const job = applyRoll(spec, intern, 4);
  assert.equal(currentSpace(spec, job).id, "study-role");
  const first = job.log.findLast((entry) => entry.t === "spin").years[0];
  assert.equal(first.pay, spec.meta.studySalary);
  assert.equal(job.cash, intern.cash + keep(spec.meta.studySalary));
});

test("a gut check on a pass changes later salary and pays no second salary", () => {
  const state = firstCheck("lifespan", "heyday");
  const spun = state.log.find((entry) => entry.t === "spin");
  const hired = choosePath(spec, createGame(spec, state.seed, undefined, "lifespan"), "work");
  assert.equal(currentSpace(spec, state).id, "work-tools");
  const check = spun.gutChecks[0];
  assert.equal(check.landed, false);
  assert.equal(check.salaryBefore, spec.meta.workSalary);
  assert.equal(check.salaryAfter, Math.round(spec.meta.workSalary * 1.04));
  assert.equal(state.salary, check.salaryAfter);
  assert.deepEqual(spun.years.map((year) => year.pay), [spec.meta.workSalary, check.salaryAfter]);
  assert.equal(spun.paydayCash, 0);
  const tools = choiceCost(spec, spec.paths.work.spaces[2], "lifespan");
  assert.equal(state.cash, hired.cash + keep(spec.meta.workSalary) + tools + keep(check.salaryAfter));
  const steady = firstCheck("lifespan", "steady");
  assert.equal(steady.salary, spec.meta.workSalary);
  const mayday = firstCheck("lifespan", "mayday");
  assert.equal(mayday.salary, Math.round(spec.meta.workSalary * 0.96));
  const landed = firstCheck("lifespan", "heyday", 1);
  assert.equal(landed.log.find((entry) => entry.t === "spin").gutChecks[0].landed, true);
  assert.equal(landed.cash, choosePath(spec, createGame(spec, landed.seed, undefined, "lifespan"), "work").cash + keep(spec.meta.workSalary));
});

test("a mayday cannot drop pay below 80 percent of the path's starting salary", () => {
  const cases = [
    ["lifespan", "work", undefined, spec.meta.workSalary, 1],
    ["lifespan", "study", undefined, spec.meta.studySalary, 1],
    ["lifespan-plus", "work", { h: 0, w: 1, f: 0 }, spec.meta.workSalary, 1.2],
    ["lifespan-plus", "work", { h: 1, w: 0, f: 0 }, spec.meta.workSalary, 0.8],
  ];
  for (const [mode, path, point, start, income] of cases) {
    let state = choosePath(spec, createGame(spec, 6, point, mode), path);
    if (path === "study") state = applyRoll(spec, state, 10);
    assert.equal(state.startingPay, start);
    let held = false;
    for (let n = 0; n < 30; n += 1) {
      const checked = applyGutCheck(spec, state, 0.9999);
      assert.equal(checked.result.id, "mayday");
      held = held || checked.held;
      state = { ...state, salary: checked.salary, salaryBase: checked.salaryBase };
    }
    assert.equal(held, true);
    assert.equal(state.salaryBase, Math.round(start * spec.meta.gutCheck.floor), `${mode} ${path}`);
    assert.equal(state.salary, Math.round(Math.round(start * spec.meta.gutCheck.floor) * income), `${mode} ${path}`);
    const up = applyGutCheck(spec, state, 0);
    assert.equal(up.result.id, "heyday");
    assert.ok(up.salary > state.salary);
  }
});

test("gut check odds: fixed on Life$pan, work axis only on Life$pan+", () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  const same = (odds, row) => {
    close(odds.heyday, row[0]);
    close(odds.steady, row[1]);
    close(odds.mayday, row[2]);
  };
  same(gutCheckOdds(spec, "lifespan", { h: 0, w: 1, f: 0 }), [0.5, 0.35, 0.15]);
  const center = gutCheckOdds(spec, "lifespan-plus", { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  const work = gutCheckOdds(spec, "lifespan-plus", { h: 0, w: 1, f: 0 });
  same(center, [0.4, 0.45, 0.15]);
  same(work, [0.7, 0.25, 0.05]);
  assert.notDeepEqual(work, center);
  same(gutCheckOdds(spec, "lifespan-plus", { h: 1, w: 0, f: 0 }), [0.15, 0.45, 0.4]);
  same(gutCheckOdds(spec, "lifespan-plus", { h: 0, w: 0, f: 1 }), [0.15, 0.45, 0.4]);
  const tilt = triangleRates(spec, { h: 0.2, w: 0.6, f: 0.2 }).axis.w;
  assert.ok(tilt > 0 && tilt < 1);
  same(gutCheckOdds(spec, "lifespan-plus", { h: 0.2, w: 0.6, f: 0.2 }), [0.4 + 0.3 * tilt, 0.45 - 0.2 * tilt, 0.15 - 0.1 * tilt]);
  const a = gutCheckOdds(spec, "lifespan-plus", { h: 0.5, w: 0.2, f: 0.3 });
  const b = gutCheckOdds(spec, "lifespan-plus", { h: 0.3, w: 0.2, f: 0.5 });
  same(a, [b.heyday, b.steady, b.mayday]);
  assert.equal(gutCheckFromUnit(spec, 0.69, work).id, "heyday");
  assert.equal(gutCheckFromUnit(spec, 0.7, work).id, "steady");
  assert.equal(gutCheckFromUnit(spec, 0.84, center).id, "steady");
  assert.equal(gutCheckFromUnit(spec, 0.851, center).id, "mayday");
  assert.equal(gutCheckFromUnit(spec, 0.39, center).id, "heyday");
  const corner = choosePath(spec, createGame(spec, 2, { h: 0, w: 1, f: 0 }, "lifespan-plus"), "work");
  const middle = choosePath(spec, createGame(spec, 2, undefined, "lifespan-plus"), "work");
  assert.equal(applyGutCheck(spec, corner, 0.5).result.id, "heyday");
  assert.equal(applyGutCheck(spec, middle, 0.5).result.id, "steady");
  assert.equal(applyGutCheck(spec, corner, 0).salary, Math.round(corner.salary * 1.04));
  assert.equal(applyGutCheck(spec, middle, 0).salary, Math.round(middle.salary * 1.04));
  assert.throws(() => gutCheckOdds(spec, "life"), /Gut Check/);
});

test("the gut check card names the weak goal on Life$pan+ only", () => {
  const at = (mode, point) => weakGoal(spec, createGame(spec, 1, point, mode));
  assert.equal(at("lifespan", { h: 0.45, w: 0.1, f: 0.45 }), null);
  assert.equal(at("lifespan-plus", { h: 1 / 3, w: 1 / 3, f: 1 / 3 }), null);
  assert.equal(at("lifespan-plus", { h: 0.45, w: 0.1, f: 0.45 }), "work");
  assert.equal(at("lifespan-plus", { h: 0.1, w: 0.45, f: 0.45 }), "health");
  assert.equal(at("lifespan-plus", { h: 0.45, w: 0.45, f: 0.1 }), "frugality");
  for (const key of ["review", "work", "health", "frugality"]) assert.ok(spec.meta.gutCheck.copy[key]);
  assert.equal(spec.meta.gutCheck.title, "Gut Check");
  const ages = track(spec, "work").filter((space) => space.kind === "payday").map((space) => space.age);
  assert.deepEqual(ages, [19, 23, 28, 33, 38, 43, 48, 53, 58, 63, 67]);
  assert.equal(track(spec, "study").some((space) => space.age === 19 && space.kind === "payday"), false);
  for (const [id, age] of [["work-raise", 21], ["promotion", 40], ["cola", 51], ["recognition", 55]]) {
    const space = track(spec, "work").find((row) => row.id === id);
    assert.equal(space.age, age);
    assert.notEqual(space.kind, "payday");
  }
});

test("life does not pay each space, and a year mode does", () => {
  const pay = spec.meta.workSalary;
  const lifePay = spec.paths.work.spaces[0].lifeSalarySet;
  const lifeOpen = spec.meta.startingCash + spec.paths.work.spaces[0].lifeCash;
  const rates = triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  const spanRates = { ...rates, spend: rates.spend + spec.meta.spendAdjust.lifespan };
  const bill = annualExpenses(pay, spanRates, spec);
  const life = choosePath(spec, createGame(spec, 3, undefined, "life"), "work");
  assert.equal(life.cash, lifeOpen);
  assert.equal(life.log.find((entry) => entry.t === "resolve").yearPay, 0);
  assert.equal(life.log.find((entry) => entry.t === "resolve").yearBill, 0);
  const span = choosePath(spec, createGame(spec, 3, undefined, "lifespan"), "work");
  assert.equal(span.log.find((entry) => entry.t === "resolve").yearPay, pay);
  assert.equal(span.log.find((entry) => entry.t === "resolve").yearBill, bill);
  assert.equal(span.cash, spec.meta.startingCash + spec.meta.workStake.lifespan + pay - bill);
  const lifeMove = applyRoll(spec, life, 1);
  const lifeSpin = lifeMove.log.find((entry) => entry.t === "spin");
  assert.equal(lifeSpin.yearPay, 0);
  assert.equal(lifeSpin.yearBill, 0);
  assert.equal(lifeSpin.paydayCash, lifePay);
  assert.equal(lifeMove.cash, lifeOpen + lifePay);
  const spanMove = applyRoll(spec, span, 1);
  const spanSpin = spanMove.log.find((entry) => entry.t === "spin");
  assert.equal(spanSpin.paydayCash, 0);
  assert.ok(spanSpin.yearPay > 0);
  assert.equal(spanSpin.yearBill, annualExpenses(pay, spanRates, spec));
  assert.ok(spanMove.cash !== lifeMove.cash);
});

test("a new clock seed does not repeat the first spins", () => {
  const first = freshSeed(1_700_000_000_123, 1, 0);
  const second = freshSeed(1_700_000_000_123, 2, first);
  assert.notEqual(first, second);
  const rolls = (seed) => {
    let state = choosePath(spec, createGame(spec, seed, undefined, "life"), "work");
    const seen = [];
    let guard = 0;
    while (seen.length < 4 && state.phase !== "ended" && guard++ < 20) {
      if (state.phase === "choice") state = resolveChoice(spec, state, false);
      else {
        state = spin(spec, state);
        const spun = [...state.log].reverse().find((entry) => entry.t === "spin");
        if (spun) seen.push(spun.roll);
      }
    }
    return seen;
  };
  assert.notDeepEqual(rolls(first), rolls(second));
});

test("an investment chance steps from 10% through 80%, and a win doubles the stake", () => {
  const units = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.999];
  const expected = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8];
  units.forEach((unit, i) => {
    assert.equal(drawInvestChance(() => unit), expected[i]);
  });
  assert.equal(drawInvestChance(() => 0.124), 0.1);
  assert.notEqual(drawInvestChance(() => 0.999), 0.9);
  assert.notEqual(drawInvestChance(() => 0.999), 1);
  const draws = [];
  setInvestRandom(() => {
    const next = [0.5, 0.49][draws.length];
    draws.push(next);
    return next;
  });
  let state = choosePath(spec, createGame(spec, 99, undefined, "life"), "work");
  let guard = 0;
  while (currentSpace(spec, state).id !== "market" && guard++ < 80) {
    if (state.phase === "choice") state = resolveChoice(spec, state, false);
    else state = applyRoll(spec, state, 1);
  }
  assert.equal(state.phase, "choice");
  assert.equal(state.investOffer.p, 0.5);
  assert.equal(state.investOffer.stake, 10000);
  assert.equal(state.fateState, choosePath(spec, createGame(spec, 99, undefined, "life"), "work").fateState);
  const before = state.cash;
  const won = resolveChoice(spec, state, true);
  assert.equal(won.log.at(-1).fate, "success");
  assert.equal(won.log.at(-1).chance, 0.5);
  assert.equal(won.cash, before + 10000);
  assert.equal(won.lastChoice.accept, true);
  assert.equal(won.lastChoice.chance, 0.5);
  assert.equal(won.investOffer, null);
  const skipped = resolveChoice(spec, state, false);
  assert.equal(skipped.cash, before);
  assert.equal(skipped.log.at(-1).fate, null);
  assert.equal(skipped.fateState, state.fateState);
  setInvestRandom(Math.random);
});

test("life can finish with savings and can finish broke", () => {
  setInvestRandom(() => 0.2);
  const finish = (path, seed, accept) => {
    let state = choosePath(spec, createGame(spec, seed, undefined, "life"), path);
    let guard = 0;
    while (state.phase !== "ended" && guard++ < 120) {
      state = state.phase === "choice" ? resolveChoice(spec, state, accept) : spin(spec, state);
    }
    return state.cash;
  };
  let rich = false;
  let broke = false;
  for (let seed = 1; seed <= 40 && !(rich && broke); seed += 1) {
    for (const path of ["study", "work"]) {
      for (const accept of [true, false]) {
        const cash = finish(path, seed, accept);
        if (cash >= 0) rich = true;
        if (cash < 0) broke = true;
      }
    }
  }
  assert.equal(rich, true);
  assert.equal(broke, true);
  setInvestRandom(Math.random);
});

test("a straight play can finish broke", () => {
  const broke = (mode) => {
    for (let seed = 1; seed <= 24; seed += 1) {
      let state = choosePath(spec, createGame(spec, seed, undefined, mode), "work");
      let guard = 0;
      while (state.phase !== "ended" && guard++ < 100) {
        state = state.phase === "choice" ? resolveChoice(spec, state, false) : spin(spec, state);
      }
      if (state.cash < 0) return seed;
    }
    return 0;
  };
  assert.ok(broke("life"), "life");
  assert.ok(broke("lifespan"), "lifespan");
  assert.ok(broke("lifespan-plus"), "lifespan-plus");
});

test("tone mix is recorded for a later matching phase", () => {
  const study = toneCounts(track(spec, "study"));
  const work = toneCounts(track(spec, "work"));
  assert.equal(study.good + study.bad + study.neutral, 51);
  assert.equal(work.good + work.bad + work.neutral, 51);
  console.log("tone study", study, "work", work);
});
