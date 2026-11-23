import { useEffect, useState } from 'react';
import { Rules } from './Rules';
import { Table } from './Table';
import { Speed, hasSavedLocalGame, useLocalGame } from './useGame';
import { OnlineGame } from './online/OnlineGame';
import { hasSavedSession } from './online/useOnline';

type Mode = { kind: 'menu' } | { kind: 'local'; resume: boolean } | { kind: 'online' };

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
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

const roomFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;

export function App() {
  const [speed, setSpeed] = useState<Speed>(() => readPref('murlan.speed', 'normal') as Speed);
  const [name, setName] = useState(() => readPref('murlan.name', ''));
  const [showRules, setShowRules] = useState(false);
  // Arriving with ?room=CODE, or with an online session to resume, goes straight online.
  const [mode, setMode] = useState<Mode>(() =>
    roomFromUrl() || hasSavedSession() ? { kind: 'online' } : { kind: 'menu' },
  );

  useEffect(() => writePref('murlan.speed', speed), [speed]);
  useEffect(() => writePref('murlan.name', name), [name]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Murlan</h1>
        <div className="topbar-actions">
          {mode.kind === 'local' && (
            <label className="speed">
              Bot speed
              <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
            </label>
          )}
          <button type="button" className="ghost" onClick={() => setShowRules(true)}>
            Rules
          </button>
          {mode.kind === 'local' && (
            <button type="button" className="ghost" onClick={() => setMode({ kind: 'menu' })}>
              Menu
            </button>
          )}
        </div>
      </header>

      {mode.kind === 'menu' && (
        <Menu
          name={name}
          setName={setName}
          onLocal={(resume) => setMode({ kind: 'local', resume })}
          onOnline={() => setMode({ kind: 'online' })}
          onRules={() => setShowRules(true)}
        />
      )}
      {mode.kind === 'local' && <LocalGame speed={speed} resume={mode.resume} name={name.trim()} />}
      {mode.kind === 'online' && (
        <OnlineGame name={name} setName={setName} initialCode={roomFromUrl()} onExit={() => setMode({ kind: 'menu' })} />
      )}

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Menu(props: {
  name: string;
  setName: (n: string) => void;
  onLocal: (resume: boolean) => void;
  onOnline: () => void;
  onRules: () => void;
}) {
  const canResume = hasSavedLocalGame();
  return (
    <div className="start">
      <div className="start-card">
        <h2>Murlan</h2>
        <p>Get rid of all your cards first. Beat the table with a higher combination of the same kind — or drop a bomb.</p>
        <label>
          Your name
          <input value={props.name} maxLength={16} placeholder="You" onChange={(e) => props.setName(e.target.value)} />
        </label>
        {canResume && (
          <button type="button" className="primary big" onClick={() => props.onLocal(true)}>
            Continue game vs bots
          </button>
        )}
        <button type="button" className={canResume ? 'big' : 'primary big'} onClick={() => props.onLocal(false)}>
          {canResume ? 'New game vs bots' : 'Play vs 3 bots'}
        </button>
        <button type="button" className="big" onClick={props.onOnline}>
          Play online with friends
        </button>
        <button type="button" className="link" onClick={props.onRules}>
          How to play
        </button>
      </div>
    </div>
  );
}

function LocalGame({ speed, resume, name }: { speed: Speed; resume: boolean; name: string }) {
  const game = useLocalGame(speed, resume, name);
  return (
    <Table
      view={game.view}
      dispatch={game.dispatch}
      error={game.error}
      clearError={() => game.setError(null)}
      canDeal
      onNextHand={() => game.dispatch({ type: 'nextHand' })}
      onNewGame={game.newGame}
    />
  );
}
