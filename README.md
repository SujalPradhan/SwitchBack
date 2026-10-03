# Switchback

Offline-first PWA platform that gives any web game a shared room of nearby phones over a hotspot, with no internet. One phone is the **host**, the others are **guests**. Phones connect directly through WebRTC data channels — no backend, no server.

## Requirements

- Node.js 22.12.0 or later (as shipped; Angular 19 is installed)
- npm 10+
- Chrome / Chromium for development and testing

## Install

```bash
npm install
```

## Run locally

```bash
npm start          # alias for: npx ng serve --port 4200 --host 0.0.0.0
```

Open `http://localhost:4200/` in Chrome.

> **Camera access on a LAN IP requires HTTPS or localhost.**  
> For real-device testing on a hotspot, either:  
> - Use `localhost` on the Mac (only tests one device), or  
> - Enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on each phone, add `http://<your-mac-ip>:4200`, relaunch Chrome.

## Build (production)

```bash
npx ng build
```

Output: `dist/switchback/browser/`

## Deploy to Vercel

1. Push to GitHub (or connect the repo to Vercel directly).
2. In Vercel project settings:
   - **Framework preset:** Other
   - **Build command:** `npx ng build`
   - **Output directory:** `dist/switchback/browser`
3. `vercel.json` is already configured with:
   - SPA fallback rewrite (`/*` → `/index.html`)
   - No-cache headers for `ngsw-worker.js` and `ngsw.json`

Or deploy manually:

```bash
npx vercel --prod
```

## Run tests

### Unit tests (Karma)

```bash
npx ng test --watch=false
```

### End-to-end tests (Playwright, Chromium)

E2E tests run against the **production build**. Build first, then run:

```bash
npx ng build
npx playwright test
```

View the HTML report:

```bash
npx playwright show-report
```

Chromium flags used (configured in `playwright.config.ts`):

| Flag | Purpose |
|---|---|
| `--disable-features=WebRtcHideLocalIpsWithMdns` | Expose real local IPs in ICE candidates for loopback WebRTC |
| `--use-fake-device-for-media-stream` | Synthetic camera — no physical camera needed in CI |
| `--use-fake-ui-for-media-stream` | Auto-grant camera permission |

> **Note:** `--disable-features=WebRtcHideLocalIpsWithMdns` is needed for loopback connections on the same machine. On real devices over a hotspot, mDNS behaviour depends on the hotspot's multicast forwarding. See "Real-device tests" below.

## User Flow

1. **Host** opens the app and taps **Start a Room**. A QR code appears.
2. **Guests** open the app and tap **Join a Room**, which opens their camera.
3. Guests scan the Host's QR code.
4. Host selects a game (e.g. Party Trivia or Hello Room) and launches it for everyone.
5. All phones seamlessly sync via WebRTC and play together, entirely offline.

## Real-device tests

Automated tests prove logic; they cannot test a real hotspot. Run this checklist on real Android phones.

**Setup:**
- [ ] Phone A (host) creates a mobile hotspot
- [ ] Phone B (guest) connects to Phone A's hotspot
- [ ] Both phones navigate to the live deployment URL

**Test flow:**
- [ ] Connect host and guest via QR scanning
- [ ] Verify both phones show **✓ Connected**
- [ ] Host launches a game, verify guest is automatically routed into the game
- [ ] Airplane mode test: phone connects to game, switches to airplane mode, wakes up — does it reconnect?
- [ ] PWA install: add to home screen on Android Chrome, launch from home screen in airplane mode

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for folder structure and core architectural patterns.
