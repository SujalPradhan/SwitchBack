import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { encodeSdp, decodeSdp } from '../../core/transport/sdp-codec';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

type Phase =
  | 'idle'
  | 'gathering'
  | 'show-offer-qr'
  | 'scanning-answer'
  | 'connecting'
  | 'connected'
  | 'error';

@Component({
  selector: 'app-spike-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="spike-page">
      <h1>Spike — Host</h1>

      @switch (phase()) {
        @case ('idle') {
          <button id="start-btn" (click)="start()">Start Room</button>
        }

        @case ('gathering') {
          <p>Gathering ICE candidates…</p>
        }

        @case ('show-offer-qr') {
          <p>Show this QR code to the guest phone:</p>
          <canvas #offerCanvas id="offer-qr"></canvas>
          <p class="size-note">Encoded size: {{ encodedSize() }} chars</p>
          <button id="scan-answer-btn" (click)="startScanAnswer()">
            I'm ready — scan guest's answer
          </button>
        }

        @case ('scanning-answer') {
          <p>Point camera at the guest's answer QR code:</p>
          <video #videoEl id="answer-video" autoplay playsinline muted></video>
          <canvas #scanCanvas style="display:none"></canvas>
          <p>{{ scanStatus() }}</p>
        }

        @case ('connecting') {
          <p>Setting remote description… waiting for data channel…</p>
        }

        @case ('connected') {
          <div class="connected-box">
            <p class="ok">✓ Connected!</p>
            <p>Received from guest: <strong>{{ received() }}</strong></p>
            <button id="send-btn" (click)="sendPing()">Send ping to guest</button>
          </div>
        }

        @case ('error') {
          <p class="err">Error: {{ errorMsg() }}</p>
          <button (click)="reset()">Reset</button>
        }
      }
    </div>
  `,
  styles: [`
    .spike-page { padding: 2rem; font-family: system-ui, sans-serif; max-width: 480px; margin: auto; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; }
    button { padding: 0.75rem 1.5rem; font-size: 1rem; cursor: pointer; margin-top: 1rem; display: block; }
    canvas { max-width: 100%; }
    video { width: 100%; max-width: 360px; border: 1px solid #ccc; }
    .size-note { font-size: 0.8rem; color: #555; }
    .ok { color: green; font-weight: bold; }
    .err { color: red; }
    .connected-box { border: 2px solid green; padding: 1rem; border-radius: 8px; }
  `],
})
export class SpikeHostComponent implements OnDestroy {
  @ViewChild('offerCanvas') offerCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;

  phase = signal<Phase>('idle');
  encodedSize = signal(0);
  scanStatus = signal('Scanning…');
  received = signal('(nothing yet)');
  errorMsg = signal('');

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;

  async start(): Promise<void> {
    this.phase.set('gathering');

    this.pc = new RTCPeerConnection({ iceServers: [] });

    this.dc = this.pc.createDataChannel('spike');
    this.dc.onopen = () => {
      this.phase.set('connected');
    };
    this.dc.onmessage = (ev: MessageEvent) => {
      this.received.set(String(ev.data));
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete so the offer is one complete blob
    await new Promise<void>((resolve) => {
      if (this.pc!.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      this.pc!.addEventListener('icegatheringstatechange', () => {
        if (this.pc!.iceGatheringState === 'complete') resolve();
      });
    });

    const finalSdp = this.pc.localDescription!.sdp;
    let encoded: string;
    try {
      encoded = await encodeSdp(JSON.stringify({ type: 'offer', sdp: finalSdp }));
    } catch (e) {
      this.fail(String(e));
      return;
    }

    this.encodedSize.set(encoded.length);
    this.phase.set('show-offer-qr');

    // Render QR on next tick so @ViewChild is available
    setTimeout(async () => {
      await QRCode.toCanvas(this.offerCanvas.nativeElement, encoded, {
        errorCorrectionLevel: 'L',
        width: 300,
      });
    }, 0);
  }

  async startScanAnswer(): Promise<void> {
    this.phase.set('scanning-answer');

    setTimeout(async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        this.videoEl.nativeElement.srcObject = this.stream;
        this.videoEl.nativeElement.play();
        this.rafId = requestAnimationFrame(() => this.scanFrame());
      } catch (e) {
        this.fail('Camera access denied: ' + String(e));
      }
    }, 0);
  }

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
      this.handleAnswer(result.data);
      return;
    }
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private async handleAnswer(encoded: string): Promise<void> {
    this.phase.set('connecting');
    try {
      const json = await decodeSdp(encoded);
      const answer = JSON.parse(json) as RTCSessionDescriptionInit;
      if (answer.type !== 'answer') throw new Error('Expected answer SDP, got ' + answer.type);
      await this.pc!.setRemoteDescription(answer);
    } catch (e) {
      this.fail('Bad answer QR: ' + String(e));
    }
  }

  sendPing(): void {
    this.dc?.send('ping from host');
  }

  private stopCamera(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private fail(msg: string): void {
    this.stopCamera();
    this.errorMsg.set(msg);
    this.phase.set('error');
  }

  reset(): void {
    this.stopCamera();
    this.pc?.close();
    this.pc = null;
    this.dc = null;
    this.phase.set('idle');
    this.errorMsg.set('');
    this.received.set('(nothing yet)');
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.pc?.close();
  }
}
