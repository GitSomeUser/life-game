# LIFE — v0.2.2

Stage 1 of an online board: the working-life track, ages 18–68. One player. Black and white, gender-neutral, in the restrained line of Genesis Noir.

**v0.2.2 is still Stage 1.** No-stakes years draw a flavor card from the spec. v0.2.1 rewrote the event layer. v0.2.0 retuned the dollars. v0.1.0 was the first cut of this same board. Stages 2 and later (levers, dashboard, mortality, interest, retirement, decumulation, animation, speed run) are not in this repository.

Flavor cards live in `spec/accumulation.json`, with original stills in `art/flavor/`. Each card has a caption, a still, and an empty animation slot. The still shows now. A later pass can replace it.

Events, amounts, and the short source notes live in `spec/accumulation.json`. The page reads those figures. The next refresh is a data change, not a code change.

This is an original board inspired by the rhythm of the classic accumulation game. It is not that game, and it is not affiliated with its publisher.

## Run

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use a local server. Opening the file directly will not load the board spec.

## Play

1. Note the seed, or type a whole number of your own. The same seed repeats the same spins.
2. At 18, choose **Study** or **Work**. Both paths are 51 spaces, one year each, and meet at 22.
3. Press **Spin**. The wheel is 1 through 10.
4. You resolve the space you land on. **Payday** also pays when you pass it. A **stop** ends the move early; spin again.
5. Some years ask a yes or no. The answer is written into the decision log. Risky answers use the seed.
6. At 68 the working track stops. That is the end of this version.

Cash and age are the stats. Cash can go negative. The amounts are the current figures in the spec, not a retirement model.

Check the engine with:

```bash
node --test tests/engine.test.mjs
```

The board lives in `spec/accumulation.json`. The simulation in `src/engine.mjs` only reads that spec.
