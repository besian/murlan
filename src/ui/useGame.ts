import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, GameState, applyAction, chooseBotAction, createGame, viewFor } from '../engine';

const STORAGE_KEY = 'murlan.game.v1';

export const BOT_NAMES = ['Drita', 'Arben', 'Teuta'];

export type Speed = 'slow' | 'normal' | 'fast';
const DELAY: Record<Speed, number> = { slow: 1400, normal: 850, fast: 350 };

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as GameState) : null;
    // Older saves lack fields the current engine needs; start fresh rather than crash.
    return s && Array.isArray(s.log) && s.players?.length === 4 ? s : null;
  } catch {
    return null;
  }
}

function save(state: GameState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the game still works, it just won't resume */
  }
}

export function hasSavedLocalGame() {
  const s = load();
  return s !== null && s.phase !== 'gameOver';
}

/** Who has to act right now, or null if we're waiting on "next hand". */
export function currentActor(s: GameState): number | null {
  if (s.phase === 'playing') return s.turn;
  if (s.phase === 'exchange') return s.exchange!.winner;
  return null;
}

/** A game against bots, run entirely in the browser. */
export function useLocalGame(speed: Speed, resume: boolean, playerName: string) {
  const [state, setState] = useState<GameState>(() => {
    const saved = resume ? load() : null;
    return (
      saved ??
      createGame([{ name: playerName || 'You', isBot: false }, ...BOT_NAMES.map((n) => ({ name: n, isBot: true }))])
    );
  });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => save(state), [state]);

  const dispatch = useCallback((action: Action) => {
    setState((s) => {
      try {
        const next = applyAction(s, action);
        setError(null);
        return next;
      } catch (e) {
        setError((e as Error).message);
        return s;
      }
    });
  }, []);

  // Drive the bots.
  useEffect(() => {
    const actor = currentActor(state);
    if (actor === null || !state.players[actor].isBot) return;
    // Leading a fresh trick gets a little extra pause so the cleared trick can be seen.
    const delay = DELAY[speed] * (state.table === null ? 1.3 : 1);
    timer.current = window.setTimeout(() => dispatch(chooseBotAction(viewFor(state, actor))), delay);
    return () => window.clearTimeout(timer.current);
  }, [state, speed, dispatch]);

  const newGame = useCallback(() => {
    setError(null);
    setState((s) => createGame(s.players.map((p) => ({ name: p.name, isBot: p.isBot }))));
  }, []);

  return { state, view: viewFor(state, 0), dispatch, error, setError, newGame };
}
