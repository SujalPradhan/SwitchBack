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
  templateUrl: './spike-guest.component.html',
  styleUrl: './spike-guest.component.css',
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
  private wakeLock: WakeLockSentinel | null = null;

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
          this.releaseWakeLock();
          this.phase.set('connected');
        };
        this.dc.onmessage = (msgEv: MessageEvent) => {
          this.received.set(String(msgEv.data));
        };
      };

      await this.pc.setRemoteDescription(offer);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete — answer is one complete blob
      await new Promise<void>((resolve) => {
        if (this.pc!.iceGatheringState === 'complete') { resolve(); return; }
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

      // Request wake lock so screen stays bright while host scans
      this.acquireWakeLock();

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

  private async acquireWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake lock not critical — ignore
    }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release();
    this.wakeLock = null;
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
    this.releaseWakeLock();
    this.errorMsg.set(msg);
    this.phase.set('error');
  }

  reset(): void {
    this.stopCamera();
    this.releaseWakeLock();
    this.pc?.close();
    this.pc = null;
    this.dc = null;
    this.phase.set('idle');
    this.errorMsg.set('');
    this.received.set('(nothing yet)');
  }

  ngOnDestroy(): void {
    this.stopCamera();
    this.releaseWakeLock();
    this.pc?.close();
  }
}
