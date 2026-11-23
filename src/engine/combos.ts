import { Card, RANK_A, RANK_2, isJoker } from './cards';

export type ComboType = 'single' | 'pair' | 'triple' | 'bomb' | 'straight';

export interface Combo {
  type: ComboType;
  cards: Card[];
  /**
   * Strength used for comparison within the same type.
   * For straights this is the position of the top card (A-low=1 ... A-high=14).
   */
  rank: number;
}

export const MIN_STRAIGHT = 5;

/** Position of a card inside a straight. Aces can be low (1) or high (14); 2s are always low (2). */
function straightPositions(card: Card): number[] {
  if (card.rank === RANK_A) return [1, 14];
  if (card.rank === RANK_2) return [2];
  return [card.rank];
}

/** Returns the top position of a valid straight made from these cards, or null. */
export function straightTop(cards: readonly Card[]): number | null {
  if (cards.length < MIN_STRAIGHT) return null;
  if (cards.some(isJoker)) return null;
  const aces = cards.filter((c) => c.rank === RANK_A).length;
  if (aces > 1) return null;
  const others = cards.filter((c) => c.rank !== RANK_A).map((c) => straightPositions(c)[0]);
  const tryWith = (acePos: number | null): number | null => {
    const pos = acePos === null ? others.slice() : [...others, acePos];
    pos.sort((a, b) => a - b);
    for (let i = 1; i < pos.length; i++) if (pos[i] !== pos[i - 1] + 1) return null;
    return pos[pos.length - 1];
  };
  if (aces === 0) return tryWith(null);
  // Prefer ace-high: it gives the stronger straight.
  return tryWith(14) ?? tryWith(1);
}

/** Classify a set of cards as a legal Murlan combination, or null if it isn't one. */
export function classify(cards: readonly Card[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;
  const list = cards.slice();
  if (n === 1) return { type: 'single', cards: list, rank: cards[0].rank };
  const sameRank = cards.every((c) => c.rank === cards[0].rank);
  // Jokers only ever play as singles.
  if (sameRank && !isJoker(cards[0])) {
    if (n === 2) return { type: 'pair', cards: list, rank: cards[0].rank };
    if (n === 3) return { type: 'triple', cards: list, rank: cards[0].rank };
    if (n === 4) return { type: 'bomb', cards: list, rank: cards[0].rank };
  }
  const top = straightTop(cards);
  if (top !== null) return { type: 'straight', cards: list, rank: top };
  return null;
}

/** Does `next` beat `prev` on the table? */
export function beats(next: Combo, prev: Combo): boolean {
  if (next.type === 'bomb') {
    return prev.type !== 'bomb' || next.rank > prev.rank;
  }
  if (next.type !== prev.type) return false;
  if (next.cards.length !== prev.cards.length) return false;
  return next.rank > prev.rank;
}

export function comboName(combo: Combo): string {
  switch (combo.type) {
    case 'single': return 'Single';
    case 'pair': return 'Pair';
    case 'triple': return 'Triple';
    case 'bomb': return 'Bomb';
    case 'straight': return `Straight of ${combo.cards.length}`;
  }
}

/**
 * Enumerate every distinct combination available in a hand (one representative
 * card choice per rank-level combo). `prefer` card ids are chosen first when picking suits.
 */
export function allCombos(hand: readonly Card[], prefer: readonly string[] = []): Combo[] {
  const byRank = new Map<number, Card[]>();
  for (const c of hand) {
    const arr = byRank.get(c.rank) ?? [];
    arr.push(c);
    byRank.set(c.rank, arr);
  }
  for (const arr of byRank.values()) {
    arr.sort((a, b) => Number(prefer.includes(b.id)) - Number(prefer.includes(a.id)));
  }
  const combos: Combo[] = [];
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    const group = byRank.get(r)!;
    if (group.length >= 1) {
      // Each card of a rank is a distinct single only for display reasons; one per rank is enough
      // except when a preferred card must be included.
      combos.push({ type: 'single', cards: [group[0]], rank: r });
    }
    if (isJoker(group[0])) continue;
    if (group.length >= 2) combos.push({ type: 'pair', cards: group.slice(0, 2), rank: r });
    if (group.length >= 3) combos.push({ type: 'triple', cards: group.slice(0, 3), rank: r });
    if (group.length === 4) combos.push({ type: 'bomb', cards: group.slice(0, 4), rank: r });
  }
  // Straights over positions 1 (A low) .. 14 (A high).
  const cardAtPos = (pos: number): Card | undefined => {
    if (pos === 1 || pos === 14) return byRank.get(RANK_A)?.[0];
    if (pos === 2) return byRank.get(RANK_2)?.[0];
    return byRank.get(pos)?.[0];
  };
  for (let start = 1; start <= 14 - MIN_STRAIGHT + 1; start++) {
    const run: Card[] = [];
    for (let pos = start; pos <= 14; pos++) {
      const c = cardAtPos(pos);
      if (!c) break;
      // An ace cannot appear twice (A-2-...-K-A).
      if (c.rank === RANK_A && run.some((x) => x.rank === RANK_A)) break;
      run.push(c);
      if (run.length >= MIN_STRAIGHT) {
        combos.push({ type: 'straight', cards: run.slice(), rank: pos });
      }
    }
  }
  return combos;
}

/** Combos from `hand` that may legally be played on top of `prev` (or led, if prev is null). */
export function legalPlays(
  hand: readonly Card[],
  prev: Combo | null,
  mustInclude: string | null = null,
): Combo[] {
  const prefer = mustInclude ? [mustInclude] : [];
  let combos = allCombos(hand, prefer);
  if (mustInclude) combos = combos.filter((c) => c.cards.some((x) => x.id === mustInclude));
  if (prev) combos = combos.filter((c) => beats(c, prev));
  return combos;
}
