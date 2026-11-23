import { randomBytes } from 'node:crypto';
import {
  Action,
  GameState,
  IllegalMove,
  applyAction,
  chooseBotAction,
  createGame,
  viewFor,
} from '../src/engine';
import { ClientMsg, MAX_NAME, RoomInfo, SEATS, ServerMsg } from '../src/shared/protocol';

/** Anything that can receive messages — a WebSocket in production, a stub in tests. */
export interface Client {
  send(msg: ServerMsg): void;
  /** Set by the room manager so a socket knows which seat it holds. */
  session?: { room: Room; seat: number };
}

export interface Timing {
  botDelay: number;
  /** Bot stands in for a disconnected player after this long. */
  offlineDelay: number;
  turnTime: number;
  nextHandTime: number;
  /** A lobby seat whose player dropped is freed after this long. */
  lobbyGrace: number;
  /** An abandoned room (no one connected) is deleted after this long. */
  roomTtl: number;
}

export const DEFAULT_TIMING: Timing = {
  botDelay: 900,
  offlineDelay: 1500,
  turnTime: 45_000,
  nextHandTime: 30_000,
  lobbyGrace: 30_000,
  roomTtl: 10 * 60_000,
};

interface Seat {
  kind: 'empty' | 'human' | 'bot';
  name: string;
  token: string | null;
  client: Client | null;
  lobbyTimer?: NodeJS.Timeout;
}

const BOT_NAMES = ['Drita', 'Arben', 'Teuta', 'Gëzim'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 1000;

function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME) : '';
  return s || 'Player';
}

