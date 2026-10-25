# LIFE — v0.3.0

Stage 2 of an online board: the working-life track, ages 18–68, plus the dashboard and three levers. One player. Black and white, gender-neutral, in the restrained line of Genesis Noir.

**v0.3.0 is Stage 2.** Health, work, and frugality are set once at the start. They scale income and expenses. The dashboard shows a leaderboard, a minimap, the animation and speed-run switches, and the roll. v0.2.2 added flavor cards on the no-stakes years. Mortality, interest, lifespan, the death sliver, retirement, and decumulation are not in this version.

Flavor cards live in `spec/accumulation.json`, with original stills in `art/flavor/`. Each card has a caption, a still, and an empty animation slot. The still shows now. A later pass can replace it.

Events, amounts, lever multipliers, and the short source notes live in `spec/accumulation.json`. The page reads those figures. The next refresh is a data change, not a code change.

This is an original board inspired by the rhythm of the classic accumulation game. It is not that game, and it is not affiliated with its publisher.

## Run

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use a local server. Opening the file directly will not load the board spec.

## Play

1. Name the game. The same name saves and resumes in this browser.
2. Split 100 across **Health**, **Work**, and **Frugality**, or pick a preset. The split locks when the path starts.
3. Note the seed, or type a whole number of your own. The same seed repeats the same spins.
4. At 18, choose **Study** or **Work**. Both paths are 51 spaces, one year each, and meet at 22.
5. Press **Spin**. The wheel is 1 through 10. **Speed run** keeps spinning until a choice or age 68. **Animation** off snaps the wheel.
6. You resolve the space you land on. **Payday** also pays when you pass it. A **stop** ends the move early; spin again.
7. Some years ask a yes or no. The answer is written into the decision log. Risky answers use the seed.
8. At 68 the working track stops. That is the end of this version.

The leaderboard shows age, money, savings, income, expenses, and happiness. Cash can go negative. Savings are the cash on hand when it is above zero. The amounts start from the figures in the spec, then the levers scale income and expenses.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
