import { Combo, rankLabel, RANK_A, RANK_BLACK_JOKER, RANK_RED_JOKER } from '../engine';

function plural(rank: number) {
  const l = rankLabel(rank);
  return l === 'A' ? 'Aces' : l + 's';
}

function straightLabel(pos: number) {
  if (pos === 1 || pos === 14) return rankLabel(RANK_A);
  if (pos === 2) return '2';
  return rankLabel(pos);
}

export function describeCombo(c: Combo): string {
  switch (c.type) {
    case 'single':
      if (c.rank === RANK_RED_JOKER) return 'Red Joker';
      if (c.rank === RANK_BLACK_JOKER) return 'Black Joker';
      return `single ${rankLabel(c.rank)}`;
    case 'pair': return `pair of ${plural(c.rank)}`;
    case 'triple': return `three ${plural(c.rank)}`;
    case 'bomb': return `BOMB — four ${plural(c.rank)}`;
    case 'straight': {
      const low = c.rank - c.cards.length + 1;
      return `straight ${straightLabel(low)}–${straightLabel(c.rank)}`;
    }
  }
}

export function ordinal(n: number) {
  return ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
}
