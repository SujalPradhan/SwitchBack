import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RoomService } from '../../core/session/room.service';
import { SbIconComponent } from '../../shared/icon/icon.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-game-frame',
  standalone: true,
  imports: [SbIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-frame.component.html',
  styleUrl: './game-frame.component.css',
})
export class GameFrameComponent implements OnInit, OnDestroy {
  @ViewChild('gameFrame') frameRef!: ElementRef<HTMLIFrameElement>;

  readonly room = inject(RoomService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  readonly gameUrl = signal('');

  readonly gameName = computed(() => {
    try {
      const url = new URL(this.gameUrl(), window.location.href);
      // Use the last path segment minus extension as a display name
      const segments = url.pathname.split('/').filter(Boolean);
      let last = segments[segments.length - 1] ?? 'Game';
      if (last.startsWith('index') && segments.length > 1) {
        last = segments[segments.length - 2];
      }
      return last.replace(/\.html?$/, '').replace(/-/g, ' ');
    } catch {
      return 'Game';
    }
  });

  readonly safeSrc = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.gameUrl()),
  );

  private messageHandler = (ev: MessageEvent) => this.onFrameMessage(ev);

  constructor() {
    // Push player-list updates into the iframe whenever the signal changes.
    effect(() => {
      const players = this.room.players();
      this.post({ type: 'sb:players', players });
    });

    // Push incoming game messages into the iframe.
    this.room.gameMessage$
      .pipe(takeUntilDestroyed())
      .subscribe((msg) => {
        this.post({ type: 'sb:message', from: msg.from, data: msg.data });
      });

    // Guest: when the host ends the game, navigate back to the lobby.
    this.room.returnToLobby$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.router.navigate(['/join']);
      });
  }

  ngOnInit(): void {
    const url = this.route.snapshot.queryParamMap.get('url') ?? '';
    this.gameUrl.set(url);
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
    this.isFrameReady = false;
    this.messageQueue = [];
  }

  goBack(): void {
    if (this.room.isHost()) {
      // Broadcast game-end to all guests so they return to their lobby too
      this.room.endGame();
      this.router.navigate(['/host']);
    } else {
      this.router.navigate(['/join']);
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private isFrameReady = false;
  private messageQueue: object[] = [];

  private onFrameMessage(ev: MessageEvent): void {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'sb:ready':
        this.isFrameReady = true;
        // Game loaded and SDK is ready — send initial state.
        this.post({
          type: 'sb:init',
          player: this.room.localPlayer(),
          players: this.room.players(),
        });
        
        // Flush any queued messages
        while (this.messageQueue.length > 0) {
          this.post(this.messageQueue.shift()!);
        }
        break;

      case 'sb:send':
        this.room.sendGameMessage(msg.data);
        break;
    }
  }

  private post(msg: object): void {
    // If not ready, and it's a message, queue it
    if (!this.isFrameReady && (msg as any).type === 'sb:message') {
      this.messageQueue.push(msg);
      return;
    }
    const frame = this.frameRef?.nativeElement;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(msg, '*');
  }
}
