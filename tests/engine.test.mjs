import assert from "node:assert/strict";
import test from "node:test";
import spec from "../spec/accumulation.json" with { type: "json" };
import {
  annualExpenses,
  applyRoll,
  attributeWeights,
  axis,
  choosePath,
  createGame,
  currentSpace,
  deathProbability,
  lifeExpectancy,
  monthlyExpenses,
  outcomeFromUnit,
  portraitStats,
  resolveChoice,
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
  let state = choosePath(spec, createGame(spec, 3), "work");
  assert.equal(state.salary, pay);
  state = applyRoll(spec, state, 1);
  assert.equal(currentSpace(spec, state).age, 19);
  assert.equal(state.cash, spec.meta.startingCash + pay);
  state = applyRoll(spec, state, 2);
  assert.equal(currentSpace(spec, state).id, "work-raise");
  assert.equal(state.salary, pay + raise);
});

test("a stop cuts the move and still pays salaries passed on the way", () => {
  const pay = spec.meta.workSalary;
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").cash;
  let state = choosePath(spec, createGame(spec, 1), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  assert.equal(state.cash, spec.meta.startingCash + pay + pay + party);
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.deepEqual(spinEntry.paydayAges, [19, 23]);
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
  let state = choosePath(spec, createGame(spec, 9), "work");
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
    "child": -12000,
    twins: -22000,
    partnership: -8000,
    home: -42000,
  };
  for (const [id, cash] of Object.entries(locked)) {
    const space = track(spec, "study").find((s) => s.id === id) || track(spec, "work").find((s) => s.id === id);
    assert.equal(space.cash, cash);
    assert.equal(space.flavor, undefined);
  }
  assert.equal(spec.paths.study.spaces[3].salarySet, 68000);
  assert.equal(spec.paths.work.spaces[0].salarySet, 48000);
  assert.equal(spec.paths.work.spaces[3].salaryDelta, 10000);
  for (const id of ["study-nights", "quiet-37", "reunion", "quiet-50", "quiet-56", "festival", "quiet-61", "quiet-65", "farewell"]) {
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
  const otherAnswers = (() => {
    let s = choosePath(spec, createGame(spec, 11), "work");
    const ids = [];
    let guard = 0;
    while (s.phase !== "ended" && guard++ < 80) {
      s = s.phase === "choice" ? resolveChoice(spec, s, true) : spin(spec, s);
      const flav = s.log.at(-1).flavor;
      if (flav) ids.push(flav.id);
    }
    return ids;
  })();
  let declined = choosePath(spec, createGame(spec, 11), "work");
  const declinedIds = [];
  let guard = 0;
  while (declined.phase !== "ended" && guard++ < 80) {
    declined = declined.phase === "choice" ? resolveChoice(spec, declined, false) : spin(spec, declined);
    const flav = declined.log.at(-1).flavor;
    if (flav) declinedIds.push(flav.id);
  }
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
  assert.equal(centerHire.cash, spec.meta.startingCash);
  hired = applyRoll(spec, hired, 1);
  assert.equal(hired.salary, workIncome);

  let plain = choosePath(spec, createGame(spec, 1, { h: 0, w: 0, f: 1 }), "work");
  assert.equal(plain.salary, frugalIncome);
  plain = applyRoll(spec, plain, 10);
  assert.equal(currentSpace(spec, plain).id, "partnership");
  assert.equal(plain.salary, frugalIncome);
  const party = spec.paths.shared.spaces.find((s) => s.id === "partnership").cash;
  assert.equal(party, -8000);

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
  assert.equal(stats.income, workIncome);
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

test("tone mix is recorded for a later matching phase", () => {
  const study = toneCounts(track(spec, "study"));
  const work = toneCounts(track(spec, "work"));
  assert.equal(study.good + study.bad + study.neutral, 51);
  assert.equal(work.good + work.bad + work.neutral, 51);
  console.log("tone study", study, "work", work);
});
