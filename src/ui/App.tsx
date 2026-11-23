import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  GameState,
  LogEntry,
  POINTS_BY_PLACE,
  cardLabel,
  checkPlay,
  chooseBotAction,
  legalPlays,
  viewFor,
} from '../engine';
import { CardBack, CardView } from './CardView';
import { describeCombo, ordinal } from './describe';
import { Speed, currentActor, useGame } from './useGame';
import { Rules } from './Rules';
import { Pile, PileLayer } from './Pile';

const ME = 0;

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function App() {
  const [speed, setSpeed] = useState<Speed>(() => readPref('murlan.speed', 'normal'));
  const [name, setName] = useState(() => readPref<string>('murlan.name', ''));
  const [showRules, setShowRules] = useState(false);
  const game = useGame(speed);

  useEffect(() => writePref('murlan.speed', speed), [speed]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Murlan</h1>
        <div className="topbar-actions">
          <label className="speed">
            Bot speed
            <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
          <button type="button" className="ghost" onClick={() => setShowRules(true)}>
            Rules
          </button>
          {game.state && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (confirm('Quit this game?')) game.quit();
              }}
            >
              Quit
            </button>
          )}
        </div>
      </header>

      {game.state ? (
        <Table state={game.state} game={game} />
      ) : (
        <div className="start">
          <div className="start-card">
            <h2>Play Murlan against 3 bots</h2>
            <p>Get rid of all your cards first. Beat the table with a higher combination of the same kind — or drop a bomb.</p>
            <label>
              Your name
              <input
                value={name}
                maxLength={16}
                placeholder="You"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary big"
              onClick={() => {
                writePref('murlan.name', name);
                game.newGame(name.trim());
              }}
            >
              Deal cards
            </button>
            <button type="button" className="link" onClick={() => setShowRules(true)}>
              How to play
            </button>
          </div>
        </div>
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

type Game = ReturnType<typeof useGame>;

/** Log entries of the current hand. */
function currentHandLog(log: LogEntry[]): LogEntry[] {
  let i = log.length - 1;
  while (i >= 0 && log[i].kind !== 'handStart') i--;
  return log.slice(i + 1);
}

function Table({ state, game }: { state: GameState; game: Game }) {
  const view = viewFor(state, ME);
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const handLog = useMemo(() => currentHandLog(state.log), [state.log]);
  const handKey = view.hand.map((c) => c.id).join();

  // Drop selections for cards that left the hand.
  useEffect(() => {
    setSelected((sel) => sel.filter((id) => view.hand.some((c) => c.id === id)));
    setHint(null);
  }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const actor = currentActor(state);
  const myTurn = actor === ME;
  const playing = state.phase === 'playing';
  const exchanging = state.phase === 'exchange' && myTurn;

  // Who has passed since the last play.
  const passed = new Set<number>();
  for (let i = handLog.length - 1; i >= 0; i--) {
    const e = handLog[i];
    if (e.kind === 'play' || e.kind === 'trickWon') break;
    if (e.kind === 'pass') passed.add(e.player);
  }

  // Every play of the current trick, stacked as a pile. If the trick was just
  // cleared, keep showing it (faded) until the next lead.
  const offset = state.log.length - handLog.length;
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
      if (e.kind === 'play') pile.push({ key: offset + i, player: e.player, combo: e.combo });
    }
  }
  const topPlay = pile[pile.length - 1];

  const legal = playing && myTurn ? legalPlays(view.hand, view.table?.combo ?? null, view.mustInclude) : [];
  const selectionCheck = selected.length && playing && myTurn ? checkPlay(state, ME, selected) : null;
  const canPlay = selectionCheck !== null && typeof selectionCheck !== 'string';

  const toggle = (card: Card) => {
    setHint(null);
    game.setError(null);
    if (exchanging) {
      setSelected((s) => (s[0] === card.id ? [] : [card.id]));
      return;
    }
    setSelected((s) => (s.includes(card.id) ? s.filter((x) => x !== card.id) : [...s, card.id]));
  };

  const doPlay = () => {
    if (!canPlay) return;
    game.dispatch({ type: 'play', player: ME, cardIds: selected });
    setSelected([]);
  };
  const doPass = () => {
    if (!(playing && myTurn && view.table)) return;
    game.dispatch({ type: 'pass', player: ME });
    setSelected([]);
  };
  const doHint = () => {
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
    game.dispatch({ type: 'exchangeReturn', player: ME, cardId: selected[0] });
    setSelected([]);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Enter') (exchanging ? doGive : doPlay)();
      else if (e.key === 'p' || e.key === 'P') doPass();
      else if (e.key === 'h' || e.key === 'H') doHint();
      else if (e.key === 'Escape') setSelected([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Status line for the human.
  let status: string;
  const myPlace = view.finishOrder.indexOf(ME);
  if (state.phase === 'exchange') {
    const ex = view.exchange;
    status = myTurn && ex
      ? `${state.players[ex.loser].name} gave you their highest card (${cardLabel(ex.received)}). Pick a card to give back.`
      : `${state.players[actor!].name} is choosing a card to give back…`;
  } else if (!playing) {
    status = '';
  } else if (myPlace >= 0) {
    status = `You finished ${ordinal(myPlace + 1)}! Watching the rest of the hand…`;
  } else if (!myTurn) {
    status = `${state.players[actor!].name} is thinking…`;
  } else if (!view.table) {
    status = view.mustInclude ? 'You lead first — your play must include the 3♠.' : 'Your lead — play any combination.';
  } else if (legal.length === 0) {
    status = `You can't beat ${state.players[view.table.player].name}'s ${describeCombo(view.table.combo)}. Pass.`;
  } else {
    status = `Beat ${state.players[view.table.player].name}'s ${describeCombo(view.table.combo)} — or pass.`;
  }

  const feedback =
    game.error ??
    hint ??
    (selected.length && typeof selectionCheck === 'string' && !exchanging ? selectionCheck : null);

  // Exchange notices for the current hand that involve me.
  const exchangeNotes = handLog
    .filter((e) => (e.kind === 'exchange' && (e.from === ME || e.to === ME)) || e.kind === 'jokersShown')
    .map((e) => {
      if (e.kind === 'jokersShown') {
        return e.player === ME
          ? 'You showed both jokers — no card exchange this hand.'
          : `${state.players[e.player].name} showed both jokers — no exchange this hand.`;
      }
      if (e.kind !== 'exchange') return '';
      return e.from === ME
        ? `You gave ${cardLabel(e.card)} to ${state.players[e.to].name}.`
        : `You received ${cardLabel(e.card)} from ${state.players[e.from].name}.`;
    });
  const handStarted = handLog.some((e) => e.kind === 'play');

  const seats = [1, 2, 3].map((id, i) => ({ id, pos: (['left', 'top', 'right'] as const)[i] }));

  return (
    <main className="table-wrap">
      <Scoreboard state={state} />
      <div className="table">
        {seats.map(({ id, pos }) => {
          const p = view.players[id];
          const place = view.finishOrder.indexOf(id);
          return (
            <section key={id} className={`seat seat-${pos} ${actor === id ? 'active' : ''}`}>
              <div className="avatar">{p.name[0]}</div>
              <div className="seat-info">
                <div className="seat-name">{p.name}</div>
                <div className="seat-sub">
                  {place >= 0 ? <span className="badge gold">{ordinal(place + 1)}</span> : `${p.cardCount} cards`}
                </div>
              </div>
              <div className="mini-backs">
                {Array.from({ length: Math.min(p.cardCount, 14) }).map((_, i) => (
                  <CardBack key={i} small />
                ))}
              </div>
              {passed.has(id) && playing && <div className="bubble">Pass</div>}
              {actor === id && state.phase === 'playing' && <div className="thinking" aria-hidden><i /><i /><i /></div>}
            </section>
          );
        })}

        <section className="center">
          {topPlay ? (
            <div className={'pile' + (trickTaken !== null ? ' taken' : '')}>
              <div className="pile-label" key={topPlay.key}>
                {trickTaken !== null
                  ? trickTaken === ME
                    ? 'You take the trick'
                    : `${state.players[trickTaken].name} takes the trick`
                  : `${state.players[topPlay.player].name}: ${describeCombo(topPlay.combo)}`}
              </div>
              <Pile layers={pile} />
            </div>
          ) : (
            <div className="pile empty">
              <div className="pile-label">
                {state.phase === 'exchange' ? 'Card exchange' : `Hand ${state.handNumber}`}
              </div>
            </div>
          )}
          {!handStarted && exchangeNotes.length > 0 && (
            <div className="notes">{exchangeNotes.map((n, i) => <div key={i}>{n}</div>)}</div>
          )}
        </section>

        <section className={`me ${myTurn ? 'active' : ''}`}>
          <div className="status" role="status">
            {status}
            {passed.has(ME) && playing && !myTurn && myPlace < 0 && <span className="badge">You passed</span>}
          </div>
          <div className="hand">
            {view.hand.map((c) => (
              <CardView
                key={c.id}
                card={c}
                selected={selected.includes(c.id)}
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
                  className={legal.length === 0 && myTurn && view.table ? 'primary' : ''}
                  disabled={!(playing && myTurn && view.table)}
                  onClick={doPass}
                >
                  Pass
                </button>
                <button type="button" disabled={!(playing && myTurn)} onClick={doHint}>
                  Hint
                </button>
                <button type="button" className="ghost" disabled={!selected.length} onClick={() => setSelected([])}>
                  Clear
                </button>
              </>
            )}
          </div>
          <div className="feedback" aria-live="polite">{feedback}</div>
        </section>
      </div>

      <GameLog state={state} />

      {(state.phase === 'handOver' || state.phase === 'gameOver') && (
        <HandResult state={state} onNext={() => game.dispatch({ type: 'nextHand' })} onNewGame={() => game.newGame(state.players[ME].name)} />
      )}
    </main>
  );
}

function Scoreboard({ state }: { state: GameState }) {
  return (
    <div className="scoreboard">
      <span className="target">First to {state.target}</span>
      {state.players.map((p) => (
        <span key={p.id} className="score">
          {p.id === ME ? 'You' : p.name} <b>{p.score}</b>
        </span>
      ))}
    </div>
  );
}

function GameLog({ state }: { state: GameState }) {
  const lines = currentHandLog(state.log)
    .slice(-14)
    .map((e) => {
      const n = (id: number) => (id === ME ? 'You' : state.players[id].name);
      switch (e.kind) {
        case 'play': return `${n(e.player)}: ${describeCombo(e.combo)}`;
        case 'pass': return `${n(e.player)} passed`;
        case 'trickWon': return `— ${n(e.player)} took the trick`;
        case 'out': return `★ ${n(e.player)} is out (${ordinal(e.place)})`;
        case 'exchange': return e.from === ME || e.to === ME ? `${n(e.from)} → ${n(e.to)}: ${cardLabel(e.card)}` : `${n(e.from)} → ${n(e.to)}: a card`;
        case 'jokersShown': return `${n(e.player)} showed both jokers`;
        case 'targetRaised': return `Target raised to ${e.target}`;
        default: return null;
      }
    })
    .filter(Boolean);
  return (
    <details className="log">
      <summary>Hand log</summary>
      <ol>{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
    </details>
  );
}

function HandResult({ state, onNext, onNewGame }: { state: GameState; onNext: () => void; onNewGame: () => void }) {
  const order = state.lastHandOrder ?? [];
  const over = state.phase === 'gameOver';
  const raised = [...state.log].reverse().find((e) => e.kind === 'targetRaised' || e.kind === 'handEnd');
  const name = (id: number) => (id === ME ? 'You' : state.players[id].name);
  const standings = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal>
        {over ? (
          <h2>
            {state.winners.length > 1
              ? `It's a tie: ${state.winners.map(name).join(' & ')}`
              : state.winners[0] === ME
                ? 'You win the game! 🎉'
                : `${name(state.winners[0])} wins the game`}
          </h2>
        ) : (
          <h2>Hand {state.handNumber} finished</h2>
        )}
        <table className="results">
          <thead>
            <tr><th>Place</th><th>Player</th><th>Points</th></tr>
          </thead>
          <tbody>
            {order.map((id, i) => (
              <tr key={id} className={id === ME ? 'me-row' : ''}>
                <td>{ordinal(i + 1)}</td><td>{name(id)}</td><td>+{POINTS_BY_PLACE[i] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Totals</h3>
        <table className="results">
          <tbody>
            {standings.map((p) => (
              <tr key={p.id} className={p.id === ME ? 'me-row' : ''}>
                <td>{name(p.id)}</td><td><b>{p.score}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {raised?.kind === 'targetRaised' && !over && (
          <p className="note">More than one player reached the target — it's now {state.target}.</p>
        )}
        {!over && order.length > 0 && (
          <p className="note">
            {order[order.length - 1] === ME
              ? `Next hand: you give your highest card to ${name(order[0])}, get one back, and lead.`
              : `Next hand: ${name(order[order.length - 1])} gives their highest card to ${name(order[0])}, gets one back, and leads.`}
          </p>
        )}
        {over ? (
          <button type="button" className="primary big" onClick={onNewGame}>New game</button>
        ) : (
          <button type="button" className="primary big" onClick={onNext} autoFocus>Deal next hand</button>
        )}
      </div>
    </div>
  );
}
