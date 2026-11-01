# Life - v0.10.3

Stage 2 of an online board: the working-life climb, ages 18-68. One player. The first screen is three words, the game name, and the animation and speed-run toggles. The choice locks when Study or Work begins, and the save stores it.

**Life** is the traditional Game of Life. Squares are events, not years. Paydays stay paydays. A move does not pay salary or charge expenses on every space. Living costs are baked into the spaces and the paydays. No triangle. Life amounts are separate from Life$pan and Life$pan+: a careful life can finish with savings, and a careless one can finish broke. Neither path is a sure thing. A click on Life, Life$pan, or Life$pan+ starts a new game. The player does not type a seed, and the seed is not on the screen. Every decision uses that same treatment. Waiting options, including those three modes, Study or Work, a yes or no, and any other choice, vibrate: the type cycles between bold and dim, and through a few fonts. The picked one stays steady and bold. The others stay dim. The board is the classic climb again: a car, a wedding, a baby, a huge house down payment, credit cards that stack until they come due, medical decisions, and other costs and windfalls. A straight play can finish broke.

**Life$pan** - the S is a dollar sign. Each square is one year. Moving one space pays that year's salary and charges that year's expenses. Right after a spin, the card says the age and how many years just passed. Years passed equals spaces moved. Former paydays are named Promo?. No triangle. Retirement is not built yet.

**Life$pan+** is the same years, the same per-space pay and expenses, and the same Promo? tile as Life$pan, plus the triangle, both mortality tables, the walker, income, expenses, savings, and 4% interest or borrowing. This replaces the name Entirety. The triangle is a setup control and hides when the path starts. Two of the Promo? spins can nudge the point later, and those two do not change pay. Inverse-distance weights, the 2012 IAR reserve table and the 2017 Loaded CSO, a side-view walker, and the death wedge. Full health is the annuity table. No health is the life table. The center is the midpoint. Positive savings earn 4% a year. Negative savings pay a 4% borrowing charge.

The spaces are a climb. The walker stays at the bottom of the view and the spaces move past. There is no downslope. Landing plays a short original beat. The leaderboard is the stats panel. It can cycle players. One player is enough.

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

1. Click **Life**, **Life$pan**, or **Life$pan+**. That starts a new game. You can flip it until the path starts. While they are waiting, the three words vibrate.
2. Name the game if you want a save. Save stores that name and the mode. Resume loads the name you typed. If the name box is empty, Resume does nothing.
3. On Life$pan+, drag the point inside the triangle before the path starts, or snap it to Health, Work, Frugality, or the center. The triangle hides once Study or Work begins.
4. New game returns to the opening choice. The next click on a mode starts another game.
5. At the start, choose **Study** or **Work**. Every decision uses the same treatment as those three opening words. Waiting options vibrate between bold and dim. The picked one stays steady and bold. The others stay dim. Both paths are 51 spaces and meet on the fifth square. On Life$pan and Life$pan+ each square is one year, ages 18-68, and moving one space pays that year's salary and charges that year's expenses. On Life the squares are events, not years, and only paydays pay.
6. Press **Spin**. Life and Life$pan roll 1 through 10. Life$pan+ adds a death wedge for this age. **Speed run** keeps spinning until a choice, a death, or age 68. **Animation** off snaps the wheel and skips the beat. A yes or no, and any other choice, vibrates the same way until one is picked.
7. On Life$pan+, landing in the wedge ends the life on the current square. There is no numbered move.
8. You resolve the space you land on. On Life, **Payday** also pays when you pass it. On Life$pan and Life$pan+, that tile is **Promo?** instead. A **stop** ends the move early; spin again. A landing plays a short original beat.
9. Some years ask a yes or no. Those options vibrate until one is picked. The picked one stays steady and bold. The other stays dim. An investment always asks. Each landing rolls a fresh chance, a step of 10 from 10% through 80%. The odds are on the choice before you decide. A win doubles the stake. Otherwise the stake is gone. The operation is the other risky choice, and that one stays fixed for the game. The answer is written into the decision log.
10. At 68 the working track stops. On Life$pan+, the wedge can end it sooner. Retirement spaces are not on the board.

Promo?, on Life$pan and Life$pan+ only, runs when you land on or pass a former payday. The card states the odds for the mode you are in. Both modes share 2 in 10 temporary pay bonus, 2 in 10 temporary pay cut, 2 in 10 permanent pay promotion, 2 in 100 expenses increase, and the rest stay the same. On Life$pan the two 1-in-10 spins are a temporary bonus with a permanent pay increase, and a temporary expense increase with a permanent pay decrease. On Life$pan+ those two spins move the triangle slightly closer or slightly away, and they do not change pay. A later demotion cannot drop pay below 80% of starting pay. Temporary means this year only.

Life shows the event, savings, and pay. It does not show an age, and it does not say years passed. Life$pan shows age, pay, this year's expenses, and savings. Right after a spin it says the age and how many years passed. Life$pan+ shows age, income, annual expenses, and savings, plus this year's death probability and years left, and the same years-passed line. On Life$pan and Life$pan+, moving one space pays that year's salary and charges that year's expenses. Life does not. Income is green unless it is negative. Expenses are red. Savings are green at zero or above and red below zero. A negative balance on Life$pan+ adds a 4% borrowing charge. A positive balance earns 4% a year, added to savings. A green or red plus or minus compares income, expenses, and death probability with the center. At the center, salary stays the figure in the spec. Off the center, salary follows the income multiplier. Life and Life$pan do not apply that multiplier, the interest, or the borrowing charge.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
