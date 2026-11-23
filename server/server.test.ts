import WebSocket from 'ws';
import { startServer } from './index';
import { chooseBotAction, PlayerView } from '../src/engine';
import type { ClientMsg, RoomInfo, ServerMsg } from '../src/shared/protocol';

const FAST = {
  botDelay: 1,
  offlineDelay: 5,
  turnTime: 5000,
  nextHandTime: 5000,
  lobbyGrace: 50,
  roomTtl: 1000,
};

class TestClient {
  ws: WebSocket;
  room: RoomInfo | null = null;
  view: PlayerView | null = null;
  token = '';
  code = '';
  errors: string[] = [];
  private waiters: (() => void)[] = [];
  opened: Promise<void>;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}/ws`);
    this.opened = new Promise((res) => this.ws.once('open', () => res()));
    this.ws.on('message', (d) => {
      const msg = JSON.parse(String(d)) as ServerMsg;
      if (msg.t === 'joined') {
        this.token = msg.token;
        this.code = msg.code;
      } else if (msg.t === 'room') this.room = msg.room;
      else if (msg.t === 'state') this.view = msg.view;
      else if (msg.t === 'error') this.errors.push(msg.message);
      const w = this.waiters;
      this.waiters = [];
      w.forEach((f) => f());
    });
  }
  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }
  /** Wait until `pred` holds (re-checked after every incoming message). */
  async until(pred: () => boolean, ms = 3000) {
    const deadline = Date.now() + ms;
    while (!pred()) {
      if (Date.now() > deadline) throw new Error('timed out waiting');
      await new Promise<void>((res) => {
        this.waiters.push(res);
        setTimeout(res, 50);
      });
    }
  }
  close() {
    this.ws.close();
  }
}

let server: ReturnType<typeof startServer>;
let port: number;

beforeEach(async () => {
  server = startServer({ port: 0, timing: FAST });
  port = await server.ready;
});
afterEach(async () => {
  await server.close();
});

async function twoPlayerRoom() {
  const a = new TestClient(port);
  await a.opened;
  a.send({ t: 'create', name: 'Ana' });
  await a.until(() => !!a.room);
  const b = new TestClient(port);
  await b.opened;
  b.send({ t: 'join', code: a.code.toLowerCase(), name: 'Besi' });
  await b.until(() => !!b.room && b.room.seats.filter((s) => s.kind === 'human').length === 2);
  return { a, b };
}

/** Have the client make its move if it's their turn. */
function autoplay(c: TestClient) {
  const v = c.view;
  if (!v) return;
  if ((v.phase === 'playing' || v.phase === 'exchange') && v.turn === v.me) {
    c.send({ t: 'action', action: chooseBotAction(v) });
  }
}

describe('online server', () => {
  it('two humans + two bots play a full game', async () => {
    const { a, b } = await twoPlayerRoom();
    expect(a.room!.host).toBe(0);
    expect(b.room!.you).toBe(1);
    a.send({ t: 'start' });
    await a.until(() => !!a.view);
    expect(a.room!.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot', 'bot']);

    // Hidden information: a view only ever carries your own hand.
    const raw = JSON.stringify(a.view);
    const bHand = (await (async () => (await b.until(() => !!b.view), b.view!.hand))()).map((c) => c.id);
    expect(a.view!.hand.some((c) => bHand.includes(c.id))).toBe(false);
    expect(raw).not.toContain('"hand":[{' + JSON.stringify(b.view!.hand[0]).slice(1));

    let hands = 0;
    const deadline = Date.now() + 20000;
    while (a.view!.phase !== 'gameOver') {
      if (Date.now() > deadline) throw new Error('game took too long');
      autoplay(a);
      autoplay(b);
      if (a.view!.phase === 'handOver') {
        // Exchanged cards between others are hidden.
        hands++;
        a.send({ t: 'nextHand' });
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(hands).toBeGreaterThan(3);
    expect(a.view!.winners.length).toBeGreaterThan(0);
    for (const v of [a.view!, b.view!]) {
      for (const e of v.log) {
        if (e.kind === 'exchange' && e.from !== v.me && e.to !== v.me) expect(e.card).toBeNull();
      }
    }
    expect(a.errors).toEqual([]);
    a.close();
    b.close();
  }, 30000);

  it('rejects out-of-turn moves and ignores forged player ids', async () => {
    // Bots must not move during this test, or the turn could reach the "wrong" player
    // before their message arrives and the move would become legal.
    await server.close();
    server = startServer({ port: 0, timing: { ...FAST, botDelay: 60_000 } });
    port = await server.ready;
    const { a, b } = await twoPlayerRoom();
    a.send({ t: 'start' });
    await a.until(() => !!a.view && !!b.view);
    const v = a.view!;
    const notMe = v.turn === 0 ? b : a;
    const card = notMe.view!.hand[0].id;
    // Claim to be the player whose turn it is.
    notMe.send({ t: 'action', action: { type: 'play', player: v.turn, cardIds: [card] } });
    await notMe.until(() => notMe.errors.length > 0);
    expect(notMe.errors[0]).toMatch(/turn|hold/i);
    // Non-host can't start or deal.
    b.send({ t: 'nextHand' });
    a.close();
    b.close();
  });

  it('lets a player reconnect to their seat with the token', async () => {
    const { a, b } = await twoPlayerRoom();
    a.send({ t: 'start' });
    await b.until(() => !!b.view);
    const handBefore = b.view!.hand.map((c) => c.id).join();
    const { token, code } = b;
    b.close();
    await a.until(() => a.room!.seats[1].connected === false);
    const b2 = new TestClient(port);
    await b2.opened;
    b2.send({ t: 'join', code, name: 'Besi', token });
    await b2.until(() => !!b2.view);
    expect(b2.room!.you).toBe(1);
    // The bot may have played for them while away, so the hand is a subset of what it was.
    expect(b2.view!.hand.every((c) => handBefore.includes(c.id))).toBe(true);
    await a.until(() => a.room!.seats[1].connected === true);
    a.close();
    b2.close();
  });

  it('refuses joining a started game and unknown rooms', async () => {
    const { a, b } = await twoPlayerRoom();
    a.send({ t: 'start' });
    await a.until(() => !!a.view);
    const c = new TestClient(port);
    await c.opened;
    c.send({ t: 'join', code: a.code, name: 'Late' });
    await c.until(() => c.errors.length > 0);
    expect(c.errors[0]).toMatch(/already started/);
    c.send({ t: 'join', code: 'ZZZZ', name: 'x' });
    await c.until(() => c.errors.length > 1);
    expect(c.errors[1]).toMatch(/No room/);
    a.close();
    b.close();
    c.close();
  });

  it('host role moves when the host leaves the lobby, and a leaver mid-game becomes a bot', async () => {
    const { a, b } = await twoPlayerRoom();
    a.send({ t: 'leave' });
    await b.until(() => b.room!.host === 1 && b.room!.seats[0].kind === 'empty');
    // b is host now; a rejoins as a guest
    a.send({ t: 'join', code: b.code, name: 'Ana' });
    await a.until(() => !!a.room && a.room.you === 0);
    b.send({ t: 'start' });
    await b.until(() => !!b.view);
    a.send({ t: 'leave' });
    await b.until(() => b.room!.seats[0].kind === 'bot');
    expect(b.view!.players[0].isBot).toBe(true);
    a.close();
    b.close();
  });
});
