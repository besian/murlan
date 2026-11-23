export type Suit = 'S' | 'H' | 'D' | 'C';

/**
 * Rank values, low to high:
 * 3..10, J=11, Q=12, K=13, A=14, 2=15, black joker=16, red joker=17.
 */
export type Rank = number;

export const RANK_J = 11;
export const RANK_Q = 12;
export const RANK_K = 13;
export const RANK_A = 14;
export const RANK_2 = 15;
export const RANK_BLACK_JOKER = 16;
export const RANK_RED_JOKER = 17;

export interface Card {
  /** Stable id, e.g. "3S", "10H", "AD", "2C", "BJ", "RJ". */
  id: string;
  rank: Rank;
  suit: Suit | null;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case RANK_J: return 'J';
    case RANK_Q: return 'Q';
    case RANK_K: return 'K';
    case RANK_A: return 'A';
    case RANK_2: return '2';
    case RANK_BLACK_JOKER: return 'Joker';
    case RANK_RED_JOKER: return 'Joker';
    default: return String(rank);
  }
}

export function isJoker(card: Card): boolean {
  return card.rank >= RANK_BLACK_JOKER;
}

export function isRed(card: Card): boolean {
  return card.suit === 'H' || card.suit === 'D' || card.rank === RANK_RED_JOKER;
}

export function cardLabel(card: Card): string {
  if (card.rank === RANK_BLACK_JOKER) return 'Black Joker';
  if (card.rank === RANK_RED_JOKER) return 'Red Joker';
  return rankLabel(card.rank) + SUIT_SYMBOL[card.suit!];
}

export const THREE_OF_SPADES = '3S';

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let rank = 3; rank <= RANK_2; rank++) {
    for (const suit of SUITS) {
      deck.push({ id: rankLabel(rank) + suit, rank, suit });
    }
  }
  deck.push({ id: 'BJ', rank: RANK_BLACK_JOKER, suit: null });
  deck.push({ id: 'RJ', rank: RANK_RED_JOKER, suit: null });
  return deck;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

/** Sort low to high by rank, then by a fixed suit order for a tidy hand display. */
export function sortCards(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) =>
    a.rank - b.rank || (a.suit && b.suit ? SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] : 0),
  );
}
