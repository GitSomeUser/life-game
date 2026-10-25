import assert from "node:assert/strict";
import test from "node:test";
import spec from "../spec/accumulation.json" with { type: "json" };
import {
  applyRoll,
  choosePath,
  createGame,
  currentSpace,
  resolveChoice,
  spin,
  toneCounts,
  track,
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
  let state = choosePath(spec, createGame(spec, 7), "study");
  assert.equal(state.cash, 10000 - 40000);
  assert.equal(state.salary, 0);
  assert.equal(currentSpace(spec, state).id, "study-tuition");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "study-role");
  assert.equal(state.salary, 36000);
  assert.equal(state.phase, "play");
  const spinEntry = state.log.find((e) => e.t === "spin");
  assert.equal(spinEntry.discarded, 7);
});

test("work collects the early payday when passing it, then can raise only on a landing", () => {
  let state = choosePath(spec, createGame(spec, 3), "work");
  assert.equal(state.salary, 20000);
  state = applyRoll(spec, state, 1);
  assert.equal(currentSpace(spec, state).age, 19);
  assert.equal(state.cash, 10000 + 20000);
  state = applyRoll(spec, state, 2);
  assert.equal(currentSpace(spec, state).id, "work-raise");
  assert.equal(state.salary, 24000);
});

test("a stop cuts the move and still pays salaries passed on the way", () => {
  let state = choosePath(spec, createGame(spec, 1), "work");
  state = applyRoll(spec, state, 10);
  assert.equal(currentSpace(spec, state).id, "partnership");
  assert.equal(state.cash, 10000 + 20000 + 20000 - 6000);
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
  const lastSpin = [...state.log].reverse().find((e) => e.t === "spin");
  assert.deepEqual(lastSpin.paydayAges, [28]);
  assert.equal(lastSpin.paydayCash, 20000);
  assert.equal(state.cash, 10000 + 20000 + 20000 - 6000 + 20000 - 5000);
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
        assert.equal(state.phase, "ended", `${path} seed ${seed}`);
        assert.equal(currentSpace(spec, state).age, 68);
        assert.equal(Number.isFinite(state.cash), true);
        assert.equal(state.log[0].choice, "path");
      }
    }
  }
});

test("tone mix is recorded for a later matching phase", () => {
  const study = toneCounts(track(spec, "study"));
  const work = toneCounts(track(spec, "work"));
  assert.equal(study.good + study.bad + study.neutral, 51);
  assert.equal(work.good + work.bad + work.neutral, 51);
  console.log("tone study", study, "work", work);
});
