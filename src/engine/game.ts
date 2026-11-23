import { Card, makeDeck, sortCards, THREE_OF_SPADES, RANK_BLACK_JOKER, RANK_RED_JOKER } from './cards';
import { Combo, beats, classify } from './combos';
import { shuffle } from './rng';

export type Phase = 'exchange' | 'playing' | 'handOver' | 'gameOver';

export interface PlayerState {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
  score: number;
}

export interface TablePlay {
  player: number;
  combo: Combo;
}

export type LogEntry =
  | { kind: 'play'; player: number; combo: Combo }
  | { kind: 'pass'; player: number }
  | { kind: 'trickWon'; player: number }
  | { kind: 'out'; player: number; place: number }
  /** `card` is null in views of players who weren't part of the exchange. */
  | { kind: 'exchange'; from: number; to: number; card: Card | null }
  | { kind: 'jokersShown'; player: number }
  | { kind: 'handStart'; hand: number }
  | { kind: 'handEnd'; order: number[]; points: number[] }
  | { kind: 'targetRaised'; target: number };

export interface ExchangeState {
  /** Winner of the previous hand, who must return a card. */
  winner: number;
  /** Last place of the previous hand, who gave their highest card. */
  loser: number;
  received: Card;
}

export interface GameState {
  players: PlayerState[];
  phase: Phase;
  /** Whose move it is (playing / exchange). */
  turn: number;
  handNumber: number;
  dealer: number;
  /** The combination currently on the table, if any. */
  table: TablePlay | null;
  /** Consecutive passes since the last play. */
  passes: number;
  /** Player ids in the order they emptied their hand this hand. */
  finishOrder: number[];
  /** Card that must be included in the opening play (3♠ on the first hand). */
  mustInclude: string | null;
  exchange: ExchangeState | null;
  /** Finish order of the previous hand, used for the card exchange. */
  lastHandOrder: number[] | null;
  target: number;
  winners: number[];
  log: LogEntry[];
  seed: number;
}

export type Action =
  | { type: 'play'; player: number; cardIds: string[] }
  | { type: 'pass'; player: number }
  | { type: 'exchangeReturn'; player: number; cardId: string }
  | { type: 'nextHand' };

export interface PlayerConfig {
  name: string;
  isBot: boolean;
}

export const POINTS_BY_PLACE = [3, 2, 1, 0];
export const START_TARGET = 21;
export const MAX_TARGET = 51;

export class IllegalMove extends Error {}

export function createGame(players: PlayerConfig[], seed = Date.now() >>> 0): GameState {
  if (players.length < 2 || players.length > 4) throw new Error('Murlan needs 2–4 players');
  const base: GameState = {
    players: players.map((p, id) => ({ id, name: p.name, isBot: p.isBot, hand: [], score: 0 })),
    phase: 'playing',
    turn: 0,
    handNumber: 0,
    dealer: players.length - 1,
    table: null,
    passes: 0,
    finishOrder: [],
    mustInclude: null,
    exchange: null,
    lastHandOrder: null,
    target: START_TARGET,
    winners: [],
    log: [],
    seed: seed >>> 0,
  };
  return startHand(base);
}

function nextSeat(state: GameState, from: number): number {
  return (from + 1) % state.players.length;
}

export function isActive(state: GameState, player: number): boolean {
  return state.players[player].hand.length > 0;
}

function activePlayers(state: GameState): number[] {
  return state.players.filter((p) => p.hand.length > 0).map((p) => p.id);
}

function nextActive(state: GameState, from: number): number {
  let p = nextSeat(state, from);
  for (let i = 0; i < state.players.length; i++) {
    if (isActive(state, p)) return p;
    p = nextSeat(state, p);
  }
  return from;
}

