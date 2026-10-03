import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
  effect,
} from '@angular/core';
import { RoomService } from '../../core/session/room.service';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

@Component({
  selector: 'app-guest-join',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-join.component.html',
  styleUrl: './guest-join.component.css',
})
export class GuestJoinComponent implements OnDestroy {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;

  readonly room = inject(RoomService);
  readonly phase = this.room.phase;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  constructor() {
    // When phase becomes 'answer-ready', the qrCanvas is in the DOM — render QR.
    effect(() => {
      if (this.phase() === 'answer-ready') {
        setTimeout(() => this.renderQr(), 0);
        this.acquireWakeLock();
      }
      if (this.phase() === 'connected') {
        this.releaseWakeLock();
      }
    });
  }

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
        this.room['fail']('Camera access denied: ' + String(e));
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
