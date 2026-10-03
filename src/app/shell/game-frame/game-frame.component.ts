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
      const last = segments[segments.length - 1] ?? 'Game';
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
    effect(() => {
      const msg = this.room.lastMessage();
      if (msg) this.post({ type: 'sb:message', from: msg.from, data: msg.data });
    });
  }

  ngOnInit(): void {
    const url = this.route.snapshot.queryParamMap.get('url') ?? '';
    this.gameUrl.set(url);
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
  }

  goBack(): void {
    const route = this.room.isHost() ? '/host' : '/join';
    this.router.navigate([route]);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private onFrameMessage(ev: MessageEvent): void {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'sb:ready':
        // Game loaded and SDK is ready — send initial state.
        this.post({
          type: 'sb:init',
          player: this.room.localPlayer(),
          players: this.room.players(),
        });
        break;

      case 'sb:send':
        this.room.sendGameMessage(msg.data);
        break;
    }
  }

  private post(msg: object): void {
    const frame = this.frameRef?.nativeElement;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(msg, '*');
  }
}
