import { Action, Card, GameState, LogEntry, makeDeck, sortCards } from '../engine';

/**
 * Scripted tutorial scenarios. Each lesson is a hand-built position plus a script:
 * the coach talks (`say`), scripted opponents move (`bot`), and the learner is asked
 * for a specific move (`you`). The whole script runs through the real engine, so a
 * lesson can never show a move the rules don't allow (see lessons.test.ts).
 */

export type Step =
  /** Coach text; the learner presses Next. */
  | { kind: 'say'; text: string }
  /**
   * A scripted opponent move. With `text`, the coach comments on it and waits for Next;
   * without, it plays automatically after a short pause.
   */
  | { kind: 'bot'; action: Action; text?: string }
  /** The learner must make `solution` (same ranks — suits don't matter). */
  | {
      kind: 'you';
      text: string;
      solution: Action;
      /** Cards to glow from the start (otherwise only after Hint / a wrong move). */
      highlight?: boolean;
      /** Shown when the move is legal but not the one this lesson wants. */
      wrong?: string;
    };

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  setup: () => GameState;
  steps: Step[];
}

export const TUTORIAL_NAMES = ['You', 'Drita', 'Arben', 'Teuta'];
const YOU = 0;
const DRITA = 1;
const ARBEN = 2;
const TEUTA = 3;

const DECK = new Map(makeDeck().map((c) => [c.id, c]));

export function cards(ids: string): Card[] {
  return ids
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const c = DECK.get(id);
      if (!c) throw new Error(`Unknown card ${id}`);
      return c;
    });
}

const play = (player: number, ids: string): Action => ({ type: 'play', player, cardIds: ids.split(' ') });
const pass = (player: number): Action => ({ type: 'pass', player });
const bot = (action: Action, text?: string): Step => ({ kind: 'bot', action, text });
const say = (text: string): Step => ({ kind: 'say', text });

interface ScenarioOptions {
  hands: [string, string, string, string];
  turn: number;
  mustInclude?: string;
  scores?: number[];
  handNumber?: number;
  phase?: GameState['phase'];
  exchange?: GameState['exchange'];
  lastHandOrder?: number[];
  log?: LogEntry[];
}

function scenario(o: ScenarioOptions): GameState {
  const handNumber = o.handNumber ?? 1;
  return {
    players: TUTORIAL_NAMES.map((name, id) => ({
      id,
      name,
      isBot: id !== YOU,
      hand: sortCards(cards(o.hands[id])),
      score: o.scores?.[id] ?? 0,
    })),
    phase: o.phase ?? 'playing',
    turn: o.turn,
    handNumber,
    dealer: 3,
    table: null,
    passes: 0,
    finishOrder: [],
    mustInclude: o.mustInclude ?? null,
    exchange: o.exchange ?? null,
    lastHandOrder: o.lastHandOrder ?? null,
    target: 21,
    winners: [],
    log: [{ kind: 'handStart', hand: handNumber }, ...(o.log ?? [])],
    seed: 1,
  };
}

