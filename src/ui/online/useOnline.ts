import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, PlayerView } from '../../engine';
import type { ClientMsg, RoomInfo, ServerMsg } from '../../shared/protocol';

const SESSION_KEY = 'murlan.online.session';

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSavedSession() {
  return loadSession() !== null;
}

function serverUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Put the room code in the address bar so the link can be shared. */
function setRoomInUrl(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

export type ConnStatus = 'connecting' | 'open' | 'reconnecting';

export function useOnline(name: string) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Failed connection attempts since the last successful one. */
  const [failures, setFailures] = useState(0);
  const retryNow = useRef<() => void>(() => {});
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef<ClientMsg[]>([]);
  const nameRef = useRef(name);
  nameRef.current = name;

  const send = useCallback((msg: ClientMsg) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
    else queue.current.push(msg);
  }, []);

  useEffect(() => {
    let disposed = false;
    let retry = 0;
    let retryTimer: number | undefined;

    const connect = () => {
      const sock = new WebSocket(serverUrl());
      ws.current = sock;
      sock.onopen = () => {
        retry = 0;
        setFailures(0);
        setStatus('open');
        // Take our seat back after a refresh or a dropped connection.
        const session = loadSession();
        const pending = queue.current;
        queue.current = [];
        if (session && !pending.some((m) => m.t === 'create' || m.t === 'join')) {
          sock.send(JSON.stringify({ t: 'join', code: session.code, token: session.token, name: nameRef.current }));
        }
        for (const m of pending) sock.send(JSON.stringify(m));
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMsg;
        switch (msg.t) {
          case 'joined':
            saveSession({ code: msg.code, token: msg.token });
            setRoomInUrl(msg.code);
            setError(null);
            break;
          case 'room':
            setRoom(msg.room);
            if (!msg.room.started) setView(null);
            break;
          case 'state':
            setView(msg.view);
            setDeadline(msg.msLeft !== null ? Date.now() + msg.msLeft : null);
            break;
          case 'error':
            setError(msg.message);
            if (msg.fatal) {
              saveSession(null);
              setRoom(null);
              setView(null);
            }
            break;
          case 'left':
            saveSession(null);
            setRoomInUrl(null);
            setRoom(null);
            setView(null);
            break;
        }
      };
      sock.onclose = () => {
        if (disposed || ws.current !== sock) return;
        setStatus('reconnecting');
        setFailures((f) => f + 1);
        retry++;
        retryTimer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** retry));
      };
    };
    retryNow.current = () => {
      window.clearTimeout(retryTimer);
      retry = 0;
      setFailures(0);
      const old = ws.current;
      ws.current = null;
      old?.close();
      setStatus('connecting');
      connect();
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      ws.current?.close();
    };
  }, []);

  return {
    status,
    /** The server has not answered several attempts in a row. */
    unreachable: status !== 'open' && failures >= 2,
    retry: () => retryNow.current(),
    room,
    view,
    deadline,
    error,
    clearError: useCallback(() => setError(null), []),
    create: () => send({ t: 'create', name: nameRef.current }),
    join: (code: string) => send({ t: 'join', code: code.trim().toUpperCase(), name: nameRef.current }),
    setBot: (seat: number, bot: boolean) => send({ t: 'setBot', seat, bot }),
    start: () => send({ t: 'start' }),
    act: (action: Action) => send({ t: 'action', action }),
    nextHand: () => send({ t: 'nextHand' }),
    playAgain: () => send({ t: 'playAgain' }),
    leave: () => {
      send({ t: 'leave' });
      saveSession(null);
      setRoomInUrl(null);
      setRoom(null);
      setView(null);
    },
  };
}

export type Online = ReturnType<typeof useOnline>;
