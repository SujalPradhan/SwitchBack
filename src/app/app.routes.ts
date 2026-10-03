import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/home/home.component').then((m) => m.HomeComponent),
  },
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
  {
    path: '**',
    redirectTo: '',
  },
];
