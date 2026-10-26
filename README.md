# Life$pan — v0.5.0

Stage 2 of an online board: the working-life track, ages 18–68, the dashboard, and one point in a triangle. One player. Black and white, except the income, expense, savings, and death markers. Gender-neutral. The title on the page is Life$pan.

**v0.5.0** keeps the triangle and replaces the barycentric weights with inverse distance to the vertices. Income and the spending rate still follow that point. The death wedge blends the 2012 IAR reserve table and the 2017 Loaded CSO. Full health is the annuity table. No health is the life table. The center is the midpoint. The figure is a side-view walker. The only interest is a 4% borrowing charge while savings are negative. Decumulation is not in this version.

Flavor cards live in `spec/accumulation.json`, with original stills in `art/flavor/`. Each card has a caption, a still, and an empty animation slot. The still shows now. A later pass can replace it.

Events, amounts, the triangle, and both mortality series live in `spec/accumulation.json`. The page reads those figures. The next refresh of the rates is a data change.

This is an original board inspired by the rhythm of the classic accumulation game. It is not that game, and it is not affiliated with its publisher.

## Run

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use a local server. Opening the file directly will not load the board spec.

## Play

1. Name the game. A save is that name, a hyphen, and the seed. Resume loads the full name, such as Life$pan-482913.
2. Drag the point inside the triangle, or snap it to Health, Work, Frugality, or the center. It locks when the path starts. Along an edge, the far weight still moves.
3. A new game mints a seed from the start time. The same seed, the same point, and the same answers repeat the same wedge.
4. At 18, choose **Study** or **Work**. Both paths are 51 spaces, one year each, and meet at 22.
5. Press **Spin**. The wheel is 1 through 10, plus a death wedge for this age. **Speed run** keeps spinning until a choice, a death, or age 68. **Animation** off snaps the wheel.
6. Landing in the wedge ends the life on the current square. There is no numbered move.
7. You resolve the space you land on. **Payday** also pays when you pass it. A **stop** ends the move early; spin again.
8. Some years ask a yes or no. The answer is written into the decision log. Risky answers use the seed.
9. At 68 the working track stops, if the wedge has not already ended it.

The leaderboard shows age, income, annual expenses, and savings, plus this year's death probability and years left. Income is green unless it is negative. Expenses are red. Savings are green at zero or above and red below zero. A negative balance adds a 4% borrowing charge to expenses. A green or red plus or minus compares income, expenses, and death probability with the center. At the center, salary and event amounts stay the figures in the spec. Off the center, salary follows the income multiplier, and cash moves by the gap between this point's annual expenses and the center's, then by the borrowing charge.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
