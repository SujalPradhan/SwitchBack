import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { SbIconComponent } from './shared/icon/icon.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SbIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly updateAvailable = signal(false);
  private swUpdate = inject(SwUpdate, { optional: true });

  constructor() {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.updateAvailable.set(true);
        }
      });
    }
  }

  async applyUpdate(): Promise<void> {
    if (this.swUpdate) {
      await this.swUpdate.activateUpdate();
    }
    window.location.reload();
  }

  dismissUpdate(): void {
    this.updateAvailable.set(false);
  }
}
