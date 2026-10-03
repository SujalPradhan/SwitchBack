/**
 * core/protocol/envelope.ts
 *
 * Every message sent through the WebRTC data channel is a typed JSON envelope.
 * No Angular imports — pure TypeScript.
 *
 * Adding a new message type:
 *   1. Add a new `SbPayload` variant below.
 *   2. Consumers narrow by `msg.type`.
 */

// ── Payloads ────────────────────────────────────────────────────────────────

/** Host announces itself (first message sent when data channel opens). */
export interface HostHelloPayload {
  type: 'host-hello';
  roomId: string;
}

/** Guest announces itself after receiving host-hello. */
export interface GuestHelloPayload {
  type: 'guest-hello';
  playerId: string;
  displayName: string;
}

/** Host ACKs a guest and assigns them a seat index. */
export interface GuestAckPayload {
  type: 'guest-ack';
  playerId: string;
  seatIndex: number;
  /** Full player list at the moment of join (for late joiners). */
  players: PlayerInfo[];
}

/** Host broadcasts the current player list to all guests. */
export interface PlayerListPayload {
  type: 'player-list';
  players: PlayerInfo[];
}

/** Platform-level ping/pong for connection health. */
export interface PingPayload { type: 'ping'; seq: number; }
export interface PongPayload { type: 'pong'; seq: number; }

/** Host tells guests that a game is starting. */
export interface GameStartPayload {
  type: 'game-start';
  gameId: string;
  gameUrl: string;
}

/** Forwarded game message (platform is the transport, game is the sender). */
export interface GameMessagePayload {
  type: 'game-msg';
  fromPlayerId: string;
  /** The game's own payload — opaque to the platform. */
  data: unknown;
}

/** Host declares the session over. */
export interface SessionEndPayload {
  type: 'session-end';
  reason: 'host-quit' | 'game-over';
}

// ── Union ────────────────────────────────────────────────────────────────────

export type SbPayload =
  | HostHelloPayload
  | GuestHelloPayload
  | GuestAckPayload
  | PlayerListPayload
  | PingPayload
  | PongPayload
  | GameStartPayload
  | GameMessagePayload
  | SessionEndPayload;

// ── Envelope ────────────────────────────────────────────────────────────────

export interface SbMessage {
  /** Protocol version — bump when envelope shape changes. */
  v: 1;
  payload: SbPayload;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Wrap a payload in an envelope ready for JSON.stringify. */
export function makeMessage(payload: SbPayload): SbMessage {
  return { v: 1, payload };
}

/** Parse and validate an incoming JSON string from the data channel. */
export function parseMessage(raw: string): SbMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SbMessage: invalid JSON');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>)['v'] !== 1 ||
    typeof (parsed as Record<string, unknown>)['payload'] !== 'object'
  ) {
    throw new Error('SbMessage: missing or wrong version');
  }
  return parsed as SbMessage;
}

// ── Shared types ─────────────────────────────────────────────────────────────

export interface PlayerInfo {
  playerId: string;
  displayName: string;
  seatIndex: number;
  /** True for the host player entry. */
  isHost: boolean;
}
