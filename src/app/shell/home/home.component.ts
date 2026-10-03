import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="home">
      <h1>Switchback</h1>
      <p class="subtitle">Multiplayer for nearby phones — no internet needed.</p>

      <section class="spike-section">
        <h2>Step 0 — Connection Spike</h2>
        <p>
          Two pages to verify WebRTC peer-to-peer over a local hotspot with
          QR-code SDP exchange. Open Host on one device, Guest on another.
        </p>
        <div class="spike-links">
          <a id="host-link" [routerLink]="['/spike/host']" class="btn">Host</a>
          <a id="guest-link" [routerLink]="['/spike/guest']" class="btn">Guest</a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .home {
      padding: 2rem;
      font-family: system-ui, sans-serif;
      max-width: 560px;
      margin: auto;
    }
    h1 { font-size: 2rem; margin-bottom: 0.25rem; }
    .subtitle { color: #555; margin-bottom: 2rem; }
    h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { line-height: 1.6; }
    .spike-section { border: 1px solid #ccc; border-radius: 8px; padding: 1.25rem; }
    .spike-links { display: flex; gap: 1rem; margin-top: 1rem; }
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: #a6d8d4;
      color: #2a3434;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
    }
    .btn:hover { background: #8eaf9d; }
  `],
})
export class HomeComponent {}
