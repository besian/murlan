import { Card, RANK_A, RANK_2, RANK_RED_JOKER, isJoker } from './cards';
import { Combo, legalPlays, MIN_STRAIGHT } from './combos';
import type { Action, PlayerView } from './game';

/**
 * Heuristic Murlan bot.
 *
 * It scores a hand as the cheapest way to split it into combos, where each combo costs
 * 10 (one more trip to the table) minus a bonus for being strong enough to win tricks.
 * A move is chosen by comparing the score of the hand left afterwards; passing costs a
 * small bias that grows when an opponent is about to go out.
 */

const COMBO_BASE = 10;

function strengthBonus(type: Combo['type'], rank: number, length: number): number {
  if (type === 'bomb') return 14 + (rank - 3) * 0.5;
  if (type === 'straight') return Math.max(0, rank - 10) * 1.2 + (length - MIN_STRAIGHT) * 0.5;
  // A=14 -> 8, 2=15 -> 10, black joker -> 12, red joker -> 14
  return Math.max(0, rank - 10) * 2;
}

function comboCost(type: Combo['type'], rank: number, length: number): number {
  return COMBO_BASE - strengthBonus(type, rank, length);
}

/** Rank counts, index by rank (3..17). */
type Counts = number[];

function countsOf(hand: readonly Card[]): Counts {
  const counts = new Array(18).fill(0);
  for (const c of hand) counts[c.rank]++;
  return counts;
}

/** Positions 1..14 for straights; A appears at 1 and 14, 2 at 2. */
function posRank(pos: number): number {
  if (pos === 1 || pos === 14) return RANK_A;
  if (pos === 2) return RANK_2;
  return pos;
}

function groupsCost(counts: Counts): number {
  let cost = 0;
  for (let r = 3; r <= RANK_RED_JOKER; r++) {
    const k = counts[r];
    if (k === 0) continue;
    if (r >= 16) {
      cost += k * comboCost('single', r, 1);
    } else if (k === 4) {
      cost += comboCost('bomb', r, 4);
    } else {
      const type = k === 1 ? 'single' : k === 2 ? 'pair' : 'triple';
      cost += comboCost(type, r, k);
    }
  }
  return cost;
}

const memo = new Map<string, number>();

/** Minimum total cost of splitting the hand into combos (lower = better hand). */
export function evaluateCounts(counts: Counts): number {
  const key = counts.join(',');
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = groupsCost(counts);
  // Try removing each possible straight and recursing.
  for (let start = 1; start <= 14 - MIN_STRAIGHT + 1; start++) {
    let len = 0;
    const used = counts.slice();
    for (let pos = start; pos <= 14; pos++) {
      const r = posRank(pos);
      if (used[r] === 0) break;
      if (r === RANK_A && len > 0 && start === 1 && pos === 14) break; // no A-...-A
      used[r]--;
      len++;
      if (len >= MIN_STRAIGHT) {
        const cost = comboCost('straight', pos, len) + evaluateCounts(used);
        if (cost < best) best = cost;
      }
    }
  }
  if (memo.size > 200_000) memo.clear();
  memo.set(key, best);
  return best;
}

export function evaluateHand(hand: readonly Card[]): number {
  return evaluateCounts(countsOf(hand));
}

function without(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
}

/** Very rough "nobody can beat this" check. */
function likelyWinner(c: Combo): boolean {
  if (c.type === 'bomb') return c.rank >= RANK_A;
  if (c.type === 'single') return c.rank === RANK_RED_JOKER;
  return false;
}

/** Number of combos needed to empty the hand (ignoring strength). */
function tripsLeft(hand: readonly Card[]): number {
  if (hand.length === 0) return 0;
  // Reuse the evaluator with strength stripped: approximate via distinct groups and straights.
  const counts = countsOf(hand);
  let groups = 0;
  for (let r = 3; r <= RANK_RED_JOKER; r++) if (counts[r] > 0) groups += r >= 16 ? counts[r] : 1;
  return groups;
}

export interface BotOptions {
  /** 0 = deterministic; higher adds randomness to choices. */
  noise?: number;
  random?: () => number;
}

export function chooseBotAction(view: PlayerView, opts: BotOptions = {}): Action {
  const me = view.me;
  const random = opts.random ?? Math.random;
  const noise = opts.noise ?? 0.6;
  const jitter = () => (noise ? (random() - 0.5) * noise : 0);

  if (view.phase === 'exchange') {
    // Give back whichever card hurts the hand least.
    let best: Card = view.hand[0];
    let bestScore = Infinity;
    for (const card of view.hand) {
      const score = evaluateHand(without(view.hand, [card])) + card.rank * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = card;
      }
    }
    return { type: 'exchangeReturn', player: me, cardId: best.id };
  }

  const hand = view.hand;
  const prev = view.table?.combo ?? null;
  const options = legalPlays(hand, prev, view.mustInclude);
  const opponents = view.players.filter((p) => p.id !== me && p.cardCount > 0);
  const minOpp = Math.min(...opponents.map((p) => p.cardCount), 99);

  // Can we go out right now?
  const finisher = options.find((c) => c.cards.length === hand.length);
  if (finisher) return play(me, finisher);

  const scoreMove = (c: Combo): number => {
    const rest = without(hand, c.cards);
    let score = evaluateHand(rest) + c.rank * 0.05 + jitter();
    // A guaranteed winner followed by a single combo to finish: take control and go out.
    if (likelyWinner(c) && tripsLeft(rest) <= 1) score -= 30;
    // Don't feed singles to someone who is down to one card.
    if (!prev && minOpp === 1 && c.type === 'single') {
      score += isJoker(c.cards[0]) || c.rank >= RANK_2 ? 0 : 8;
    }
    // Leading: shedding more cards at once is slightly better.
    if (!prev) score -= c.cards.length * 0.3;
    return score;
  };

  if (!prev) {
    // Leading — must play something.
    let best = options[0];
    let bestScore = Infinity;
    for (const c of options) {
      let s = scoreMove(c);
      // Avoid leading a bomb unless it sets up the finish.
      if (c.type === 'bomb' && tripsLeft(without(hand, c.cards)) > 1) s += 10;
      if (s < bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return play(me, best);
  }

  if (options.length === 0) return { type: 'pass', player: me };

  let passBias = 2;
  if (minOpp <= 3) passBias = 6;
  if (minOpp <= 1) passBias = 18;
  // If the table belongs to someone about to go out, fight harder.
  const owner = view.players[view.table!.player];
  if (owner.cardCount > 0 && owner.cardCount <= 2) passBias += 6;
  const passScore = evaluateHand(hand) + passBias + jitter();

  let best: Combo | null = null;
  let bestScore = passScore;
  for (const c of options) {
    const s = scoreMove(c);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best ? play(me, best) : { type: 'pass', player: me };
}

function play(player: number, combo: Combo): Action {
  return { type: 'play', player, cardIds: combo.cards.map((c) => c.id) };
}
