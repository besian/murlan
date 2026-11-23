import { makeDeck, Card } from './cards';
import { classify, beats, legalPlays, allCombos } from './combos';

const deck = makeDeck();
const c = (...ids: string[]): Card[] => ids.map((id) => {
  const card = deck.find((x) => x.id === id);
  if (!card) throw new Error('no card ' + id);
  return card;
});

describe('classify', () => {
  it('recognises basic sets', () => {
    expect(classify(c('3S'))?.type).toBe('single');
    expect(classify(c('3S', '3H'))?.type).toBe('pair');
    expect(classify(c('KS', 'KH', 'KD'))?.type).toBe('triple');
    expect(classify(c('9S', '9H', '9D', '9C'))?.type).toBe('bomb');
    expect(classify(c('3S', '4H'))).toBeNull();
  });
  it('jokers only play as singles', () => {
    expect(classify(c('BJ'))?.type).toBe('single');
    expect(classify(c('BJ', 'RJ'))).toBeNull();
    expect(classify(c('3S', '4S', '5S', '6S', 'BJ'))).toBeNull();
  });
  it('handles straights with ace high/low and 2 low', () => {
    expect(classify(c('3S', '4H', '5D', '6C', '7S'))).toMatchObject({ type: 'straight', rank: 7 });
    expect(classify(c('10S', 'JH', 'QD', 'KC', 'AS'))).toMatchObject({ type: 'straight', rank: 14 });
    expect(classify(c('AS', '2H', '3D', '4C', '5S'))).toMatchObject({ type: 'straight', rank: 5 });
    expect(classify(c('2H', '3D', '4C', '5S', '6S'))).toMatchObject({ type: 'straight', rank: 6 });
    // no wrap-around, and 2 is never high
    expect(classify(c('JS', 'QH', 'KD', 'AC', '2S'))).toBeNull();
    expect(classify(c('3S', '4H', '5D', '6C'))).toBeNull();
  });
});

describe('beats', () => {
  const k = (...ids: string[]) => classify(c(...ids))!;
  it('needs same type and length, higher rank', () => {
    expect(beats(k('4S'), k('3S'))).toBe(true);
    expect(beats(k('3H'), k('3S'))).toBe(false);
    expect(beats(k('2S'), k('AS'))).toBe(true);
    expect(beats(k('RJ'), k('BJ'))).toBe(true);
    expect(beats(k('5S', '5H'), k('4S'))).toBe(false);
    expect(beats(k('4S', '5H', '6D', '7C', '8S'), k('3S', '4H', '5D', '6C', '7S'))).toBe(true);
    expect(beats(k('4S', '5H', '6D', '7C', '8S', '9S'), k('3S', '4H', '5D', '6C', '7S'))).toBe(false);
  });
  it('bombs beat everything except higher bombs', () => {
    const bomb = k('5S', '5H', '5D', '5C');
    expect(beats(bomb, k('RJ'))).toBe(true);
    expect(beats(bomb, k('2S', '2H', '2D'))).toBe(true);
    expect(beats(bomb, k('10S', 'JH', 'QD', 'KC', 'AS'))).toBe(true);
    expect(beats(k('6S', '6H', '6D', '6C'), bomb)).toBe(true);
    expect(beats(k('4S', '4H', '4D', '4C'), bomb)).toBe(false);
  });
});

describe('legalPlays', () => {
  it('respects mustInclude', () => {
    const hand = c('3S', '3H', '4D', '5C', '6S', '7S', 'KD');
    const plays = legalPlays(hand, null, '3S');
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((p) => p.cards.some((x) => x.id === '3S'))).toBe(true);
    expect(plays.some((p) => p.type === 'straight')).toBe(true);
    expect(plays.some((p) => p.type === 'pair')).toBe(true);
  });
  it('finds straights of every length', () => {
    const hand = c('3S', '4H', '5D', '6C', '7S', '8S');
    const straights = allCombos(hand).filter((p) => p.type === 'straight');
    expect(straights.map((s) => s.cards.length).sort()).toEqual([5, 5, 6]);
  });
});
