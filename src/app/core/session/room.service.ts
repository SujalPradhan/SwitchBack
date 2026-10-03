/**
 * core/session/room.service.ts
 *
 * The single source of truth for the active WebRTC room.
 * Owns the RTCPeerConnection, data channels, and player list.
 *
 * Host flow:  roomService.startHost()  → show offer QR → scanAndApplyAnswer()
 * Guest flow: roomService.joinAsGuest(encodedOffer) → show answer QR → connected
 *
 * Rules:
 * - All WebRTC and protocol logic lives here, NOT in components.
 * - Components read signals; they call methods; they never touch RTCPeerConnection.
 * - No RxJS. Only Angular signals and plain Promises.
 */

import { Injectable, signal, computed } from '@angular/core';
import { encodeSdp, decodeSdp } from '../transport/sdp-codec';
import {
  makeMessage,
  parseMessage,
  PlayerInfo,
  SbPayload,
} from '../protocol/envelope';
import { randomId, defaultDisplayName } from './ids';

export type RoomRole = 'host' | 'guest';
export type RoomPhase =
  | 'idle'
  | 'gathering'         // host: creating offer + waiting for ICE
  | 'offer-ready'       // host: offer QR shown, waiting for guest to scan
  | 'scanning-answer'   // host: scanning guest's answer QR
  | 'answer-ready'      // guest: answer QR shown, waiting for host to scan
  | 'connecting'        // both: ICE in progress
  | 'connected'         // both: data channel open
  | 'error';

export interface PendingGame {
  gameId: string;
  gameUrl: string;
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  // ── Public signals ─────────────────────────────────────────────────────────

  readonly phase = signal<RoomPhase>('idle');
  readonly role = signal<RoomRole | null>(null);
  readonly errorMsg = signal('');

  /** The encoded SDP the UI needs to render as a QR code. */
  readonly qrPayload = signal('');

  /** This device's player info. */
  readonly localPlayer = signal<PlayerInfo | null>(null);

  /** All players in the room (including local). Host is always index 0. */
  readonly players = signal<PlayerInfo[]>([]);

  /** Messages received from the data channel (not protocol messages). */
  readonly lastMessage = signal<{ from: string; data: unknown } | null>(null);

  /** Set by host when a game starts; guests watch this to navigate. */
  readonly pendingGame = signal<PendingGame | null>(null);

  readonly isConnected = computed(() => this.phase() === 'connected');
  readonly isHost = computed(() => this.role() === 'host');

  // ── Private state ──────────────────────────────────────────────────────────

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;  // host creates; guest receives
  private roomId = '';
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  // ── Host flow ──────────────────────────────────────────────────────────────

  /** Step 1 (host): create offer, wait for ICE, return encoded QR payload. */
  async startHost(): Promise<void> {
    this.reset();
    this.role.set('host');
    this.phase.set('gathering');

    this.roomId = randomId(8);
    const hostName = defaultDisplayName();

    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.dc = this.pc.createDataChannel('switchback', { ordered: true });
    this.setupDataChannel(this.dc);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.waitForIce();

    const sdp = this.pc.localDescription!.sdp;
    const encoded = await encodeSdp(JSON.stringify({ type: 'offer', sdp }));

    const hostPlayer: PlayerInfo = {
      playerId: randomId(8),
      displayName: hostName,
      seatIndex: 0,
      isHost: true,
    };
    this.localPlayer.set(hostPlayer);
    this.players.set([hostPlayer]);

    this.qrPayload.set(encoded);
    this.phase.set('offer-ready');
  }

  /** Step 2 (host): scan the guest's answer QR. Pass the raw decoded string. */
  async applyAnswer(encodedAnswer: string): Promise<void> {
    this.phase.set('connecting');
    try {
      const json = await decodeSdp(encodedAnswer);
      const desc = JSON.parse(json) as RTCSessionDescriptionInit;
      if (desc.type !== 'answer') throw new Error(`Expected answer, got ${desc.type}`);
      await this.pc!.setRemoteDescription(desc);
      // Connection opens when ICE succeeds → datachannel 'open' fires
    } catch (e) {
      this.fail('Bad answer QR: ' + String(e));
    }
  }

  // ── Guest flow ─────────────────────────────────────────────────────────────

