import type { Action, PlayerView } from '../engine';

/** Messages between the browser and the Murlan server (JSON over a WebSocket at /ws). */

export const SEATS = 4;
export const MAX_NAME = 16;

export interface SeatInfo {
  name: string;
  kind: 'empty' | 'human' | 'bot';
  connected: boolean;
}

export interface RoomInfo {
  code: string;
  seats: SeatInfo[];
  /** Your seat index. */
  you: number;
  host: number;
  started: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string }
  /** Join a room; pass the token you were given earlier to take your seat back. */
  | { t: 'join'; code: string; name: string; token?: string }
  /** Host only, in the lobby: put a bot in an empty seat or remove it. */
  | { t: 'setBot'; seat: number; bot: boolean }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'nextHand' }
  | { t: 'playAgain' }
  | { t: 'leave' };

export type ServerMsg =
  | { t: 'joined'; code: string; token: string; seat: number }
  | { t: 'room'; room: RoomInfo }
  /** `msLeft` counts down the current deadline (your turn timer, or the auto-deal after a hand). */
  | { t: 'state'; view: PlayerView; msLeft: number | null }
  /** `fatal`: the room/seat is gone — forget the saved session. */
  | { t: 'error'; message: string; fatal?: boolean }
  | { t: 'left' };
