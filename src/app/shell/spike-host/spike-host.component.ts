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
  templateUrl: './spike-host.component.html',
  styleUrl: './spike-host.component.css',
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