function startHand(prev: GameState): GameState {
  const n = prev.players.length;
  const dealer = prev.handNumber === 0 ? prev.dealer : (prev.dealer + 1) % n;
  const [deck, seed] = shuffle(makeDeck(), prev.seed);
  const hands: Card[][] = prev.players.map(() => []);
  // Deal the whole deck one at a time, starting left of the dealer.
  deck.forEach((card, i) => hands[(dealer + 1 + i) % n].push(card));
  const players = prev.players.map((p, i) => ({ ...p, hand: sortCards(hands[i]) }));
  const handNumber = prev.handNumber + 1;
  let state: GameState = {
    ...prev,
    players,
    dealer,
    handNumber,
    seed,
    table: null,
    passes: 0,
    finishOrder: [],
    exchange: null,
    mustInclude: null,
    log: [...prev.log, { kind: 'handStart', hand: handNumber }],
  };

  const order = prev.lastHandOrder;
  if (!order) {
    // First hand: holder of 3♠ leads and must include it.
    const opener = players.findIndex((p) => p.hand.some((c) => c.id === THREE_OF_SPADES));
    return { ...state, phase: 'playing', turn: opener, mustInclude: THREE_OF_SPADES };
  }

  const winner = order[0];
  const loser = order[order.length - 1];
  const loserHand = state.players[loser].hand;
  const hasBothJokers =
    loserHand.some((c) => c.rank === RANK_BLACK_JOKER) && loserHand.some((c) => c.rank === RANK_RED_JOKER);
  if (hasBothJokers) {
    // Loser shows both jokers: no exchange, and the winner leads instead.
    return {
      ...state,
      phase: 'playing',
      turn: winner,
      log: [...state.log, { kind: 'jokersShown', player: loser }],
    };
  }
  // Loser gives their highest card to the winner, who then returns any card of their choice.
  const highest = loserHand[loserHand.length - 1];
  state = moveCard(state, loser, winner, highest.id);
  return {
    ...state,
    phase: 'exchange',
    turn: winner,
    exchange: { winner, loser, received: highest },
    log: [...state.log, { kind: 'exchange', from: loser, to: winner, card: highest }],
  };
}

function moveCard(state: GameState, from: number, to: number, cardId: string): GameState {
  const card = state.players[from].hand.find((c) => c.id === cardId);
  if (!card) throw new IllegalMove(`Player ${from} does not hold ${cardId}`);
  const players = state.players.map((p) => {
    if (p.id === from) return { ...p, hand: p.hand.filter((c) => c.id !== cardId) };
    if (p.id === to) return { ...p, hand: sortCards([...p.hand, card]) };
    return p;
  });
  return { ...state, players };
}

/** Can `player` pass right now? Only when there is something on the table to respond to. */
export function canPass(state: GameState, player: number): boolean {
  return state.phase === 'playing' && state.turn === player && state.table !== null;
}

/** Validate a proposed play without applying it; returns the combo or an error message. */
export function checkPlay(state: GameState, player: number, cardIds: string[]): Combo | string {
  return validatePlay(state, player, state.players[player].hand, cardIds);
}

/** The parts of the game a play is checked against — satisfied by both GameState and PlayerView. */
export interface PlayContext {
  phase: Phase;
  turn: number;
  table: TablePlay | null;
  mustInclude: string | null;
}

export function validatePlay(state: PlayContext, player: number, hand: readonly Card[], cardIds: string[]): Combo | string {
  if (state.phase !== 'playing') return 'Not in play';
  if (state.turn !== player) return 'Not your turn';
  const cards: Card[] = [];
  for (const id of cardIds) {
    const c = hand.find((x) => x.id === id);
    if (!c || cards.includes(c)) return 'You do not hold those cards';
    cards.push(c);
  }
  const combo = classify(cards);
  if (!combo) return 'That is not a valid combination';
  if (state.mustInclude && !cardIds.includes(state.mustInclude)) return 'Your first play must include the 3♠';
  if (state.table && !beats(combo, state.table.combo)) {
    return combo.type === state.table.combo.type || combo.type === 'bomb'
      ? 'Not high enough'
      : `You must play a ${describeNeeded(state.table.combo)} (or a bomb)`;
  }
  return combo;
}

function describeNeeded(c: Combo): string {
  return c.type === 'straight' ? `straight of ${c.cards.length}` : c.type;
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'play': return applyPlay(state, action.player, action.cardIds);
    case 'pass': return applyPass(state, action.player);
    case 'exchangeReturn': return applyExchangeReturn(state, action.player, action.cardId);
    case 'nextHand': {
      if (state.phase !== 'handOver') throw new IllegalMove('Hand is not over');
      return startHand(state);
    }
  }
}

function applyExchangeReturn(state: GameState, player: number, cardId: string): GameState {
  if (state.phase !== 'exchange' || !state.exchange) throw new IllegalMove('No exchange pending');
  if (player !== state.exchange.winner) throw new IllegalMove('Only the winner returns a card');
  const { winner, loser } = state.exchange;
  const card = state.players[winner].hand.find((c) => c.id === cardId);
  if (!card) throw new IllegalMove('You do not hold that card');
  const moved = moveCard(state, winner, loser, cardId);
  return {
    ...moved,
    phase: 'playing',
    exchange: null,
    turn: loser, // last place leads the next hand
    log: [...moved.log, { kind: 'exchange', from: winner, to: loser, card }],
  };
}

