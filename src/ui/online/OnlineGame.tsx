import { useState } from 'react';
import { Table } from '../Table';
import { Online, useOnline } from './useOnline';
import { useMenuItems } from '../menu';
import { SEAT_HUES } from '../theme';
import type { CSSProperties } from 'react';

export function OnlineGame({
  name,
  setName,
  initialCode,
  onExit,
}: {
  name: string;
  setName: (n: string) => void;
  initialCode: string | null;
  onExit: () => void;
}) {
  const online = useOnline(name.trim() || 'Player');
  const { room, view } = online;
  useMenuItems(
    'game',
    room
      ? [{ id: 'leave', label: room.started ? 'Leave game' : 'Leave room', danger: !!room.started, onSelect: online.leave }]
      : null,
  );

  return (
    <>
      {online.status !== 'open' && !online.unreachable && (
        <div className="conn-banner" role="status">
          {online.status === 'connecting' ? 'Connecting to server…' : 'Connection lost — reconnecting…'}
        </div>
      )}
      {online.unreachable && !room ? (
        <Unreachable online={online} onExit={onExit} />
      ) : online.unreachable ? (
        <div className="conn-banner error" role="alert">
          Can’t reach the game server — retrying…
        </div>
      ) : null}
      {online.unreachable && !room ? null : !room ? (
        <OnlineMenu online={online} initialCode={initialCode} onExit={onExit} name={name} setName={setName} />
      ) : !room.started || !view ? (
        <Lobby online={online} />
      ) : (
        <Table
          view={view}
          dispatch={online.act}
          error={online.error}
          clearError={online.clearError}
          canDeal={room.host === room.you}
          hostName={room.seats[room.host]?.name}
          onNextHand={online.nextHand}
          onNewGame={online.playAgain}
          deadline={online.deadline}
          seatStatus={(seat) => ({ offline: room.seats[seat]?.kind === 'human' && !room.seats[seat].connected })}
        />
      )}
    </>
  );
}

function Unreachable({ online, onExit }: { online: Online; onExit: () => void }) {
  return (
    <div className="start">
      <div className="start-card">
        <h2>Can’t reach the game server</h2>
        <p>
          Online play needs the Murlan server running alongside this page. It’s still trying in the background — or try
          again now.
        </p>
        <p className="note">
          Running it yourself? <code>npm run dev</code> or <code>npm start</code> includes the server. Static hosting
          (like GitHub Pages) can’t run it — use a Node host such as Render, Railway or Fly.io.
        </p>
        <button type="button" className="primary big" onClick={online.retry}>
          Try again
        </button>
        <button type="button" className="link" onClick={onExit}>
          Back
        </button>
      </div>
    </div>
  );
}

function OnlineMenu({
  online,
  initialCode,
  onExit,
  name,
  setName,
}: {
  online: Online;
  initialCode: string | null;
  onExit: () => void;
  name: string;
  setName: (n: string) => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const ready = online.status === 'open';
  return (
    <div className="start">
      <div className="start-card">
        <h2>Play online</h2>
        <p>{initialCode ? `You've been invited to room ${initialCode}.` : 'Create a room and send the link to friends. Empty seats are filled with bots.'}</p>
        <label>
          Your name
          <input value={name} maxLength={16} placeholder="Player" onChange={(e) => setName(e.target.value)} />
        </label>
        {initialCode ? (
          <>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) online.join(code);
          }}
        >
          <input
            aria-label="Room code"
            value={code}
            placeholder="CODE"
            maxLength={4}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus={!!initialCode}
          />
          <button type="submit" className={initialCode ? 'primary' : ''} disabled={!ready || code.trim().length < 4}>
            Join
          </button>
        </form>
            <div className="divider">or start your own</div>
        <button type="button" className="big" disabled={!ready} onClick={online.create}>
          Create a room
        </button>
          </>
        ) : (
          <>
        <button type="button" className="primary big" disabled={!ready} onClick={online.create}>
          Create a room
        </button>
            <div className="divider">or join one</div>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) online.join(code);
          }}
        >
          <input
            aria-label="Room code"
            value={code}
            placeholder="CODE"
            maxLength={4}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus={!!initialCode}
          />
          <button type="submit" className={initialCode ? 'primary' : ''} disabled={!ready || code.trim().length < 4}>
            Join
          </button>
        </form>
          </>
        )}
        {online.error && <div className="feedback">{online.error}</div>}
        <button type="button" className="link" onClick={onExit}>
          Back
        </button>
      </div>
    </div>
  );
}

function Lobby({ online }: { online: Online }) {
  const room = online.room!;
  const isHost = room.host === room.you;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  };
  const humans = room.seats.filter((s) => s.kind === 'human').length;
  return (
    <div className="start">
      <div className="start-card lobby">
        <div className="room-code">
          <span>Room</span>
          <b>{room.code}</b>
        </div>
        <div className="share">
          <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
        </div>
        <ul className="seats">
          {room.seats.map((s, i) => (
            <li key={i} className={s.kind} style={{ '--hue': SEAT_HUES[i] } as CSSProperties}>
              <span className="avatar">{s.kind === 'empty' ? '·' : s.name[0]}</span>
              <span className="seat-label">
                {s.kind === 'empty' ? 'Waiting for player…' : s.name}
                {i === room.you && ' (you)'}
                {i === room.host && <span className="badge">host</span>}
                {s.kind === 'bot' && <span className="badge">bot</span>}
                {s.kind === 'human' && !s.connected && <span className="badge">offline</span>}
              </span>
              {isHost && s.kind === 'empty' && (
                <button type="button" onClick={() => online.setBot(i, true)}>Add bot</button>
              )}
              {isHost && s.kind === 'bot' && (
                <button type="button" className="ghost" onClick={() => online.setBot(i, false)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
        {isHost ? (
          <button type="button" className="primary big" onClick={online.start}>
            {humans === 1 ? 'Start (bots fill empty seats)' : 'Start game'}
          </button>
        ) : (
          <p className="waiting">Waiting for {room.seats[room.host].name} to start…</p>
        )}
        {online.error && <div className="feedback">{online.error}</div>}
        <button type="button" className="link" onClick={online.leave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
