# LIFE — v0.4.0

Stage 2 of an online board: the working-life track, ages 18–68, the dashboard, and one point in a triangle. One player. Black and white, except the income, expense, and death markers. Gender-neutral.

**v0.4.0 replaces the v0.3.0 sliders.** Health, work, and frugality are barycentric weights. The center changes nothing. Work scales income. Frugality and health change the spending rate. Health also scales the death wedge. The spinner is 1 through 10 plus that wedge. Interest and decumulation are not in this version.

Flavor cards live in `spec/accumulation.json`, with original stills in `art/flavor/`. Each card has a caption, a still, and an empty animation slot. The still shows now. A later pass can replace it.

Events, amounts, the triangle, and both mortality series live in `spec/accumulation.json`. The page reads those figures. The next refresh of the rates is a data change.

This is an original board inspired by the rhythm of the classic accumulation game. It is not that game, and it is not affiliated with its publisher.

## Run

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use a local server. Opening the file directly will not load the board spec.

## Play

1. Name the game. The same name saves and resumes in this browser.
2. Drag the point inside the triangle, or snap it to Health, Work, Frugality, or the center. It locks when the path starts.
3. Note the seed, or type a whole number of your own. The same seed, the same point, and the same answers repeat the same wedge.
4. At 18, choose **Study** or **Work**. Both paths are 51 spaces, one year each, and meet at 22.
5. Press **Spin**. The wheel is 1 through 10, plus a death wedge for this age. **Speed run** keeps spinning until a choice, a death, or age 68. **Animation** off snaps the wheel.
6. Landing in the wedge ends the life on the current square. There is no numbered move.
7. You resolve the space you land on. **Payday** also pays when you pass it. A **stop** ends the move early; spin again.
8. Some years ask a yes or no. The answer is written into the decision log. Risky answers use the seed.
9. At 68 the working track stops, if the wedge has not already ended it.

The leaderboard shows age, money, savings, income, monthly expenses, this year's death probability, and years left. A green or red plus or minus compares income, expenses, and death probability with the center. Cash can go negative. Savings are the cash on hand when it is above zero. At the center, salary and event amounts stay the figures in the spec. Off the center, salary follows the income multiplier, and cash moves by the gap between this point's annual expenses and the center's.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
