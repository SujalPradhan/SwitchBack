/**
 * core/session/room.service.ts  (v2 — multi-guest)
 *
 * Host maintains a Map<peerId, PeerEntry> — one RTCPeerConnection per guest.
 * Each guest still has a single PC/DC to the host (no change on guest side).
 *
 * Host flow:
 *   startHost()          → creates first offer → qrPayload signal set
 *   applyAnswer(encoded) → applies to pendingPeerId's PC
 *   prepareNextGuest()   → creates another offer → qrPayload signal set
 *   cancelPendingGuest() → tears down the abandoned pending PC
 *
 * Guest flow (unchanged):
 *   joinAsGuest(encoded) → creates answer → qrPayload signal set
 *
 * Messages:
 *   host → broadcast()        all connected guests
 *   host → sendToGuest(id)    one specific guest
 *   guest → send()            the single host DC
 *   game relay: host forwards game-msg from any guest to all others
 */

import { Injectable, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';
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
  | 'gathering'
  | 'offer-ready'
  | 'scanning-answer'
  | 'answer-ready'
  | 'connecting'
  | 'connected'
  | 'error';

export interface PendingGame {
  gameId: string;
  gameUrl: string;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface PeerEntry {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  guestPlayerId: string | null;
  pingTimer: ReturnType<typeof setInterval> | null;
}

// ── Service ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RoomService {

  // ── Public signals ───────────────────────────────────────────────────────

  readonly phase        = signal<RoomPhase>('idle');
  readonly role         = signal<RoomRole | null>(null);
  readonly errorMsg     = signal('');
  readonly qrPayload    = signal('');
  readonly localPlayer  = signal<PlayerInfo | null>(null);
  readonly players      = signal<PlayerInfo[]>([]);
  readonly gameMessage$ = new Subject<{ from: string; data: unknown }>();
  readonly returnToLobby$ = new Subject<void>();
  readonly pendingGame  = signal<PendingGame | null>(null);

  readonly isConnected  = computed(() => this.phase() === 'connected');
  readonly isHost       = computed(() => this.role() === 'host');

  // ── Private — host side ──────────────────────────────────────────────────

  /** One entry per guest, keyed by platform-internal peerId. */
  private guestPeers   = new Map<string, PeerEntry>();
  /** The peerId of the PC we just created an offer for (awaiting answer scan). */
  private pendingPeerId: string | null = null;
  private roomId = '';

  // ── Private — guest side ─────────────────────────────────────────────────

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel   | null = null;

  // =========================================================================
  // Host flow
  // =========================================================================

  /** Create a room and generate the first offer QR. */
  async startHost(): Promise<void> {
    this.reset();
    this.role.set('host');
    this.roomId = randomId(8);

    const hostPlayer: PlayerInfo = {
      playerId: randomId(8),
      displayName: defaultDisplayName(),
      seatIndex: 0,
      isHost: true,
    };
    this.localPlayer.set(hostPlayer);
    this.players.set([hostPlayer]);
    await this.createNextOffer();
  }

  /** Generate a fresh offer QR for the next guest (called after first guest connects). */
  async prepareNextGuest(): Promise<void> {
    await this.createNextOffer();
  }

  /**
   * Apply a guest's answer SDP (scanned from their QR code).
   * Completes the handshake for the currently-pending peer.
   */
  async applyAnswer(encodedAnswer: string): Promise<void> {
    const peerId = this.pendingPeerId;
    if (!peerId) { this.setError('No pending connection — please generate a new QR first.'); return; }

    const entry = this.guestPeers.get(peerId);
    if (!entry) { this.setError('Peer entry lost — please tap "Add player" again.'); return; }

    this.phase.set('connecting');
    try {
      const json = await decodeSdp(encodedAnswer);
      const desc = JSON.parse(json) as RTCSessionDescriptionInit;
      if (desc.type !== 'answer') throw new Error(`Expected answer SDP, got ${desc.type}`);
      await entry.pc.setRemoteDescription(desc);
      // Datachannel 'open' fires → onGuestConnected()
    } catch (e) {
      this.setError('Bad answer QR: ' + String(e));
    }
  }

  /**
   * Tear down the pending (unconnected) peer without affecting live guests.
   * Call when the host cancels the "add player" flow mid-way.
   */
  cancelPendingGuest(): void {
    if (!this.pendingPeerId) return;
    const entry = this.guestPeers.get(this.pendingPeerId);
    if (entry) {
      try { entry.dc.close(); } catch { /* ignore */ }
      try { entry.pc.close(); } catch { /* ignore */ }
      this.guestPeers.delete(this.pendingPeerId);
    }
    this.pendingPeerId = null;
    this.qrPayload.set('');
  }

  // =========================================================================
  // Guest flow
  // =========================================================================

  /** Decode an offer QR, create an answer, expose encoded answer as qrPayload. */
  async joinAsGuest(encodedOffer: string): Promise<void> {
    this.reset();
    this.role.set('guest');
    this.phase.set('gathering');

    const playerId   = randomId(8);
    const guestName  = defaultDisplayName();

    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.ondatachannel = (ev: RTCDataChannelEvent) => {
      this.dc = ev.channel;
      this.setupGuestDataChannel(this.dc);
    };

    try {
      const json = await decodeSdp(encodedOffer);
      const offer = JSON.parse(json) as RTCSessionDescriptionInit;
      if (offer.type !== 'offer') throw new Error(`Expected offer, got ${offer.type}`);

      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.waitForIce(this.pc);

      const sdp     = this.pc.localDescription!.sdp;
      const encoded = await encodeSdp(JSON.stringify({ type: 'answer', sdp }));

      this.localPlayer.set({ playerId, displayName: guestName, seatIndex: -1, isHost: false });
      this.qrPayload.set(encoded);
      this.phase.set('answer-ready');
    } catch (e) {
      this.fail('Bad offer QR: ' + String(e));
    }
  }

  // =========================================================================
  // Game control
  // =========================================================================

  /** Host broadcasts game-start to all guests. Caller must also navigate. */
  startGame(gameUrl: string): void {
    const gameId = randomId(6);
    this.broadcast({ type: 'game-start', gameId, gameUrl });
    this.pendingGame.set({ gameId, gameUrl });
  }

  /** Host broadcasts game-end to all guests. Returns everyone to the lobby. */
  endGame(): void {
    this.broadcast({ type: 'game-end' });
    this.pendingGame.set(null);
  }

  // =========================================================================
  // Messaging (public)
  // =========================================================================

  /** Guest → Host */
  send(payload: SbPayload): void {
    if (this.dc?.readyState !== 'open') return;
    this.dc.send(JSON.stringify(makeMessage(payload)));
  }

  /** Send a game-msg: host broadcasts; guest sends to host. */
  sendGameMessage(data: unknown): void {
    const local = this.localPlayer();
    if (!local) return;
    const payload: SbPayload = { type: 'game-msg', fromPlayerId: local.playerId, data };
    if (this.role() === 'host') this.broadcast(payload);
    else this.send(payload);
  }

  /** Expose internal fail() as public so components can report camera errors etc. */
  setError(msg: string): void { this.fail(msg); }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  reset(): void {
    // Tear down all host peers
    for (const e of this.guestPeers.values()) {
      if (e.pingTimer) clearInterval(e.pingTimer);
      try { e.dc.close(); } catch { /* ignore */ }
      try { e.pc.close(); } catch { /* ignore */ }
    }
    this.guestPeers.clear();
    this.pendingPeerId = null;

    // Tear down guest peer
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.dc = null;
    this.pc = null;

    this.roomId = '';
    this.phase.set('idle');
    this.role.set(null);
    this.errorMsg.set('');
    this.qrPayload.set('');
    this.localPlayer.set(null);
    this.players.set([]);
    this.pendingGame.set(null);
  }

  // =========================================================================
  // Private — host multi-peer
  // =========================================================================

  private async createNextOffer(): Promise<void> {
    this.phase.set('gathering');
    const peerId = randomId(6);
    const pc     = new RTCPeerConnection({ iceServers: [] });
    const dc     = pc.createDataChannel('switchback', { ordered: true });

    const entry: PeerEntry = { peerId, pc, dc, guestPlayerId: null, pingTimer: null };
    this.guestPeers.set(peerId, entry);
    this.pendingPeerId = peerId;
    this.setupHostDataChannel(entry);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIce(pc);

      const sdp     = pc.localDescription!.sdp;
      const encoded = await encodeSdp(JSON.stringify({ type: 'offer', sdp }));
      this.qrPayload.set(encoded);
      this.phase.set('offer-ready');
    } catch (e) {
      // Clean up the failed peer without touching live guests
      this.guestPeers.delete(peerId);
      this.pendingPeerId = null;
      this.fail(String(e));
    }
  }

  private setupHostDataChannel(entry: PeerEntry): void {
    const { dc, peerId } = entry;

    dc.onopen = () => {
      if (this.pendingPeerId === peerId) this.pendingPeerId = null;
      this.phase.set('connected');

      // Greet the newly connected guest
      dc.send(JSON.stringify(makeMessage({ type: 'host-hello', roomId: this.roomId })));

      // Keepalive ping for this specific peer
      let seq = 0;
      entry.pingTimer = setInterval(() => {
        if (dc.readyState === 'open') {
          dc.send(JSON.stringify(makeMessage({ type: 'ping', seq: seq++ })));
        } else {
          if (entry.pingTimer) clearInterval(entry.pingTimer);
          entry.pingTimer = null;
        }
      }, 5000);
    };

    dc.onclose  = () => this.onGuestDisconnected(peerId);
    dc.onerror  = () => this.onGuestDisconnected(peerId);
    dc.onmessage = (ev: MessageEvent) => {
      try {
        const msg = parseMessage(String(ev.data));
        this.handleHostIncoming(msg.payload, peerId);
      } catch { /* ignore malformed */ }
    };
  }

  private onGuestDisconnected(peerId: string): void {
    const entry = this.guestPeers.get(peerId);
    if (!entry) return;

    if (entry.pingTimer) clearInterval(entry.pingTimer);
    try { entry.dc.close(); } catch { /* ignore */ }
    try { entry.pc.close(); } catch { /* ignore */ }
    this.guestPeers.delete(peerId);

    // Remove from player list and notify remaining guests
    if (entry.guestPlayerId) {
      const updated = this.players().filter(p => p.playerId !== entry.guestPlayerId);
      // Renumber seats (preserve host at 0)
      const renumbered = updated.map((p, i) => ({ ...p, seatIndex: i }));
      this.players.set(renumbered);
      const hasOtherGuests = [...this.guestPeers.values()].some(e => e.dc.readyState === 'open');
      if (hasOtherGuests) this.broadcast({ type: 'player-list', players: renumbered });
    }
  }

  private handleHostIncoming(payload: SbPayload, fromPeerId: string): void {
    const entry = this.guestPeers.get(fromPeerId);
    if (!entry) return;

    switch (payload.type) {
      case 'guest-hello': {
        const existing   = this.players();
        const seatIndex  = existing.length; // host is 0, next guest = 1, 2, …
        const newPlayer: PlayerInfo = {
          playerId: payload.playerId,
          displayName: payload.displayName,
          seatIndex,
          isHost: false,
        };
        entry.guestPlayerId = payload.playerId;
        const updated = [...existing, newPlayer];
        this.players.set(updated);

        // ACK the joining guest with their seat + full player list
        entry.dc.send(JSON.stringify(makeMessage({
          type: 'guest-ack', playerId: payload.playerId, seatIndex, players: updated,
        })));

        // Tell all OTHER guests about the new player list
        for (const e of this.guestPeers.values()) {
          if (e.peerId !== fromPeerId && e.dc.readyState === 'open') {
            e.dc.send(JSON.stringify(makeMessage({ type: 'player-list', players: updated })));
          }
        }
        break;
      }

      case 'pong':
        break; // Could track per-peer latency here

      case 'game-msg': {
        // Surface to game-frame (host also plays)
        this.gameMessage$.next({ from: payload.fromPlayerId, data: payload.data });
        // Relay to all other connected guests
        const relayMsg = JSON.stringify(makeMessage(payload));
        for (const e of this.guestPeers.values()) {
          if (e.peerId !== fromPeerId && e.dc.readyState === 'open') {
            e.dc.send(relayMsg);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  /** Send a message to every connected guest. */
  private broadcast(payload: SbPayload): void {
    const msg = JSON.stringify(makeMessage(payload));
    for (const e of this.guestPeers.values()) {
      if (e.dc.readyState === 'open') e.dc.send(msg);
    }
  }

  // =========================================================================
  // Private — guest side
  // =========================================================================

  private setupGuestDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => this.phase.set('connected');

    dc.onclose = () => {
      if (this.phase() === 'connected') this.fail('Connection to host was lost.');
    };

    dc.onerror = () => {
      if (this.phase() === 'connected') this.fail('Connection error.');
    };

    dc.onmessage = (ev: MessageEvent) => {
      try {
        const msg = parseMessage(String(ev.data));
        this.handleGuestIncoming(msg.payload);
      } catch { /* ignore malformed */ }
    };
  }

  private handleGuestIncoming(payload: SbPayload): void {
    switch (payload.type) {
      case 'host-hello':
        this.roomId = payload.roomId;
        {
          const local = this.localPlayer()!;
          this.send({ type: 'guest-hello', playerId: local.playerId, displayName: local.displayName });
        }
        break;

      case 'guest-ack': {
        const local = this.localPlayer();
        if (local) this.localPlayer.set({ ...local, seatIndex: payload.seatIndex });
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
        break;

      case 'game-start':
        this.pendingGame.set({ gameId: payload.gameId, gameUrl: payload.gameUrl });
        break;

      case 'game-msg':
        this.gameMessage$.next({ from: payload.fromPlayerId, data: payload.data });
        break;

      case 'game-end':
        this.pendingGame.set(null);
        this.returnToLobby$.next();
        break;

      case 'session-end':
        this.fail(`Session ended: ${payload.reason}`);
        break;

      default:
        break;
    }
  }

  // =========================================================================
  // Private — shared
  // =========================================================================

  /**
   * Wait for ICE gathering on a specific PC to complete.
   * Rejects with a user-friendly error after 15 seconds.
   */
  private waitForIce(pc: RTCPeerConnection, timeoutMs = 15_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          'ICE gathering timed out (15 s). Make sure both phones are on the same hotspot. ' +
          'If candidates show only .local hostnames, disable WebRTC mDNS at chrome://flags.',
        ));
      }, timeoutMs);

      const done = () => { clearTimeout(timer); resolve(); };

      if (pc.iceGatheringState === 'complete') { done(); return; }
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') done();
      });
    });
  }

  private fail(msg: string): void {
    this.errorMsg.set(msg);
    this.phase.set('error');
  }
}
