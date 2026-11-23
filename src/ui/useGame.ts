import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, GameState, applyAction, chooseBotAction, createGame, viewFor } from '../engine';

const STORAGE_KEY = 'murlan.game.v1';

export const BOT_NAMES = ['Drita', 'Arben', 'Teuta'];

export type Speed = 'slow' | 'normal' | 'fast';
const DELAY: Record<Speed, number> = { slow: 1400, normal: 850, fast: 350 };

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
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

/** Who has to act right now, or null if we're waiting on "next hand". */
export function currentActor(s: GameState): number | null {
  if (s.phase === 'playing') return s.turn;
  if (s.phase === 'exchange') return s.exchange!.winner;
  return null;
}

export function useGame(speed: Speed) {
  const [state, setState] = useState<GameState | null>(() => load());
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => save(state), [state]);

  const dispatch = useCallback((action: Action) => {
    setState((s) => {
      if (!s) return s;
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
    if (!state) return;
    const actor = currentActor(state);
    if (actor === null || !state.players[actor].isBot) return;
    // Leading a fresh trick gets a little extra pause so the cleared trick can be seen.
    const delay = DELAY[speed] * (state.table === null ? 1.3 : 1);
    timer.current = window.setTimeout(() => {
      dispatch(chooseBotAction(viewFor(state, actor)));
    }, delay);
    return () => window.clearTimeout(timer.current);
  }, [state, speed, dispatch]);

  const newGame = useCallback((name: string) => {
    const players = [{ name: name || 'You', isBot: false }, ...BOT_NAMES.map((n) => ({ name: n, isBot: true }))];
    setError(null);
    setState(createGame(players));
  }, []);

  const quit = useCallback(() => setState(null), []);

  return { state, dispatch, error, setError, newGame, quit };
}