  /** Step 1 (guest): receive encoded offer, create answer, return encoded QR payload. */
  async joinAsGuest(encodedOffer: string): Promise<void> {
    this.reset();
    this.role.set('guest');
    this.phase.set('gathering');

    const guestName = defaultDisplayName();
    const playerId = randomId(8);

    this.pc = new RTCPeerConnection({ iceServers: [] });

    this.pc.ondatachannel = (ev: RTCDataChannelEvent) => {
      this.dc = ev.channel;
      this.setupDataChannel(this.dc);
    };

    try {
      const json = await decodeSdp(encodedOffer);
      const offer = JSON.parse(json) as RTCSessionDescriptionInit;
      if (offer.type !== 'offer') throw new Error(`Expected offer, got ${offer.type}`);

      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.waitForIce();

      const sdp = this.pc.localDescription!.sdp;
      const encoded = await encodeSdp(JSON.stringify({ type: 'answer', sdp }));

      const guestPlayer: PlayerInfo = {
        playerId,
        displayName: guestName,
        seatIndex: -1,   // assigned by host on ack
        isHost: false,
      };
      this.localPlayer.set(guestPlayer);
      this.qrPayload.set(encoded);
      this.phase.set('answer-ready');
    } catch (e) {
      this.fail('Bad offer QR: ' + String(e));
    }
  }

  // ── Game control ───────────────────────────────────────────────────────────

  /**
   * Host calls this to launch a game for all players.
   * Sends game-start over the data channel; caller must also navigate.
   */
  startGame(gameUrl: string): void {
    const gameId = randomId(6);
    this.send({ type: 'game-start', gameId, gameUrl });
    this.pendingGame.set({ gameId, gameUrl });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  /** Send a platform envelope over the data channel. */
  send(payload: SbPayload): void {
    if (this.dc?.readyState !== 'open') return;
    this.dc.send(JSON.stringify(makeMessage(payload)));
  }

  /** Expose error state publicly so components can set camera-denied etc. */
  setError(msg: string): void {
    this.fail(msg);
  }

  /** Send an opaque game message. */
  sendGameMessage(data: unknown): void {
    const local = this.localPlayer();
    if (!local) return;
    this.send({ type: 'game-msg', fromPlayerId: local.playerId, data });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  reset(): void {
    this.stopPing();
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.roomId = '';
    this.phase.set('idle');
    this.role.set(null);
    this.errorMsg.set('');
    this.qrPayload.set('');
    this.localPlayer.set(null);
    this.players.set([]);
    this.lastMessage.set(null);
    this.pendingGame.set(null);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private setupDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => {
      this.phase.set('connected');
      if (this.role() === 'host') {
        // Greet guest(s)
        this.send({ type: 'host-hello', roomId: this.roomId });
        this.startPing();
      } else {
        // Guest announces itself — will be called once host-hello arrives
      }
    };

    dc.onclose = () => {
      if (this.phase() === 'connected') {
        this.fail('Connection closed unexpectedly.');
      }
    };

    dc.onerror = () => {
      this.fail('Data channel error.');
    };

    dc.onmessage = (ev: MessageEvent) => {
      try {
        const msg = parseMessage(String(ev.data));
        this.handleProtocolMessage(msg.payload);
      } catch {
        // Ignore malformed messages
      }
    };
  }

  private handleProtocolMessage(payload: SbPayload): void {
    switch (payload.type) {
      case 'host-hello': {
        this.roomId = payload.roomId;
        const local = this.localPlayer()!;
        // Guest announces itself
        this.send({
          type: 'guest-hello',
          playerId: local.playerId,
          displayName: local.displayName,
        });
        break;
      }

      case 'guest-hello': {
        // Host receives this — assign seat and ack
        const existing = this.players();
        const seatIndex = existing.length;
        const newPlayer: PlayerInfo = {
          playerId: payload.playerId,
          displayName: payload.displayName,
          seatIndex,
          isHost: false,
        };
        const updated = [...existing, newPlayer];
        this.players.set(updated);
        this.send({ type: 'guest-ack', playerId: payload.playerId, seatIndex, players: updated });
        this.send({ type: 'player-list', players: updated });
        break;
      }

      case 'guest-ack': {
        // Guest receives its seat assignment
        const local = this.localPlayer();
        if (local) {
          this.localPlayer.set({ ...local, seatIndex: payload.seatIndex });
        }
        this.players.set(payload.players);
        break;
      }

      case 'player-list':
        this.players.set(payload.players);
        break;

      case 'ping':
        this.send({ type: 'pong', seq: payload.seq });
        break;

      case 'pong':
        // Could track latency here in the future
        break;

      case 'game-start':
        this.pendingGame.set({ gameId: payload.gameId, gameUrl: payload.gameUrl });
        break;

      case 'session-end':
        this.fail(`Session ended: ${payload.reason}`);
        break;

      case 'game-msg':
        this.lastMessage.set({ from: payload.fromPlayerId, data: payload.data });
        break;

      default:
        break;
    }
  }

  private startPing(): void {
    let seq = 0;
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', seq: seq++ });
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async waitForIce(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.pc!.iceGatheringState === 'complete') { resolve(); return; }
      this.pc!.addEventListener('icegatheringstatechange', () => {
        if (this.pc!.iceGatheringState === 'complete') resolve();
      });
    });
  }

  private fail(msg: string): void {
    this.stopPing();
    this.errorMsg.set(msg);
    this.phase.set('error');
  }
}
