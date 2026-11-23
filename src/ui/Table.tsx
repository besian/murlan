import { ReactNode, useEffect, useState } from 'react';
import {
  Action,
  Card,
  LogEntry,
  POINTS_BY_PLACE,
  PlayerView,
  cardLabel,
  chooseBotAction,
  legalPlays,
  validatePlay,
} from '../engine';
import { CardBack, CardView } from './CardView';
import { describeCombo, ordinal } from './describe';
import { Pile, PileLayer } from './Pile';

export interface SeatStatus {
  offline?: boolean;
}

export interface TableProps {
  view: PlayerView;
  dispatch: (a: Action) => void;
  error: string | null;
  clearError: () => void;
  /** Can this player deal the next hand / start a new game? (the host, online) */
  canDeal: boolean;
  onNextHand: () => void;
  onNewGame: () => void;
  /** Online extras. */
  seatStatus?: (seat: number) => SeatStatus;
  /** Epoch ms of the current deadline (turn timer or auto-deal), if any. */
  deadline?: number | null;
  hostName?: string;
  /** Tutorial extras. */
  locked?: boolean;
  highlight?: string[];
  highlightPass?: boolean;
  onHint?: () => void;
  banner?: ReactNode;
  hideScores?: boolean;
  nextHandLabel?: string;
}

const POSITIONS = ['me', 'left', 'top', 'right'] as const;

