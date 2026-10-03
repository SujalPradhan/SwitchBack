import {
  ChangeDetectionStrategy,
  Component,
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
  selector: 'app-host-lobby',
  standalone: true,
  imports: [SbIconComponent, UpperCasePipe, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './host-lobby.component.html',
  styleUrl: './host-lobby.component.css',
})
export class HostLobbyComponent implements OnDestroy {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;

  readonly room = inject(RoomService);
  private router = inject(Router);
  readonly phase = this.room.phase;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;

  // ── Step 1 ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.room.startHost();
    setTimeout(() => this.renderQr(), 0);
  }

  // ── Add another guest ────────────────────────────────────────────────────

  /** Generate a new offer for an additional guest. */
  async addGuest(): Promise<void> {
    await this.room.prepareNextGuest();
    setTimeout(() => this.renderQr(), 0);
  }

  // ── Scan host flow ───────────────────────────────────────────────────────

  async startScan(): Promise<void> {
    this.room.phase.set('scanning-answer');
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
    // Tear down the abandoned pending peer connection
    this.room.cancelPendingGuest();

    // Return to the right state
    const hasGuests = this.room.players().some(p => !p.isHost);
    if (hasGuests) {
      this.room.phase.set('connected');
    } else {
      this.room.reset();
    }
  }

  // ── Game launch ──────────────────────────────────────────────────────────

  launchTrivia(): void {
    const gameUrl = '/games/trivia/index.html';
    this.room.startGame(gameUrl);
    this.router.navigate(['/play'], { queryParams: { url: gameUrl } });
  }

  launchGame(): void {
    const gameUrl = '/games/hello-room/index.html';
    this.room.startGame(gameUrl);
    this.router.navigate(['/play'], { queryParams: { url: gameUrl } });
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
    const video  = this.videoEl?.nativeElement;
    const canvas = this.scanCanvas?.nativeElement;
    if (!video || !canvas || video.readyState < 2) {
      this.rafId = requestAnimationFrame(() => this.scanFrame());
      return;
    }
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result    = jsQR(imageData.data, imageData.width, imageData.height);
    if (result) {
      this.stopCamera();
      this.room.applyAnswer(result.data);
      return;
    }
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private stopCamera(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  ngOnDestroy(): void { this.stopCamera(); }
}