export const LESSONS: Lesson[] = [
  {
    id: 'basics',
    title: 'The basics',
    summary: 'Card order, who starts, beating single cards, passing and winning a trick.',
    setup: () =>
      scenario({
        hands: ['3S 7H JD 2C', '5S 9C KH', '4D QS AH', '6C 8D 10S BJ'],
        turn: YOU,
        mustInclude: '3S',
      }),
    steps: [
      say('Welcome to Murlan! The goal is simple: be the first to get rid of all your cards.'),
      say('Cards rank from 3 (lowest) up through 10, J, Q, K, A, then 2 — and the two jokers on top. Suits never matter.'),
      say('In the first hand of a game, whoever holds the 3♠ starts — and must play it. That’s you!'),
      { kind: 'you', text: 'Tap the 3♠ to select it, then press Play.', solution: play(YOU, '3S'), highlight: true },
      bot(play(DRITA, '5S')),
      bot(
        play(ARBEN, 'QS'),
        'Each player in turn must beat the table with the same kind of combination, only higher. Drita played a 5, then Arben a Queen.',
      ),
      bot(pass(TEUTA), 'Teuta passes. You may always pass when you can’t — or don’t want to — beat the table.'),
      {
        kind: 'you',
        text: 'Your turn: beat Arben’s Queen. Your Jack is too low, but a 2 beats every normal card.',
        solution: play(YOU, '2C'),
        highlight: true,
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(play(TEUTA, 'BJ'), 'Teuta plays the Black Joker! Only the Red Joker (or a bomb) can beat it.'),
      { kind: 'you', text: 'You can’t beat a joker with what you have. Press Pass.', solution: pass(YOU) },
      bot(pass(DRITA)),
      bot(
        pass(ARBEN),
        'Everyone else passed, so Teuta wins the trick. The table is cleared and she may lead any combination she likes.',
      ),
      bot(play(TEUTA, '6C')),
      {
        kind: 'you',
        text: 'Teuta led a 6. Beat it with your 7 — it’s smart to beat the table as cheaply as possible and keep your Jack for later.',
        solution: play(YOU, '7H'),
        wrong: 'That beats the 6 too — but use your 7 and save the higher card.',
      },
      bot(play(DRITA, '9C')),
      bot(pass(ARBEN)),
      bot(play(TEUTA, '10S')),
      { kind: 'you', text: 'Your Jack beats Teuta’s 10 — and it’s your last card!', solution: play(YOU, 'JD') },
      say(
        'You’re out of cards — you finish 1st! 🎉 The others keep playing to decide 2nd, 3rd and last. ' +
          'Next lesson: pairs and three of a kind.',
      ),
    ],
  },
  {
    id: 'sets',
    title: 'Pairs & three of a kind',
    summary: 'Play pairs and triples, and come back into a trick after passing.',
    setup: () =>
      scenario({
        hands: ['4S 4H 6S 8C 8D QS QH QD', '3C 3D 10S KC', '6C 6D AS', 'JS JH 7S 7H 7D 9D'],
        turn: DRITA,
      }),
    steps: [
      say('Besides single cards you can play a pair (two of the same rank) or three of a kind.'),
      say('Whatever is led sets the kind and size of combination for the whole trick.'),
      bot(play(DRITA, '3C 3D'), 'Drita leads a pair of 3s.'),
      bot(play(ARBEN, '6C 6D')),
      bot(pass(TEUTA)),
      {
        kind: 'you',
        text: 'Arben beat it with a pair of 6s. A pair can only be beaten by a higher pair — select both 8s and play them.',
        solution: play(YOU, '8C 8D'),
        highlight: true,
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(
        play(TEUTA, 'JS JH'),
        'Teuta passed earlier, but now she comes back with a pair of Jacks. Passing doesn’t lock you out of the trick.',
      ),
      {
        kind: 'you',
        text: 'You could split your three Queens to beat the Jacks — but they’re worth more together. Pass this time.',
        solution: pass(YOU),
        wrong: 'Keep the Queens together for now — press Pass.',
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN), 'Everyone passed — Teuta wins the trick and leads.'),
      bot(play(TEUTA, '7S 7H 7D'), 'Teuta leads three 7s.'),
      {
        kind: 'you',
        text: 'Three of a kind beats a lower three of a kind. Play your three Queens!',
        solution: play(YOU, 'QS QH QD'),
        highlight: true,
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(pass(TEUTA), 'Nobody can beat your Queens — you win the trick and lead next.'),
      {
        kind: 'you',
        text: 'Leading is your chance to get rid of weak cards. Lead your pair of 4s.',
        solution: play(YOU, '4S 4H'),
        wrong: 'You can lead anything — but the low pair of 4s is the card to dump now.',
      },
      say('Nice! Tip: lead your low combinations while you have the lead, and keep high cards to win tricks back.'),
    ],
  },
  {
    id: 'straights',
    title: 'Straights',
    summary: 'Five or more cards in a row — and how to beat them.',
    setup: () =>
      scenario({
        hands: ['3D 4C 5S 6H 7D 8S 9H 10C JS QD KH', '5C 6D 7S 8H 9S KC', '2D 8D JD', 'QC JC 4S'],
        turn: YOU,
      }),
    steps: [
      say('A straight is 5 or more cards in a row, like 3-4-5-6-7. Suits don’t matter.'),
      {
        kind: 'you',
        text: 'Lead the straight 3-4-5-6-7: select all five cards, then press Play.',
        solution: play(YOU, '3D 4C 5S 6H 7D'),
        highlight: true,
        wrong: 'For this lesson, lead exactly 3-4-5-6-7.',
      },
      bot(
        play(DRITA, '5C 6D 7S 8H 9S'),
        'Drita beats it with 5-6-7-8-9. To beat a straight you need the same number of cards with a higher top card.',
      ),
      bot(pass(ARBEN)),
      bot(pass(TEUTA)),
      {
        kind: 'you',
        text: 'Beat Drita’s straight with 9-10-J-Q-K.',
        solution: play(YOU, '9H 10C JS QD KH'),
        highlight: true,
        wrong: 'That’s a valid straight too! For this lesson, play 9-10-J-Q-K.',
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(pass(TEUTA), 'Nobody can beat it — you win the trick.'),
      say('An Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5). That’s the only place a 2 counts as low.'),
      say('Straights can’t wrap around (Q-K-A-2-3 isn’t allowed), and jokers never go in a straight.'),
      say('Length matters: a 6-card straight can only be beaten by another 6-card straight.'),
      { kind: 'you', text: 'Lead your last card, the 8, to go out.', solution: play(YOU, '8S') },
      say('Straights are a great way to dump lots of low cards at once. Next up: bombs!'),
    ],
  },
  {
    id: 'bombs',
    title: 'Bombs',
    summary: 'Four of a kind beats everything — except a bigger bomb.',
    setup: () =>
      scenario({
        hands: ['6S 6H 6D 6C 8H 10D', '2H 2D KS', '9S 9H 9D 9C 3C 5C', 'QH 4D'],
        turn: DRITA,
      }),
    steps: [
      say(
        'Four of a kind is a BOMB. A bomb beats anything — singles, pairs, triples, straights, even jokers. ' +
          'Only a higher bomb beats a bomb.',
      ),
      bot(play(DRITA, '2H 2D'), 'Drita plays a pair of 2s — the highest pair there is.'),
      bot(pass(ARBEN)),
      bot(pass(TEUTA)),
      {
        kind: 'you',
        text: 'Nothing beats a pair of 2s… except a bomb! Select your four 6s and play them.',
        solution: play(YOU, '6S 6H 6D 6C'),
        highlight: true,
      },
      bot(pass(DRITA)),
      bot(play(ARBEN, '9S 9H 9D 9C'), 'Whoa — Arben answers with four 9s. A higher bomb beats a lower bomb.'),
      bot(pass(TEUTA)),
      { kind: 'you', text: 'You can’t beat four 9s. Press Pass.', solution: pass(YOU) },
      bot(pass(DRITA), 'Arben wins the trick.'),
      say(
        'Bombs are rare and powerful. Save yours to stop a player who’s about to go out, or to grab the lead late in a hand.',
      ),
    ],
  },
  {
    id: 'jokers',
    title: 'Jokers',
    summary: 'The two highest cards in the game, and their limits.',
    setup: () =>
      scenario({
        hands: ['2D RJ 4H 4D 9C', 'BJ 10H', 'KD 5S', 'AS 7C'],
        turn: TEUTA,
      }),
    steps: [
      say('There are two jokers. The Black Joker beats every normal card.'),
      say('The Red Joker beats the Black Joker — it’s the highest single card in the game.'),
      bot(play(TEUTA, 'AS'), 'Teuta leads an Ace.'),
      { kind: 'you', text: 'Beat the Ace with your 2.', solution: play(YOU, '2D'), highlight: true },
      bot(play(DRITA, 'BJ'), 'Drita plays the Black Joker.'),
      bot(pass(ARBEN)),
      bot(pass(TEUTA)),
      {
        kind: 'you',
        text: 'Only the Red Joker beats the Black Joker as a single. Play it!',
        solution: play(YOU, 'RJ'),
        highlight: true,
      },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(pass(TEUTA), 'Nobody can beat the Red Joker — you lead.'),
      say('Jokers can only be played as single cards. Two jokers are not a pair, and jokers can’t be part of a straight.'),
      {
        kind: 'you',
        text: 'Lead your pair of 4s.',
        solution: play(YOU, '4H 4D'),
        wrong: 'Lead the pair of 4s for this lesson.',
      },
      say('Great. Next: what happens at the end of a hand.'),
    ],
  },
  {
    id: 'scoring',
    title: 'Going out & scoring',
    summary: 'Finishing order, points, and winning the game.',
    setup: () =>
      scenario({
        hands: ['7S 7D', '3H', '5C KC', '9S'],
        turn: YOU,
        scores: [12, 15, 9, 10],
        handNumber: 6,
      }),
    steps: [
      say('This hand is nearly over. When you play your last card, you’re out.'),
      say('The order players go out decides the points: 1st gets 3, 2nd gets 2, 3rd gets 1, last gets 0.'),
      { kind: 'you', text: 'Play your pair of 7s to go out first.', solution: play(YOU, '7S 7D'), highlight: true },
      bot(pass(DRITA)),
      bot(pass(ARBEN)),
      bot(
        pass(TEUTA),
        'Nobody beat your pair. You’re already out, so the lead goes to the next player still in — Drita.',
      ),
      bot(play(DRITA, '3H'), 'Drita plays her last card — she finishes 2nd.'),
      bot(play(ARBEN, 'KC')),
      bot(pass(TEUTA)),
      bot(play(ARBEN, '5C'), 'Arben goes out 3rd, which leaves Teuta last.'),
      say('Points are added to everyone’s total. The first player to reach 21 wins the game.'),
      say('If two or more players reach the target in the same hand, the target goes up by 10 (up to 51).'),
    ],
  },
  {
    id: 'exchange',
    title: 'Card exchange',
    summary: 'What happens between hands: the loser pays the winner.',
    setup: () =>
      scenario({
        hands: ['3C 5D 8S 9H JC KD AS 2H', '4C 6S 10H QC', '5H 7C JH KS', '4S 6H 10C QS'],
        turn: YOU,
        phase: 'exchange',
        handNumber: 2,
        scores: [3, 2, 1, 0],
        lastHandOrder: [YOU, DRITA, ARBEN, TEUTA],
        exchange: { winner: YOU, loser: TEUTA, received: cards('2H')[0] },
        log: [{ kind: 'exchange', from: TEUTA, to: YOU, card: cards('2H')[0] }],
      }),
    steps: [
      say('Between hands there’s a card exchange. The player who came last gives their HIGHEST card to the winner…'),
      say('…and the winner gives back any card they choose.'),
      say('You won the last hand, so Teuta (who came last) had to hand you her best card — the 2♥.'),
      {
        kind: 'you',
        text: 'Now give a card back. The smart choice is your weakest card: select the 3♣ and press Give card.',
        solution: { type: 'exchangeReturn', player: YOU, cardId: '3C' },
        highlight: true,
        wrong: 'You may give any card in a real game — but giving away your weakest card is the smart move. Give the 3♣.',
      },
      say('The player who came last leads the new hand, so Teuta starts.'),
      say('One exception: if the last player holds BOTH jokers, they show them. There’s no exchange and the winner leads.'),
      bot(play(TEUTA, '3C'), 'Teuta leads the 3♣ you just gave her.'),
      say('That’s everything! You know all the rules of Murlan. Time to play a real game against the bots.'),
    ],
  },
];

/** Does the learner's action match the lesson's solution? Suits don't matter, ranks do. */
export function matchesSolution(action: Action, solution: Action, state: GameState): boolean {
  if (action.type !== solution.type) return false;
  const hand = state.players[YOU].hand;
  const ranks = (ids: string[]) =>
    ids
      .map((id) => hand.find((c) => c.id === id)?.rank ?? -1)
      .sort((a, b) => a - b)
      .join();
  if (action.type === 'play' && solution.type === 'play') return ranks(action.cardIds) === ranks(solution.cardIds);
  if (action.type === 'exchangeReturn' && solution.type === 'exchangeReturn')
    return ranks([action.cardId]) === ranks([solution.cardId]);
  return true;
}

/** Card ids to glow for a step's solution. */
export function solutionCards(step: Step): string[] {
  if (step.kind !== 'you') return [];
  const s = step.solution;
  if (s.type === 'play') return s.cardIds;
  if (s.type === 'exchangeReturn') return [s.cardId];
  return [];
}