/** Seconds left until `deadline`, ticking. */
function useCountdown(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function Table(props: TableProps) {
  const { view, dispatch, error, clearError, seatStatus, locked } = props;
  const me = view.me;
  const n = view.players.length;
  const handLog = view.log;
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const secondsLeft = useCountdown(props.deadline);
  const handKey = view.hand.map((c) => c.id).join();

  // Drop selections for cards that left the hand.
  useEffect(() => {
    setSelected((sel) => sel.filter((id) => view.hand.some((c) => c.id === id)));
    setHint(null);
  }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: number) => (id === me ? 'You' : view.players[id].name);
  const actor = view.phase === 'playing' || view.phase === 'exchange' ? view.turn : null;
  const myTurn = actor === me && !locked;
  const playing = view.phase === 'playing';
  const exchanging = view.phase === 'exchange' && myTurn;
  const relSeat = (id: number) => (id - me + n) % n;

  // Who has passed since the last play.
  const passed = new Set<number>();
  for (let i = handLog.length - 1; i >= 0; i--) {
    const e = handLog[i];
    if (e.kind === 'play' || e.kind === 'trickWon') break;
    if (e.kind === 'pass') passed.add(e.player);
  }

  // Every play of the current trick, stacked as a pile. If the trick was just
  // cleared, keep showing it (faded) until the next lead.
  let end = handLog.length;
  let trickTaken: number | null = null;
  const lastEntry = handLog[handLog.length - 1];
  if (!view.table && lastEntry?.kind === 'trickWon') {
    trickTaken = lastEntry.player;
    end = handLog.length - 1;
  }
  let start = end;
  while (start > 0 && handLog[start - 1].kind !== 'trickWon') start--;
  const pile: PileLayer[] = [];
  if (view.table || trickTaken !== null) {
    for (let i = start; i < end; i++) {
      const e = handLog[i];
      if (e.kind === 'play') pile.push({ key: view.handNumber * 10_000 + i, from: relSeat(e.player), combo: e.combo });
    }
  }
  const topPlay = pile[pile.length - 1];
  const topPlayer = view.table?.player;

  const legal = playing && myTurn ? legalPlays(view.hand, view.table?.combo ?? null, view.mustInclude) : [];
  const selectionCheck = selected.length && playing && myTurn ? validatePlay(view, me, view.hand, selected) : null;
  const canPlay = selectionCheck !== null && typeof selectionCheck !== 'string';

  const toggle = (card: Card) => {
    setHint(null);
    clearError();
    if (exchanging) {
      setSelected((s) => (s[0] === card.id ? [] : [card.id]));
      return;
    }
    setSelected((s) => (s.includes(card.id) ? s.filter((x) => x !== card.id) : [...s, card.id]));
  };

  const doPlay = () => {
    if (!canPlay) return;
    dispatch({ type: 'play', player: me, cardIds: selected });
    setSelected([]);
  };
  const doPass = () => {
    if (!(playing && myTurn && view.table)) return;
    dispatch({ type: 'pass', player: me });
    setSelected([]);
  };
  const doHint = () => {
    if (!(playing || exchanging) || !myTurn) return;
    if (props.onHint) return props.onHint();
    const a = chooseBotAction(view, { noise: 0 });
    if (a.type === 'play') {
      setSelected(a.cardIds);
      setHint(null);
    } else if (a.type === 'pass') {
      setSelected([]);
      setHint('Hint: passing looks best here.');
    }
  };
  const doGive = () => {
    if (!exchanging || selected.length !== 1) return;
    dispatch({ type: 'exchangeReturn', player: me, cardId: selected[0] });
    setSelected([]);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.key === 'Enter') (exchanging ? doGive : doPlay)();
      else if (e.key === 'p' || e.key === 'P') doPass();
      else if (e.key === 'h' || e.key === 'H') doHint();
      else if (e.key === 'Escape') setSelected([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Status line.
  let status: string;
  const myPlace = view.finishOrder.indexOf(me);
  if (view.phase === 'exchange') {
    const ex = view.exchange;
    status =
      actor === me && ex
        ? `${name(ex.loser)} gave you their highest card (${cardLabel(ex.received)}). Pick a card to give back.`
        : `${name(actor!)} is choosing a card to give back…`;
  } else if (!playing) {
    status = '';
  } else if (myPlace >= 0) {
    status = `You finished ${ordinal(myPlace + 1)}! Watching the rest of the hand…`;
  } else if (!myTurn) {
    status = actor === me ? 'Read the tip above, then press Next.' : `${name(actor!)} is thinking…`;
  } else if (!view.table) {
    status = view.mustInclude ? 'You lead first — your play must include the 3♠.' : 'Your lead — play any combination.';
  } else if (legal.length === 0) {
    status = `You can't beat ${name(view.table.player)}'s ${describeCombo(view.table.combo)}. Pass.`;
  } else {
    status = `Beat ${name(view.table.player)}'s ${describeCombo(view.table.combo)} — or pass.`;
  }
  const showTimer = myTurn && secondsLeft !== null && secondsLeft <= 20;

  const feedback =
    error ?? (myTurn ? hint : null) ?? (selected.length && typeof selectionCheck === 'string' && !exchanging ? selectionCheck : null);

  // Exchange notices for the current hand that involve me.
  const exchangeNotes = handLog
    .filter((e) => (e.kind === 'exchange' && e.card && (e.from === me || e.to === me)) || e.kind === 'jokersShown')
    .map((e) => {
      if (e.kind === 'jokersShown') {
        return e.player === me
          ? 'You showed both jokers — no card exchange this hand.'
          : `${name(e.player)} showed both jokers — no exchange this hand.`;
      }
      if (e.kind !== 'exchange' || !e.card) return '';
      return e.from === me
        ? `You gave ${cardLabel(e.card)} to ${name(e.to)}.`
        : `You received ${cardLabel(e.card)} from ${name(e.from)}.`;
    });
  const handStarted = handLog.some((e) => e.kind === 'play');

  const others = view.players.filter((p) => p.id !== me);

  return (
    <main className="table-wrap">
      {props.banner}
      <div className="scoreboard" hidden={props.hideScores}>
        <span className="target">First to {view.target}</span>
        {view.players.map((p) => (
          <span key={p.id} className="score">
            {name(p.id)} <b>{p.score}</b>
          </span>
        ))}
      </div>
      <div className="table">
        {others.map((p) => {
          const pos = POSITIONS[relSeat(p.id)] ?? 'top';
          const place = view.finishOrder.indexOf(p.id);
          const offline = seatStatus?.(p.id).offline;
          return (
            <section key={p.id} className={`seat seat-${pos} ${actor === p.id ? 'active' : ''} ${offline ? 'offline' : ''}`}>
              <div className="avatar">
                {p.name[0]}
                {seatStatus && <span className={'dot ' + (p.isBot ? 'bot' : offline ? 'off' : 'on')} />}
              </div>
              <div className="seat-info">
                <div className="seat-name">{p.name}</div>
                <div className="seat-sub">
                  {place >= 0 ? (
                    <span className="badge gold">{ordinal(place + 1)}</span>
                  ) : (
                    <>
                      {p.cardCount} {p.cardCount === 1 ? 'card' : 'cards'}
                      {seatStatus && p.isBot && ' · bot'}
                      {offline && ' · offline'}
                    </>
                  )}
                </div>
              </div>
              <div className="mini-backs">
                {Array.from({ length: Math.min(p.cardCount, 14) }).map((_, i) => (
                  <CardBack key={i} small />
                ))}
              </div>
              {passed.has(p.id) && playing && <div className="bubble">Pass</div>}
              {actor === p.id && view.phase === 'playing' && (
                <div className="thinking" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </section>
          );
        })}

        <section className="center">
          {topPlay ? (
            <div className={'pile' + (trickTaken !== null ? ' taken' : '')}>
              <div className="pile-label" key={topPlay.key}>
                {trickTaken !== null
                  ? trickTaken === me
                    ? 'You take the trick'
                    : `${name(trickTaken)} takes the trick`
                  : `${name(topPlayer!)}: ${describeCombo(topPlay.combo)}`}
              </div>
              <Pile layers={pile} />
            </div>
          ) : (
            <div className="pile empty">
              <div className="pile-label">{view.phase === 'exchange' ? 'Card exchange' : `Hand ${view.handNumber}`}</div>
            </div>
          )}
          {!handStarted && exchangeNotes.length > 0 && (
            <div className="notes">
              {exchangeNotes.map((t, i) => (
                <div key={i}>{t}</div>
              ))}
            </div>
          )}
        </section>

        <section className={`me ${myTurn ? 'active' : ''}`}>
          <div className="status" role="status">
            {status}
            {showTimer && <span className={'badge timer' + (secondsLeft! <= 10 ? ' urgent' : '')}>{secondsLeft}s</span>}
            {passed.has(me) && playing && !myTurn && myPlace < 0 && <span className="badge">You passed</span>}
          </div>
          <div className="hand">
            {view.hand.map((c) => (
              <CardView
                key={c.id}
                card={c}
                selected={selected.includes(c.id)}
                suggested={props.highlight?.includes(c.id)}
                onClick={myTurn && (playing || exchanging) ? () => toggle(c) : undefined}
                dim={myTurn && playing && legal.length > 0 && !legal.some((l) => l.cards.some((x) => x.rank === c.rank))}
              />
            ))}
          </div>
          <div className="controls">
            {exchanging ? (
              <button type="button" className="primary" disabled={selected.length !== 1} onClick={doGive}>
                Give card
              </button>
            ) : (
              <>
                <button type="button" className="primary" disabled={!canPlay} onClick={doPlay}>
                  Play{canPlay && typeof selectionCheck === 'object' ? ` ${describeCombo(selectionCheck!)}` : ''}
                </button>
                <button
                  type="button"
                  className={(legal.length === 0 && myTurn && view.table ? 'primary' : '') + (props.highlightPass ? ' pulse' : '')}
                  disabled={!(playing && myTurn && view.table)}
                  onClick={doPass}
                >
                  Pass
                </button>
                <button type="button" disabled={!(playing && myTurn)} onClick={doHint}>
                  {props.onHint ? 'Show me' : 'Hint'}
                </button>
                <button type="button" className="ghost" disabled={!selected.length} onClick={() => setSelected([])}>
                  Clear
                </button>
              </>
            )}
          </div>
          <div className="feedback" aria-live="polite">
            {feedback}
          </div>
        </section>
      </div>

      <GameLog log={handLog} name={name} />

      {(view.phase === 'handOver' || view.phase === 'gameOver') && (
        <HandResult {...props} name={name} secondsLeft={secondsLeft} />
      )}
    </main>
  );
}

function GameLog({ log, name }: { log: LogEntry[]; name: (id: number) => string }) {
  const lines = log
    .slice(-14)
    .map((e) => {
      switch (e.kind) {
        case 'play': return `${name(e.player)}: ${describeCombo(e.combo)}`;
        case 'pass': return `${name(e.player)} passed`;
        case 'trickWon': return `— ${name(e.player)} took the trick`;
        case 'out': return `★ ${name(e.player)} is out (${ordinal(e.place)})`;
        case 'exchange': return `${name(e.from)} → ${name(e.to)}: ${e.card ? cardLabel(e.card) : 'a card'}`;
        case 'jokersShown': return `${name(e.player)} showed both jokers`;
        case 'targetRaised': return `Target raised to ${e.target}`;
        default: return null;
      }
    })
    .filter(Boolean);
  return (
    <details className="log">
      <summary>Hand log</summary>
      <ol>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </details>
  );
}

function HandResult({
  view,
  canDeal,
  onNextHand,
  onNewGame,
  hostName,
  nextHandLabel,
  name,
  secondsLeft,
}: TableProps & { name: (id: number) => string; secondsLeft: number | null }) {
  const me = view.me;
  const order = view.lastHandOrder ?? [];
  const over = view.phase === 'gameOver';
  const raised = view.log.some((e) => e.kind === 'targetRaised');
  const standings = [...view.players].sort((a, b) => b.score - a.score);
  const loser = order[order.length - 1];
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal>
        {over ? (
          <h2>
            {view.winners.length > 1
              ? `It's a tie: ${view.winners.map(name).join(' & ')}`
              : view.winners[0] === me
                ? 'You win the game! 🎉'
                : `${name(view.winners[0])} wins the game`}
          </h2>
        ) : (
          <h2>Hand {view.handNumber} finished</h2>
        )}
        <table className="results">
          <thead>
            <tr>
              <th>Place</th>
              <th>Player</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {order.map((id, i) => (
              <tr key={id} className={id === me ? 'me-row' : ''}>
                <td>{ordinal(i + 1)}</td>
                <td>{name(id)}</td>
                <td>+{POINTS_BY_PLACE[i] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Totals</h3>
        <table className="results">
          <tbody>
            {standings.map((p) => (
              <tr key={p.id} className={p.id === me ? 'me-row' : ''}>
                <td>{name(p.id)}</td>
                <td>
                  <b>{p.score}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {raised && !over && <p className="note">More than one player reached the target — it's now {view.target}.</p>}
        {!over && order.length > 0 && (
          <p className="note">
            {loser === me
              ? `Next hand: you give your highest card to ${name(order[0])}, get one back, and lead.`
              : `Next hand: ${name(loser)} gives their highest card to ${order[0] === me ? 'you' : name(order[0])}, gets one back, and leads.`}
          </p>
        )}
        {canDeal ? (
          over ? (
            <button type="button" className="primary big" onClick={onNewGame}>
              New game
            </button>
          ) : (
            <button type="button" className="primary big" onClick={onNextHand} autoFocus>
              {nextHandLabel ?? 'Deal next hand'}
              {secondsLeft !== null ? ` (${secondsLeft}s)` : ''}
            </button>
          )
        ) : (
          <p className="waiting">
            {over
              ? `Waiting for ${hostName ?? 'the host'} to start a new game…`
              : `Waiting for ${hostName ?? 'the host'} to deal${secondsLeft !== null ? ` — auto-deal in ${secondsLeft}s` : '…'}`}
          </p>
        )}
      </div>
    </div>
  );
}
