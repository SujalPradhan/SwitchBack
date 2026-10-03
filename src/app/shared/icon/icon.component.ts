import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Stroke-only SVG icons, Lucide-compatible (24×24 viewBox).
 * Add new icons by extending ICON_PATHS below.
 */
const ICON_PATHS: Record<string, string> = {
  bolt: `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,

  phone: `<rect x="5" y="2" width="14" height="20" rx="2"/>
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>`,

  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,

  gamepad: `<rect x="2" y="6" width="20" height="12" rx="4"/>
    <line x1="6" y1="12" x2="10" y2="12"/>
    <line x1="8" y1="10" x2="8" y2="14"/>
    <circle cx="15" cy="13" r="0.5" fill="currentColor"/>
    <circle cx="18" cy="11" r="0.5" fill="currentColor"/>`,

  'check-circle': `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>`,

  'arrow-left': `<line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>`,

  scan: `<path d="M3 7V5a2 2 0 0 1 2-2h2"/>
    <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
    <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    <rect x="7" y="7" width="3" height="3"/>
    <rect x="14" y="7" width="3" height="3"/>
    <rect x="14" y="14" width="3" height="3"/>
    <rect x="7" y="14" width="3" height="3"/>`,

  'qr-code': `<rect x="3" y="3" width="7" height="7"/>
    <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
    <rect x="14" y="14" width="3" height="3"/>
    <path d="M14 17h3v3"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>`,

  'wifi-off': `<line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <circle cx="12" cy="20" r="0.5" fill="currentColor"/>`,

  'play-circle': `<circle cx="12" cy="12" r="10"/>
    <polygon points="10 8 16 12 10 16 10 8"/>`,

  plus: `<line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>`,

  'alert-circle': `<circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <circle cx="12" cy="16" r="0.5" fill="currentColor"/>`,
};

@Component({
  selector: 'sb-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [innerHTML]="safeHtml()"></span>`,
  styles: [`:host { display: inline-flex; align-items: center; line-height: 0; }
            span { display: contents; }`],
})
export class SbIconComponent {
  readonly name = input.required<string>();
  readonly size = input(24);

  private sanitizer = inject(DomSanitizer);

  protected safeHtml = computed<SafeHtml>(() => {
    const paths = ICON_PATHS[this.name()] ?? '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="${this.size()}" height="${this.size()}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round">${paths}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
