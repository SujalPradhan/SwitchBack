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

## Step 0 — Spike

The current build contains the connection spike (`/spike/host`, `/spike/guest`) to verify end-to-end WebRTC over a hotspot. The full platform will be built after spike results are confirmed on real devices.

### Spike URLs

| Role | URL |
|---|---|
| Home | `http://<server>/` |
| Host | `http://<server>/spike/host` |
| Guest | `http://<server>/spike/guest` |

### Spike flow

1. Phone A opens `/spike/host` → taps **Start Room** → QR code appears
2. Phone B opens `/spike/guest` → taps **Scan host QR code** → camera opens → scans Phone A's QR → answer QR appears
3. Phone A taps **I'm ready — scan guest's answer** → camera opens → scans Phone B's QR
4. Both phones show **✓ Connected!** and can exchange ping/pong messages

## Real-device tests (manual checklist)

Automated tests prove logic; they cannot test a real hotspot. Run this checklist on real Android phones.

**Setup:**
- [ ] Phone A (host) creates a mobile hotspot
- [ ] Phone B (guest) connects to Phone A's hotspot
- [ ] Your Mac also connects to Phone A's hotspot (or serve from the phone — complex)
- [ ] Both phones open `http://<mac-ip>:4200/` in Chrome

> Enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on both phones  
> Add `http://<mac-ip>:4200`, relaunch Chrome

**Spike flow:**
- [ ] Phone A opens `/spike/host`, taps Start Room
  - [ ] QR code appears — note the "Encoded size: N chars" value
  - [ ] Open `chrome://webrtc-internals/` on Phone A — look at `a=candidate` lines
  - [ ] Do candidates show real IPs (e.g. `192.168.x.x`) or `.local` mDNS names?
- [ ] Phone B opens `/spike/guest`, taps Scan host QR code
  - [ ] Camera opens and scans Phone A's QR
  - [ ] Answer QR code appears
- [ ] Phone A taps "I'm ready — scan guest's answer"
  - [ ] Camera opens and scans Phone B's answer QR
- [ ] **Both phones show ✓ Connected!**
- [ ] Phone A taps "Send ping to guest" → Phone B shows "ping from host"
- [ ] Phone B taps "Send pong to host" → Phone A shows "pong from guest"

**If connection fails:**
- [ ] Open `chrome://webrtc-internals/` on both phones
- [ ] Note ICE connection state (`checking` / `failed` / `disconnected`)
- [ ] Note candidate types listed
- [ ] If `.local` mDNS names are the only candidates: try disabling `chrome://flags/#enable-webrtc-hide-local-ips-with-mdns` on both phones, relaunch, retry

**Remote debugging from Mac:**
- Connect the Android phone via USB
- Open `chrome://inspect/#devices` on your Mac
- Inspect the phone's Chrome tabs directly from Mac DevTools

**If everything passes:**
- [ ] Airplane mode test: phone connects to game, switches to airplane mode, wakes up — does it reconnect?
- [ ] Host drop test: host phone kills the browser tab — does guest show a "host disconnected" state?
- [ ] PWA install: add to home screen on Android Chrome, launch from home screen in airplane mode

## Architecture

```
src/app/
├── core/          Plain TypeScript, zero Angular imports
│   └── transport/ WebRTC, SDP codec
└── shell/         Angular UI (thin wrappers over core)
    ├── home/
    ├── spike-host/
    └── spike-guest/
```

## Folder structure (planned)

```
switchback/
├── src/app/
│   ├── core/                     Plain TS, no Angular
│   │   ├── transport/            WebRTC, QR/SDP codec
│   │   ├── protocol/             Envelope + validation
│   │   └── session/              Players, stable ids, reconnect
│   └── shell/                    Angular UI
│       ├── home/  host-lobby/  guest-join/
│       ├── game-picker/
│       ├── game-frame/
│       └── offline-badge/
├── public/
│   ├── switchback-sdk.js
│   └── games/
│       ├── _template/
│       ├── hello-room/
│       └── trivia/
├── scripts/
│   ├── build-game-index.mjs
│   └── build-trivia-pack.mjs
├── e2e/                          Playwright tests
├── docs/ADDING_A_GAME.md
├── vercel.json
└── playwright.config.ts
```
