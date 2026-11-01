import assert from "node:assert/strict";
import test from "node:test";
import spec from "../spec/accumulation.json" with { type: "json" };
import {
  annualExpenses,
  applyReview,
  applyRoll,
  attributeWeights,
  axis,
  choosePath,
  freshSeed,
  createGame,
  currentSpace,
  deathProbability,
  isEntirety,
  lifeExpectancy,
  monthlyExpenses,
  outcomeFromUnit,
  portraitStats,
  resolveChoice,
  reviewFromUnit,
  savingsInterest,
  spin,
  toneCounts,
  track,
  triangleRates,
  validate,
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
  const salary = spec.paths.study.spaces[3].salarySet;
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
  assert.equal(state.salary, spec.meta.studySalary);
  assert.equal(state.phase, "play");
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.equal(spinEntry.discarded, 7);
});

test("work collects the early payday when passing it, then can raise only on a landing", () => {
  const pay = spec.meta.workSalary;
  const raise = spec.paths.work.spaces[3].salaryDelta;
  let state = choosePath(spec, createGame(spec, 3, undefined, "life"), "work");
  assert.equal(state.salary, pay);
  state = applyRoll(spec, state, 1);
  assert.equal(currentSpace(spec, state).age, 19);
  assert.equal(state.cash, spec.meta.startingCash + pay);
  const spun = state.log.find((e) => e.t === "spin");
  assert.equal(spun.paydayCash, pay);
  assert.equal(spun.reviews.length, 0);
  state = applyRoll(spec, state, 2);
  assert.equal(currentSpace(spec, state).id, "work-raise");
  assert.equal(state.salary, pay + raise);
});

test("a stop cuts the move and still pays salaries passed on the way", () => {
  const pay = spec.meta.workSalary;
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").cash;
  let state = choosePath(spec, createGame(spec, 1, undefined, "life"), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  assert.equal(state.cash, spec.meta.startingCash + pay + pay + party);
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.deepEqual(spinEntry.paydayAges, [19, 23]);
  assert.equal(spinEntry.paydayCash, pay + pay);
  assert.equal(spinEntry.toAge, 26);
  assert.equal(state.phase, "play");
});

test("landing on a choice waits, and the same seed replays spins and fate", () => {
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
});

test("passing a payday then landing on a cost pays salary once and the cost once", () => {
  let state = choosePath(spec, createGame(spec, 9, undefined, "life"), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  state = applyRoll(spec, state, 3);
  assert.equal(currentSpace(spec, state).id, "child");
  const pay = spec.meta.workSalary;
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").cash;
  const child = spec.paths.shared.spaces.find((s) => s.id === "child").cash;
  const lastSpin = [...state.log].reverse().find((e) => e.t === "spin");
  assert.deepEqual(lastSpin.paydayAges, [28]);
  assert.equal(lastSpin.paydayCash, pay);
  assert.equal(state.cash, spec.meta.startingCash + pay + pay + party + pay + child);
});

test("risky yes outcomes stay on the fate stream", () => {
  let state = choosePath(spec, createGame(spec, 99), "work");
  const reach = (id) => {
    let guard = 0;
    while (currentSpace(spec, state).id !== id && guard++ < 40) {
      if (state.phase === "choice") state = resolveChoice(spec, state, false);
      else state = applyRoll(spec, state, 1);
    }
  };
  reach("market");
  assert.equal(state.phase, "choice");
  const after = resolveChoice(spec, state, true);
  assert.ok(after.log.at(-1).fate === "success" || after.log.at(-1).fate === "fail");
  const declined = resolveChoice(spec, state, false);
  assert.equal(declined.log.at(-1).fate, null);
  assert.equal(declined.fateState, state.fateState);
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
  assert.equal(spec.paths.work.spaces[0].salarySet, 48000);
  assert.equal(spec.paths.work.spaces[3].salaryDelta, 10000);
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
  assert.equal(studied.salary, Math.round(68000 * 0.8));

  let hired = choosePath(spec, createGame(spec, 3, { h: 0, w: 1, f: 0 }), "work");
  assert.equal(hired.salary, workIncome);
  const centerHire = choosePath(spec, createGame(spec, 3), "work");
  assert.equal(centerHire.salary, 48000);
  const centerBill = annualExpenses(48000, triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }), spec);
  const centerAfter = spec.meta.startingCash + 48000 - centerBill;
  assert.equal(centerHire.cash, centerAfter + Math.round(centerAfter * spec.meta.triangle.interestRate));
  hired = applyRoll(spec, hired, 1);
  assert.equal(currentSpace(spec, hired).kind, "payday");
  assert.equal(hired.log.find((entry) => entry.t === "spin").reviews[0].id, "promo");
  assert.equal(hired.salary, Math.round(workIncome * (1 + spec.meta.review.permanentPromo)));

  let plain = choosePath(spec, createGame(spec, 1, { h: 0, w: 0, f: 1 }), "work");
  assert.equal(plain.salary, frugalIncome);
  plain = applyRoll(spec, plain, 10);
  assert.equal(currentSpace(spec, plain).id, "partnership");
  assert.ok(plain.log.find((entry) => entry.t === "spin").reviews.length >= 1);
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
  assert.equal(life.cash, spec.meta.startingCash - 124000);
  const placed = applyRoll(spec, life, 10);
  assert.equal(placed.salary, spec.meta.studySalary);
  assert.equal(placed.death, null);

  const lifespan = choosePath(spec, createGame(spec, 7, point, "lifespan"), "study");
  assert.equal(lifespan.cash, life.cash);
  assert.equal(lifespan.salary, life.salary);

  const entirety = choosePath(spec, createGame(spec, 7, point, "lifespan-plus"), "study");
  assert.equal(isEntirety(entirety), true);
  assert.equal(entirety.mode, "lifespan-plus");
  assert.notEqual(entirety.cash, life.cash);
  assert.equal(entirety.cash, life.cash - Math.round(-life.cash * spec.meta.triangle.borrowingRate));

  const hired = choosePath(spec, createGame(spec, 3, point, "life"), "work");
  assert.equal(hired.salary, spec.meta.workSalary);
  assert.equal(hired.cash, spec.meta.startingCash);

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
  assert.ok(same.log.some((entry) => entry.reviews?.length));
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
  const hiredBill = annualExpenses(spec.meta.workSalary, triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }), spec);
  const hiredAfter = spec.meta.startingCash + spec.meta.workSalary - hiredBill;
  assert.equal(hired.cash, hiredAfter + Math.round(hiredAfter * rate));
  const life = choosePath(spec, createGame(spec, 3, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }, "life"), "work");
  assert.equal(life.cash, spec.meta.startingCash);
  const span = choosePath(spec, createGame(spec, 3, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }, "lifespan"), "work");
  assert.equal(span.cash, spec.meta.startingCash + spec.meta.workSalary - hiredBill);
  assert.notEqual(span.cash, life.cash);
  const owed = spec.meta.startingCash - 124000;
  const studied = choosePath(spec, createGame(spec, 7), "study");
  assert.ok(owed < 0);
  assert.equal(studied.cash, owed - Math.round(-owed * spec.meta.triangle.borrowingRate));
  assert.equal(spec.paths.retirement, undefined);
  assert.equal(spec.meta.ageEnd, 68);
});

