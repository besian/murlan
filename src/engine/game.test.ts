import { createGame, applyAction, GameState, viewFor, checkPlay, IllegalMove } from './game';
import { chooseBotAction } from './bot';
import { nextRandom } from './rng';

const players = [
  { name: 'You', isBot: false },
  { name: 'A', isBot: true },
  { name: 'B', isBot: true },
  { name: 'C', isBot: true },
];

function totalCards(s: GameState) {
  return s.players.reduce((n, p) => n + p.hand.length, 0);
}

describe('game setup', () => {
  it('deals the full deck and 3♠ opens', () => {
    const g = createGame(players, 42);
    expect(totalCards(g)).toBe(54);
    expect(g.players.map((p) => p.hand.length).sort()).toEqual([13, 13, 14, 14]);
    expect(g.players[g.turn].hand.some((c) => c.id === '3S')).toBe(true);
    expect(g.mustInclude).toBe('3S');
    const other = g.players[g.turn].hand.find((c) => c.id !== '3S')!;
    expect(typeof checkPlay(g, g.turn, [other.id])).toBe('string');
    expect(typeof checkPlay(g, g.turn, ['3S'])).toBe('object');
  });

  it('cannot pass when leading, or play out of turn', () => {
    const g = createGame(players, 7);
    expect(() => applyAction(g, { type: 'pass', player: g.turn })).toThrow(IllegalMove);
    const other = (g.turn + 1) % 4;
    expect(() => applyAction(g, { type: 'play', player: other, cardIds: [g.players[other].hand[0].id] })).toThrow(IllegalMove);
  });

  it('trick goes back to last player after everyone passes', () => {
    let g = createGame(players, 3);
    const leader = g.turn;
    g = applyAction(g, { type: 'play', player: leader, cardIds: ['3S'] });
    for (let i = 0; i < 3; i++) g = applyAction(g, { type: 'pass', player: g.turn });
    expect(g.turn).toBe(leader);
    expect(g.table).toBeNull();
  });

  it('player view hides other hands', () => {
    const g = createGame(players, 1);
    const v = viewFor(g, 0);
    expect(v.hand).toBe(g.players[0].hand);
    expect(JSON.stringify(v.players)).not.toContain('"hand"');
  });
});

function playGame(seed: number) {
  let s = createGame(players.map((p) => ({ ...p, isBot: true })), seed);
  let rng = seed;
  const random = () => {
    const [v, n] = nextRandom(rng);
    rng = n;
    return v;
  };
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > 20000) throw new Error('game did not terminate, seed ' + seed);
    if (s.phase === 'handOver') {
      s = applyAction(s, { type: 'nextHand' });
      expect(totalCards(s)).toBe(54);
      continue;
    }
    const actor = s.phase === 'exchange' ? s.exchange!.winner : s.turn;
    const action = chooseBotAction(viewFor(s, actor), { random });
    s = applyAction(s, action);
    if (s.phase === 'playing' || s.phase === 'exchange') {
      const onTable = 0; // cards played leave the game; check hands never grow beyond 15
      expect(s.players.every((p) => p.hand.length <= 15 + onTable)).toBe(true);
      expect(s.players[s.turn].hand.length).toBeGreaterThan(0);
    }
  }
  return s;
}

describe('bot simulation', () => {
  it('plays hundreds of full games to completion without illegal moves', () => {
    const wins = [0, 0, 0, 0];
    let hands = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const end = playGame(seed);
      expect(end.winners.length).toBeGreaterThan(0);
      end.winners.forEach((w) => wins[w]++);
      hands += end.handNumber;
      const max = Math.max(...end.players.map((p) => p.score));
      expect(max).toBeGreaterThanOrEqual(21);
    }
    // Sanity: seats should be roughly balanced.
    expect(Math.min(...wins)).toBeGreaterThan(30);
    console.log('wins by seat', wins, 'avg hands/game', (hands / 300).toFixed(1));
  });
});