export class Room {
  seats: Seat[] = Array.from({ length: SEATS }, () => ({ kind: 'empty', name: '', token: null, client: null }));
  host = 0;
  game: GameState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private deadline: number | null = null;
  private ttlTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly code: string,
    private readonly manager: RoomManager,
  ) {}

  get timing() {
    return this.manager.timing;
  }

  humans() {
    return this.seats.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'human');
  }

  isConnected(seat: number) {
    return this.seats[seat].client !== null;
  }

  info(you: number): RoomInfo {
    return {
      code: this.code,
      seats: this.seats.map((s) => ({ name: s.name, kind: s.kind, connected: s.kind === 'bot' || s.client !== null })),
      you,
      host: this.host,
      started: this.game !== null,
    };
  }

  /** Seat a client. Returns false if the room is full or already playing. */
  seatClient(client: Client, name: string, token?: string): boolean {
    // Reclaim a seat with its token (reconnect / page refresh).
    if (token) {
      const idx = this.seats.findIndex((s) => s.kind === 'human' && s.token === token);
      if (idx >= 0) {
        this.attach(idx, client);
        return true;
      }
    }
    if (this.game) return false;
    const idx = this.seats.findIndex((s) => s.kind === 'empty');
    if (idx < 0) return false;
    const seat = this.seats[idx];
    seat.kind = 'human';
    seat.name = cleanName(name);
    seat.token = randomBytes(16).toString('hex');
    if (this.humans().length === 1) this.host = idx;
    this.attach(idx, client);
    return true;
  }

  private attach(idx: number, client: Client) {
    const seat = this.seats[idx];
    if (seat.client && seat.client !== client) {
      seat.client.send({ t: 'error', message: 'You joined from another tab.', fatal: true });
      seat.client.session = undefined;
    }
    clearTimeout(seat.lobbyTimer);
    seat.client = client;
    client.session = { room: this, seat: idx };
    if (this.ttlTimer) clearTimeout(this.ttlTimer);
    this.ttlTimer = null;
    client.send({ t: 'joined', code: this.code, token: seat.token!, seat: idx });
    this.broadcast();
    // A returning player may have been on autopilot; give them their turn back.
    this.schedule();
  }

  disconnect(client: Client) {
    const session = client.session;
    if (!session) return;
    const seat = this.seats[session.seat];
    if (seat.client !== client) return;
    seat.client = null;
    client.session = undefined;
    if (!this.game) {
      seat.lobbyTimer = setTimeout(() => this.vacate(session.seat), this.timing.lobbyGrace);
    }
    this.afterSeatChange();
  }

  leave(client: Client) {
    const session = client.session;
    if (!session) return;
    const idx = session.seat;
    client.session = undefined;
    this.seats[idx].client = null;
    client.send({ t: 'left' });
    this.vacate(idx);
  }

  /** Free a seat for good: empty in the lobby, a bot mid-game. */
  private vacate(idx: number) {
    const seat = this.seats[idx];
    if (seat.kind !== 'human' || seat.client) return;
    clearTimeout(seat.lobbyTimer);
    seat.token = null;
    if (this.game) {
      seat.kind = 'bot';
      this.game = {
        ...this.game,
        players: this.game.players.map((p) => (p.id === idx ? { ...p, isBot: true } : p)),
      };
    } else {
      seat.kind = 'empty';
      seat.name = '';
    }
    this.afterSeatChange();
  }

  private afterSeatChange() {
    const humans = this.humans();
    if (humans.length === 0) {
      this.manager.delete(this);
      return;
    }
    // Hand the host role to someone still connected.
    if (this.seats[this.host].kind !== 'human' || !this.isConnected(this.host)) {
      const next = humans.find(({ i }) => this.isConnected(i)) ?? humans[0];
      this.host = next.i;
    }
    if (!humans.some(({ i }) => this.isConnected(i))) {
      if (this.ttlTimer) clearTimeout(this.ttlTimer);
      this.ttlTimer = setTimeout(() => this.manager.delete(this), this.timing.roomTtl);
    }
    this.broadcast();
    this.schedule();
  }

  handle(client: Client, msg: ClientMsg) {
    const seat = client.session!.seat;
    const isHost = seat === this.host;
    switch (msg.t) {
      case 'setBot': {
        if (!isHost || this.game) return client.send({ t: 'error', message: 'Only the host can change seats.' });
        const target = this.seats[msg.seat];
        if (!target || target.kind === 'human') return;
        target.kind = msg.bot ? 'bot' : 'empty';
        target.name = msg.bot ? this.botName() : '';
        this.broadcast();
        return;
      }
      case 'start': {
        if (!isHost || this.game) return;
        for (const s of this.seats) {
          if (s.kind === 'empty') {
            s.kind = 'bot';
            s.name = this.botName();
          }
        }
        this.newGame();
        return;
      }
      case 'playAgain': {
        if (!isHost || this.game?.phase !== 'gameOver') return;
        this.newGame();
        return;
      }
      case 'nextHand': {
        if (!isHost || this.game?.phase !== 'handOver') return;
        this.apply({ type: 'nextHand' });
        return;
      }
      case 'action': {
        if (!this.game) return;
        const action = { ...msg.action, player: seat } as Action;
        if (action.type === 'nextHand') return;
        this.apply(action, client);
        return;
      }
    }
  }

  private botName(): string {
    const used = new Set(this.seats.map((s) => s.name));
    return BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot';
  }

  private newGame() {
    this.game = createGame(
      this.seats.map((s) => ({ name: s.name, isBot: s.kind === 'bot' })),
      randomBytes(4).readUInt32LE(0),
    );
    this.broadcast();
    this.schedule();
  }

  private apply(action: Action, from?: Client) {
    if (!this.game) return;
    try {
      this.game = applyAction(this.game, action);
    } catch (e) {
      if (e instanceof IllegalMove) {
        from?.send({ t: 'error', message: e.message });
        return;
      }
      throw e;
    }
    this.schedule();
    this.broadcast();
  }

  /** Who must act now: a seat index, or null. */
  private actor(): number | null {
    const g = this.game;
    if (!g) return null;
    if (g.phase === 'playing') return g.turn;
    if (g.phase === 'exchange') return g.exchange!.winner;
    return null;
  }

  /** Set the timer for whatever happens next if nobody acts: bot moves, autopilot, auto-deal. */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
    const g = this.game;
    if (!g) return;
    if (g.phase === 'handOver') {
      this.deadline = Date.now() + this.timing.nextHandTime;
      this.timer = setTimeout(() => this.apply({ type: 'nextHand' }), this.timing.nextHandTime);
      return;
    }
    const actor = this.actor();
    if (actor === null) return;
    const seat = this.seats[actor];
    const autopilot = () => {
      if (!this.game) return;
      this.apply(chooseBotAction(viewFor(this.game, actor)));
    };
    if (seat.kind === 'bot') {
      const delay = this.timing.botDelay * (g.table === null ? 1.3 : 1);
      this.timer = setTimeout(autopilot, delay);
    } else if (!seat.client) {
      this.timer = setTimeout(autopilot, this.timing.offlineDelay);
    } else {
      this.deadline = Date.now() + this.timing.turnTime;
      this.timer = setTimeout(autopilot, this.timing.turnTime);
    }
  }

  broadcast() {
    const msLeft = this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
    this.seats.forEach((s, i) => {
      if (!s.client) return;
      s.client.send({ t: 'room', room: this.info(i) });
      if (this.game) s.client.send({ t: 'state', view: viewFor(this.game, i), msLeft });
    });
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ttlTimer) clearTimeout(this.ttlTimer);
    for (const s of this.seats) clearTimeout(s.lobbyTimer);
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  constructor(readonly timing: Timing = DEFAULT_TIMING) {}

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(4);
      const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  delete(room: Room) {
    room.dispose();
    this.rooms.delete(room.code);
  }

  handle(client: Client, raw: unknown) {
    const msg = raw as ClientMsg;
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'create': {
        if (this.rooms.size >= MAX_ROOMS) return client.send({ t: 'error', message: 'Server is full, try later.' });
        client.session?.room.leave(client);
        const room = new Room(this.newCode(), this);
        this.rooms.set(room.code, room);
        room.seatClient(client, msg.name);
        return;
      }
      case 'join': {
        const code = String(msg.code ?? '').toUpperCase().trim();
        const room = this.rooms.get(code);
        if (!room) return client.send({ t: 'error', message: `No room with code ${code || '—'}.`, fatal: true });
        if (client.session && client.session.room !== room) client.session.room.leave(client);
        if (!room.seatClient(client, msg.name, msg.token)) {
          client.send({
            t: 'error',
            message: room.game ? 'That game has already started.' : 'That room is full.',
            fatal: true,
          });
        }
        return;
      }
      case 'leave': {
        client.session?.room.leave(client);
        return;
      }
      default: {
        if (!client.session) return client.send({ t: 'error', message: 'Join a room first.' });
        client.session.room.handle(client, msg);
      }
    }
  }

  disconnect(client: Client) {
    client.session?.room.disconnect(client);
  }
}
