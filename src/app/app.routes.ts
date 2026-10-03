import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'host',
    loadComponent: () =>
      import('./shell/host-lobby/host-lobby.component').then(
        (m) => m.HostLobbyComponent,
      ),
  },
  {
    path: 'join',
    loadComponent: () =>
      import('./shell/guest-join/guest-join.component').then(
        (m) => m.GuestJoinComponent,
      ),
  },
  {
    path: 'play',
    loadComponent: () =>
      import('./shell/game-frame/game-frame.component').then(
        (m) => m.GameFrameComponent,
      ),
  },
  // Keep spike routes for reference during development
  {
    path: 'spike/host',
    loadComponent: () =>
      import('./shell/spike-host/spike-host.component').then(
        (m) => m.SpikeHostComponent,
      ),
  },
  {
    path: 'spike/guest',
    loadComponent: () =>
      import('./shell/spike-guest/spike-guest.component').then(
        (m) => m.SpikeGuestComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
