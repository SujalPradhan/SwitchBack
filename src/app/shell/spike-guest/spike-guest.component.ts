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
  | 'scanning-offer'
  | 'creating-answer'
  | 'show-answer-qr'
  | 'connecting'
  | 'connected'
  | 'error';

@Component({
  selector: 'app-spike-guest',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="spike-page">
      <h1>Spike — Guest</h1>

      @switch (phase()) {
        @case ('idle') {
          <button id="scan-offer-btn" (click)="startScanOffer()">
            Scan host QR code
          </button>
        }

        @case ('scanning-offer') {
          <p>Point camera at the host's QR code:</p>
          <video #videoEl id="offer-video" autoplay playsinline muted></video>
          <canvas #scanCanvas style="display:none"></canvas>
          <p>{{ scanStatus() }}</p>
        }

        @case ('creating-answer') {
          <p>Creating answer…</p>
        }

        @case ('show-answer-qr') {
          <p>Show this QR code to the host phone:</p>
          <canvas #answerCanvas id="answer-qr"></canvas>
          <p class="size-note">Encoded size: {{ encodedSize() }} chars</p>
          <p class="hint">The host will scan this QR. Connection will open automatically.</p>
        }

        @case ('connecting') {
          <p>Waiting for host to scan and connect…</p>
        }

        @case ('connected') {
          <div class="connected-box">
            <p class="ok">✓ Connected!</p>
            <p>Received from host: <strong>{{ received() }}</strong></p>
            <button id="send-btn" (click)="sendPong()">Send pong to host</button>
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
    .hint { font-size: 0.85rem; color: #333; }
    .ok { color: green; font-weight: bold; }
    .err { color: red; }
    .connected-box { border: 2px solid green; padding: 1rem; border-radius: 8px; }
  `],
})
export class SpikeGuestComponent implements OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('scanCanvas') scanCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('answerCanvas') answerCanvas!: ElementRef<HTMLCanvasElement>;

  phase = signal<Phase>('idle');
  encodedSize = signal(0);
  scanStatus = signal('Scanning…');
  received = signal('(nothing yet)');
  errorMsg = signal('');

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;

  async startScanOffer(): Promise<void> {
    this.phase.set('scanning-offer');

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
      this.handleOffer(result.data);
      return;
    }
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private async handleOffer(encoded: string): Promise<void> {
    this.phase.set('creating-answer');
    try {
      const json = await decodeSdp(encoded);
      const offer = JSON.parse(json) as RTCSessionDescriptionInit;
      if (offer.type !== 'offer') throw new Error('Expected offer SDP, got ' + offer.type);

      this.pc = new RTCPeerConnection({ iceServers: [] });

      this.pc.ondatachannel = (ev: RTCDataChannelEvent) => {
        this.dc = ev.channel;
        this.dc.onopen = () => {
          this.phase.set('connected');
        };
        this.dc.onmessage = (msgEv: MessageEvent) => {
          this.received.set(String(msgEv.data));
        };
      };

      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete so the answer is one complete blob
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
      const answerEncoded = await encodeSdp(
        JSON.stringify({ type: 'answer', sdp: finalSdp }),
      );
      this.encodedSize.set(answerEncoded.length);
      this.phase.set('show-answer-qr');

      setTimeout(async () => {
        await QRCode.toCanvas(this.answerCanvas.nativeElement, answerEncoded, {
          errorCorrectionLevel: 'L',
          width: 300,
        });
        this.phase.set('connecting');
      }, 0);
    } catch (e) {
      this.fail('Bad offer QR: ' + String(e));
    }
  }

  sendPong(): void {
    this.dc?.send('pong from guest');
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
