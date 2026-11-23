# Murlan

The Albanian shedding card game, in the browser. Right now you play against 3 bots; the engine is built so online multiplayer can be added on top.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine + 300 simulated bot games
npm run build    # static site in dist/
```

## Rules implemented

- 4 players, 54 cards (52 + 2 jokers), whole deck dealt (two players get 14, two get 13).
- Order: `3 4 5 6 7 8 9 10 J Q K A 2 · Black Joker · Red Joker`. Suits don't matter.
- Combos: single, pair, three of a kind, straight (5+ in a row; ace high or low, `A-2-3-4-5` is the lowest, no wrap, no jokers), bomb (four of a kind).
- Beat the table with the same combo type and size at a higher rank. A bomb beats anything except a higher bomb. Jokers only play as singles.
- Passing doesn't lock you out of the trick. When everyone else passes, the last player to play leads. If they already went out, the next player still in leads.
- First hand: the holder of the 3♠ leads and must include it.
- Between hands, last place gives their highest card to the winner, who gives any card back. Last place then leads. If last place holds both jokers, there's no exchange and the winner leads.
- Scoring: 3 / 2 / 1 / 0. First to 21 wins. If several players reach the target in the same hand, it goes up by 10, up to a maximum of 51.

House rules vary, so the rule logic lives in [`src/engine/combos.ts`](src/engine/combos.ts) and [`src/engine/game.ts`](src/engine/game.ts).

## Code layout

```
src/engine/   pure TypeScript, no DOM, so it can run on a server later
  cards.ts    deck, ranks
  combos.ts   classify / compare combinations, enumerate legal plays
  game.ts     game state + applyAction reducer (seeded RNG, fully replayable), viewFor(player)
  bot.ts      heuristic bot: picks the move that leaves the cheapest hand to finish
src/ui/       React table UI
```

`applyAction(state, action)` is a pure reducer and `viewFor(state, player)` returns only what that player may see. Online play can be added by running the reducer on a server and sending each client its view.