function applyPlay(state: GameState, player: number, cardIds: string[]): GameState {
  const result = checkPlay(state, player, cardIds);
  if (typeof result === 'string') throw new IllegalMove(result);
  const combo = result;
  const players = state.players.map((p) =>
    p.id === player ? { ...p, hand: p.hand.filter((c) => !cardIds.includes(c.id)) } : p,
  );
  let next: GameState = {
    ...state,
    players,
    table: { player, combo },
    passes: 0,
    mustInclude: null,
    log: [...state.log, { kind: 'play', player, combo }],
  };
  if (players[player].hand.length === 0) {
    const finishOrder = [...next.finishOrder, player];
    next = {
      ...next,
      finishOrder,
      log: [...next.log, { kind: 'out', player, place: finishOrder.length }],
    };
    const remaining = activePlayers(next);
    if (remaining.length <= 1) return endHand({ ...next, finishOrder: [...finishOrder, ...remaining] });
  }
  return { ...next, turn: nextActive(next, player) };
}

function applyPass(state: GameState, player: number): GameState {
  if (!canPass(state, player)) throw new IllegalMove('You cannot pass now');
  const passes = state.passes + 1;
  const table = state.table!;
  const responders = activePlayers(state).filter((p) => p !== table.player).length;
  const log: LogEntry[] = [...state.log, { kind: 'pass', player }];
  if (passes >= responders) {
    // Everybody passed: the last player to play wins the trick and leads.
    // If they already went out, the lead passes to the next active player after them.
    const leader = isActive(state, table.player) ? table.player : nextActive(state, table.player);
    return {
      ...state,
      table: null,
      passes: 0,
      turn: leader,
      log: [...log, { kind: 'trickWon', player: table.player }],
    };
  }
  return { ...state, passes, turn: nextActive(state, player), log };
}

function endHand(state: GameState): GameState {
  const order = state.finishOrder;
  const points = state.players.map(() => 0);
  order.forEach((p, place) => (points[p] = POINTS_BY_PLACE[place] ?? 0));
  const players = state.players.map((p) => ({ ...p, score: p.score + points[p.id], hand: [] }));
  const log: LogEntry[] = [...state.log, { kind: 'handEnd', order, points }];
  let target = state.target;
  let phase: Phase = 'handOver';
  let winners: number[] = [];
  const reached = players.filter((p) => p.score >= target);
  if (reached.length === 1) {
    phase = 'gameOver';
    winners = [reached[0].id];
  } else if (reached.length > 1) {
    if (target >= MAX_TARGET) {
      phase = 'gameOver';
      winners = reached.map((p) => p.id);
    } else {
      target += 10;
      log.push({ kind: 'targetRaised', target });
    }
  }
  return {
    ...state,
    players,
    table: null,
    passes: 0,
    phase,
    target,
    winners,
    lastHandOrder: order,
    log,
  };
}

/** What a single player is allowed to see — the shape a future online server would send. */
export interface PlayerView {
  me: number;
  hand: Card[];
  players: { id: number; name: string; isBot: boolean; cardCount: number; score: number }[];
  /** Events of the current hand, with other players' exchanged cards hidden. */
  log: LogEntry[];
  phase: Phase;
  turn: number;
  table: TablePlay | null;
  passes: number;
  finishOrder: number[];
  mustInclude: string | null;
  exchange: ExchangeState | null;
  target: number;
  winners: number[];
  handNumber: number;
  lastHandOrder: number[] | null;
}

export function viewFor(state: GameState, me: number): PlayerView {
  const ex = state.exchange;
  return {
    me,
    hand: state.players[me].hand,
    log: currentHandLog(state.log).map((e) =>
      e.kind === 'exchange' && e.from !== me && e.to !== me ? { ...e, card: null } : e,
    ),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      cardCount: p.hand.length,
      score: p.score,
    })),
    phase: state.phase,
    turn: state.turn,
    table: state.table,
    passes: state.passes,
    finishOrder: state.finishOrder,
    mustInclude: state.mustInclude,
    // Only the two players involved know which card moved.
    exchange: ex && (ex.winner === me || ex.loser === me) ? ex : null,
    target: state.target,
    winners: state.winners,
    handNumber: state.handNumber,
    lastHandOrder: state.lastHandOrder,
  };
}

/** Log entries since the start of the current hand. */
export function currentHandLog(log: LogEntry[]): LogEntry[] {
  let i = log.length - 1;
  while (i >= 0 && log[i].kind !== 'handStart') i--;
  return log.slice(Math.max(i, 0));
}
