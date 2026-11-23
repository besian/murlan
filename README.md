# Murlan

The Albanian shedding card game, in the browser. You can learn it with an interactive tutorial, play against 3 bots, or play online with friends; empty seats are filled with bots.

## Run it

```bash
npm install
npm run dev:server   # game server on :8787 (needed for online play)
npm run dev          # client on http://localhost:5173 (proxies /ws to the server)
npm test             # engine tests, 300 simulated bot games, online server integration tests
```

Bot mode runs entirely in the browser, so `npm run dev` alone is enough for it.

## Production

```bash
npm run build        # client -> dist/, server -> dist-server/
npm start            # one Node process serves the site + WebSocket on $PORT (default 8787)
```

The app is a single Node service, so any host that runs Node with WebSockets works. Examples:

- **Render / Railway**: create a Node web service from this repo. Build command `npm install && npm run build`, start command `npm start`.
- **Fly.io / any Docker host**: use the included `Dockerfile` (`fly launch`, or `docker build -t murlan . && docker run -p 8787:8787 murlan`).

Rooms live in memory on one server process. If the server restarts, games in progress are lost, and you can't run multiple instances behind a load balancer as-is.
If the client is hosted separately (e.g. GitHub Pages), build it with `VITE_SERVER_URL=wss://your-server/ws`.

## Tutorial

**Learn to play** has 7 short guided lessons, each a hand-built scenario on the real table:

1. Basics: card order, the 3♠ opener, singles, passing and winning a trick
2. Pairs and three of a kind, and coming back in after passing
3. Straights
4. Bombs
5. Jokers
6. Going out, finishing order and scoring
7. Card exchange between hands

A coach explains each situation and asks for a specific move. Wrong moves get an explanation, and "Show me" highlights the right cards.
Lessons are plain data in [`src/tutorial/lessons.ts`](src/tutorial/lessons.ts). A test plays every script through the real engine, so a lesson can't show a move the rules don't allow.

## Online play

- **Create a room** gives you a 4-letter code and an invite link (`?room=CODE`). Friends open the link, enter a name, and join.
- **Bots:** the host can add or remove bots in empty seats. **Start** fills any remaining seats with bots.
- **Authority:** the server holds the game and validates every move. Each client only receives its own hand (`viewFor`), and cards exchanged between other players are hidden.
- **Reconnecting:** a refresh or dropped connection takes you back to your seat, using a token saved in the browser.
  While you're away, a bot plays your turns. **Leave** during a game hands your seat to a bot permanently.
- **Timers:** 45 s per turn, after which a bot moves for you. After a hand, the host deals the next one, or it auto-deals after 30 s. Host duties pass to another player if the host leaves.

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
src/engine/      pure TypeScript game logic, shared by browser and server
  cards.ts       deck, ranks
  combos.ts      classify / compare combinations, enumerate legal plays
  game.ts        GameState + applyAction reducer (seeded RNG, replayable), viewFor(player)
  bot.ts         heuristic bot: picks the move that leaves the cheapest hand to finish
src/shared/      client <-> server message types
src/ui/          React UI: menu, table (renders a PlayerView), pile, rules
src/ui/online/   WebSocket hook, online menu, lobby
src/tutorial/    lesson scripts + lesson runner (coach panel)
server/          Node server: rooms, bots, timers, reconnects, static hosting
```
