import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { RoomService } from '../../core/session/room.service';
import { SbIconComponent } from '../../shared/icon/icon.component';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { CommonModule, UpperCasePipe } from '@angular/common';

@Component({
  selector: 'app-guest-join',
  standalone: true,
  imports: [SbIconComponent, UpperCasePipe, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-join.component.html',
  styleUrl: './guest-join.component.css',
})
export class GuestJoinComponent implements OnDestroy {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;

  readonly room = inject(RoomService);
  private router = inject(Router);
  readonly phase = this.room.phase;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  constructor() {
    // Render QR when answer is ready; acquire wake lock so screen stays on.
    effect(() => {
      if (this.phase() === 'answer-ready') {
        setTimeout(() => this.renderQr(), 0);
        this.acquireWakeLock();
      }
      if (this.phase() === 'connected') {
        this.releaseWakeLock();
      }
    });

    // Auto-navigate when the host starts a game.
    // Only navigate if the game is new (not one we already returned from).
    effect(() => {
      const game = this.room.pendingGame();
      if (game && game.gameId !== this.lastSeenGameId) {
        this.lastSeenGameId = game.gameId;
        this.router.navigate(['/play'], { queryParams: { url: game.gameUrl } });
      }
    });
  }

  /** Track the last game we navigated to, so we don't bounce back into it. */
  private lastSeenGameId: string | null = null;

  // ── Step 1: scan host offer ──────────────────────────────────────────────

  async startScan(): Promise<void> {
    this.room.phase.set('gathering');
    setTimeout(async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play();
        this.rafId = requestAnimationFrame(() => this.scanFrame());
      } catch (e) {
        this.room.setError('Camera access denied: ' + String(e));
      }
    }, 0);
  }

  cancelScan(): void {
    this.stopCamera();
    this.room.reset();
  }

  // ── QR rendering ────────────────────────────────────────────────────────

  private async renderQr(): Promise<void> {
    const payload = this.room.qrPayload();
    if (!payload || !this.qrCanvas?.nativeElement) return;
    await QRCode.toCanvas(this.qrCanvas.nativeElement, payload, {
      errorCorrectionLevel: 'L',
      width: 300,
    });
  }

  // ── Camera scan loop ─────────────────────────────────────────────────────

  private scanFrame(): void {
    const video = this.videoEl?.nativeElement;
    const canvas = this.scanCanvas?.nativeElement;
    if (!video || !canvas || video.readyState < 2) {
      this.rafId = requestAnimationFrame(() => this.scanFrame());
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result) {
      this.stopCamera();
      this.room.joinAsGuest(result.data);
      return;
    }
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private stopCamera(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // ── Wake lock ────────────────────────────────────────────────────────────

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not critical */ }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release();
    this.wakeLock = null;
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.releaseWakeLock();
  }
}