test("review odds are the seven stated bands", () => {
  for (const mode of ["lifespan", "lifespan-plus"]) {
    const bands = spec.meta.review[mode].bands;
    assert.equal(bands.reduce((sum, band) => sum + band.count, 0), 100);
    assert.equal(reviewFromUnit(spec, 0.2, mode).id, "temp-bonus");
    assert.equal(reviewFromUnit(spec, 0.4, mode).id, "temp-cut");
    assert.equal(reviewFromUnit(spec, 0.6, mode).id, "promo");
    assert.equal(reviewFromUnit(spec, 0.8, mode).id, "expenses");
    assert.equal(reviewFromUnit(spec, 0.82, mode).id, "stay");
    assert.equal(reviewFromUnit(spec, 0.999, mode).id, "stay");
  }
  assert.equal(reviewFromUnit(spec, 0, "lifespan").id, "big-bonus");
  assert.equal(reviewFromUnit(spec, 0.099, "lifespan").id, "big-bonus");
  assert.equal(reviewFromUnit(spec, 0.1, "lifespan").id, "demo");
  assert.equal(reviewFromUnit(spec, 0, "lifespan-plus").id, "closer");
  assert.equal(reviewFromUnit(spec, 0.1, "lifespan-plus").id, "away");
  assert.match(spec.meta.review.lifespan.bands[0].label, /temporary pay bonus and a permanent pay increase/);
  assert.match(spec.meta.review["lifespan-plus"].bands[0].label, /closer to the goal/);
  assert.match(spec.meta.modes.life, /Squares are not years/);
  assert.match(spec.meta.modes.lifespan, /Promo/);
  assert.match(spec.meta.modes["lifespan-plus"], /do not change pay/);
  assert.equal(spec.meta.modes.entirety, undefined);
});

test("a former payday is a review on Life$pan and a payday on Life", () => {
  const life = applyRoll(spec, choosePath(spec, createGame(spec, 4, undefined, "life"), "work"), 1);
  assert.equal(currentSpace(spec, life).kind, "payday");
  assert.equal(life.log.find((entry) => entry.t === "spin").paydayCash, spec.meta.workSalary);
  const span = applyRoll(spec, choosePath(spec, createGame(spec, 4, undefined, "lifespan"), "work"), 1);
  const review = span.log.find((entry) => entry.t === "spin").reviews[0];
  assert.equal(review.age, 19);
  assert.equal(span.log.find((entry) => entry.t === "spin").paydayCash, 0);
  const plus = applyRoll(spec, choosePath(spec, createGame(spec, 4, undefined, "entirety"), "work"), 1);
  assert.equal(plus.mode, "lifespan-plus");
  assert.equal(plus.log.find((entry) => entry.t === "spin").reviews.length, 1);
});

