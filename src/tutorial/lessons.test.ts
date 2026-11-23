import { applyAction } from '../engine';
import { LESSONS, matchesSolution } from './lessons';

describe('tutorial lessons', () => {
  for (const lesson of LESSONS) {
    it(`"${lesson.title}" plays out under the real rules`, () => {
      let s = lesson.setup();
      const total = s.players.reduce((n, p) => n + p.hand.length, 0);
      const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
      expect(new Set(ids).size).toBe(ids.length); // no duplicate cards
      expect(total).toBeGreaterThan(0);
      for (const [i, step] of lesson.steps.entries()) {
        if (step.kind === 'say') continue;
        const action = step.kind === 'bot' ? step.action : step.solution;
        const actor = s.phase === 'exchange' ? s.exchange!.winner : s.turn;
        expect(action.type).not.toBe('nextHand');
        const player = action.type === 'nextHand' ? -1 : action.player;
        expect(player, `step ${i} acts out of turn`).toBe(actor);
        if (step.kind === 'you') {
          expect(player).toBe(0);
          expect(matchesSolution(action, step.solution, s)).toBe(true);
        }
        s = applyAction(s, action); // throws if illegal
      }
    });
  }

  it('the scoring lesson ends the hand with 3/2/1/0 points', () => {
    const lesson = LESSONS.find((l) => l.id === 'scoring')!;
    let s = lesson.setup();
    for (const step of lesson.steps) {
      if (step.kind === 'bot') s = applyAction(s, step.action);
      if (step.kind === 'you') s = applyAction(s, step.solution);
    }
    expect(s.phase).toBe('handOver');
    expect(s.players.map((p) => p.score)).toEqual([15, 17, 10, 10]);
  });
});
