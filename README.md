# Life — v0.6.0

Stage 2 of an online board: the working-life track, ages 18–68. One player. Before the path starts, pick a mode. It locks when Study or Work begins, and the save stores it.

**Novice** is traditional Life. Age, cash, and pay. The spinner is 1 through 10. No triangle, no death wedge, no mortality tables, no walker, and no borrowing charge. The accumulation board, the flavor years, and Study or Work stay.

**Beginner** is Life$pan. It plays like Novice. Retirement is named on the screen and is not built in this version.

**Advanced** is the Stage 2 board. The title is Life$pan. One point in a triangle, inverse-distance weights, the 2012 IAR reserve table and the 2017 Loaded CSO, a side-view walker, income, expenses, savings, and the death wedge. Full health is the annuity table. No health is the life table. The center is the midpoint. The only interest is a 4% borrowing charge while savings are negative. Black and white, except the income, expense, savings, and death markers. Gender-neutral.

Decumulation is not in this version. Retirement spaces are not in this version.

Flavor cards live in `spec/accumulation.json`, with original stills in `art/flavor/`. Each card has a caption, a still, and an empty animation slot. The still shows now. A later pass can replace it.

Events, amounts, the triangle, and both mortality series live in `spec/accumulation.json`. The page reads those figures. The next refresh of the rates is a data change.

This is an original board inspired by the rhythm of the classic accumulation game. It is not that game, and it is not affiliated with its publisher.

## Run

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use a local server. Opening the file directly will not load the board spec.

## Play

1. Pick **Novice**, **Beginner**, or **Advanced**. You can flip it until the path starts.
2. Name the game. A save is that name, a hyphen, and the seed, and it stores the mode. Resume loads the full name, such as Life$pan-482913.
3. On Advanced, drag the point inside the triangle, or snap it to Health, Work, Frugality, or the center. Along an edge, the far weight still moves. Novice and Beginner have no triangle.
4. A new game mints a seed from the start time and returns to the mode choice.
5. At 18, choose **Study** or **Work**. Both paths are 51 spaces, one year each, and meet at 22.
6. Press **Spin**. Novice and Beginner roll 1 through 10. Advanced adds a death wedge for this age. **Speed run** keeps spinning until a choice, a death, or age 68. **Animation** off snaps the wheel.
7. On Advanced, landing in the wedge ends the life on the current square. There is no numbered move.
8. You resolve the space you land on. **Payday** also pays when you pass it. A **stop** ends the move early; spin again.
9. Some years ask a yes or no. The answer is written into the decision log. Risky answers use the seed.
10. At 68 the working track stops. On Advanced, the wedge can end it sooner. Retirement spaces are not on the board.

Novice and Beginner show age, cash, and pay. Advanced shows age, income, annual expenses, and savings, plus this year's death probability and years left. Income is green unless it is negative. Expenses are red. Savings are green at zero or above and red below zero. A negative balance adds a 4% borrowing charge to expenses. A green or red plus or minus compares income, expenses, and death probability with the center. At the center, salary and event amounts stay the figures in the spec. Off the center, salary follows the income multiplier, and cash moves by the gap between this point's annual expenses and the center's, then by the borrowing charge. Novice and Beginner do not apply those multipliers or that charge.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