test("review results change pay, cash, or expenses, and a demo stops at 80 percent", () => {
  const hired = choosePath(spec, createGame(spec, 4, undefined, "lifespan"), "work");
  const start = spec.meta.workSalary;
  const big = applyReview(spec, hired, 0.05);
  assert.equal(big.band.id, "big-bonus");
  assert.equal(big.salary, Math.round(start * (1 + spec.meta.review.permanentPromo)));
  assert.equal(big.cashDelta, Math.round(start * spec.meta.review.tempPay));
  assert.equal(big.point.w, hired.point.w);
  const demo = applyReview(spec, hired, 0.15);
  assert.equal(demo.band.id, "demo");
  assert.equal(demo.salary, Math.round(start * (1 - spec.meta.review.permanentPromo)));
  assert.equal(demo.cashDelta, -Math.round(start * spec.meta.review.expenseBump));
  assert.equal(demo.expenseLoad, 0);
  const bonus = applyReview(spec, hired, 0.25);
  assert.equal(bonus.salary, start);
  assert.equal(bonus.cashDelta, Math.round(start * spec.meta.review.tempPay));
  const cut = applyReview(spec, hired, 0.45);
  assert.equal(cut.salary, start);
  assert.equal(cut.cashDelta, -Math.round(start * spec.meta.review.tempPay));
  const promo = applyReview(spec, hired, 0.65);
  assert.equal(promo.promoted, true);
  assert.equal(promo.salary, Math.round(start * (1 + spec.meta.review.permanentPromo)));
  const bill = applyReview(spec, hired, 0.805);
  assert.equal(bill.salary, start);
  assert.equal(bill.expenseLoad, spec.meta.review.expenseBump);
  const stay = applyReview(spec, hired, 0.9);
  assert.equal(stay.salary, start);
  assert.equal(stay.cashDelta, 0);
  let worn = { ...hired, ...promo };
  for (let n = 0; n < 40; n += 1) worn = { ...worn, ...applyReview(spec, worn, 0.15) };
  assert.ok(worn.salary >= Math.round(start * spec.meta.review.promoFloor));
  assert.equal(worn.held, true);
  const plus = choosePath(spec, createGame(spec, 4, { h: 1 / 3, w: 1 / 3, f: 1 / 3 }, "lifespan-plus"), "work");
  const nudged = applyReview(spec, plus, 0.05);
  assert.equal(nudged.band.id, "closer");
  assert.ok(nudged.point.w > plus.point.w);
  assert.equal(nudged.salary, plus.salary);
  assert.equal(nudged.cashDelta, 0);
  const away = applyReview(spec, plus, 0.15);
  assert.equal(away.band.id, "away");
  assert.ok(away.point.w < plus.point.w);
  assert.equal(away.salary, plus.salary);
  assert.equal(away.cashDelta, 0);
});

test("life does not pay each space, and a year mode does", () => {
  const pay = spec.meta.workSalary;
  const rates = triangleRates(spec, { h: 1 / 3, w: 1 / 3, f: 1 / 3 });
  const bill = annualExpenses(pay, rates, spec);
  const life = choosePath(spec, createGame(spec, 3, undefined, "life"), "work");
  assert.equal(life.cash, spec.meta.startingCash);
  assert.equal(life.log.find((entry) => entry.t === "resolve").yearPay, 0);
  assert.equal(life.log.find((entry) => entry.t === "resolve").yearBill, 0);
  const span = choosePath(spec, createGame(spec, 3, undefined, "lifespan"), "work");
  assert.equal(span.log.find((entry) => entry.t === "resolve").yearPay, pay);
  assert.equal(span.log.find((entry) => entry.t === "resolve").yearBill, bill);
  assert.equal(span.cash, spec.meta.startingCash + pay - bill);
  const lifeMove = applyRoll(spec, life, 1);
  const lifeSpin = lifeMove.log.find((entry) => entry.t === "spin");
  assert.equal(lifeSpin.yearPay, 0);
  assert.equal(lifeSpin.yearBill, 0);
  assert.equal(lifeSpin.paydayCash, pay);
  assert.equal(lifeMove.cash, spec.meta.startingCash + pay);
  const spanMove = applyRoll(spec, span, 1);
  const spanSpin = spanMove.log.find((entry) => entry.t === "spin");
  assert.equal(spanSpin.paydayCash, 0);
  assert.ok(spanSpin.yearPay > 0);
  assert.equal(spanSpin.yearBill, annualExpenses(spanMove.salary, rates, spec) + Math.round(spanMove.salary * (spanMove.expenseLoad || 0)));
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
