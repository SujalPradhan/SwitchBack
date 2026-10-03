import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { RoomService } from '../../core/session/room.service';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

@Component({
  selector: 'app-host-lobby',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './host-lobby.component.html',
  styleUrl: './host-lobby.component.css',
})
export class HostLobbyComponent implements OnDestroy {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;

  readonly room = inject(RoomService);

  // Expose phase as a computed shorthand for the template switch
  readonly phase = this.room.phase;

  private stream: MediaStream | null = null;
  private rafId: number | null = null;

  // ── Step 1: create offer ─────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.room.startHost();
    // phase is now 'offer-ready' — render QR on next tick
    setTimeout(() => this.renderQr(), 0);
  }

  // ── Step 2: scan guest answer ────────────────────────────────────────────

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
        this.room['fail']('Camera access denied: ' + String(e));
      }
    }, 0);
  }

  cancelScan(): void {
    this.stopCamera();
    // Go back to offer-ready if we have a qr payload, else go to idle
    if (this.room.qrPayload()) {
      this.room.phase.set('offer-ready');
      setTimeout(() => this.renderQr(), 0);
    } else {
      this.room.reset();
    }
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
      this.room.applyAnswer(result.data);
      return;
    }
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private stopCamera(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}
