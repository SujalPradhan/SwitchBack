# Switchback

Offline-first PWA platform that gives any web game a shared room of nearby phones over a hotspot, with no internet. One phone is the **host**, the others are **guests**. Phones connect directly through WebRTC data channels - no backend, no server.

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

The research story is available at `http://localhost:4200/story`.

The development server does not register the service worker, so it cannot be
installed as a PWA. To test installation locally, serve the production build:

```bash
npm run start:pwa
```

Then open `http://localhost:4200/` in Chrome and use the browser's install
option. Deployments must serve the contents of `dist/switchback/browser` over
HTTPS (or from `localhost` during local testing).

> **Camera access on a LAN IP requires HTTPS or localhost.**  
> For real-device testing on a hotspot, either:  
> - Use `localhost` on the Mac (only tests one device), or  
> - Enable `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on each phone, add `http://<your-mac-ip>:4200`, relaunch Chrome.

## User Flow

1. **Host** opens the app and taps **Start a Room**. A QR code appears.
2. **Guests** open the app and tap **Join a Room**, which opens their camera.
3. Guests scan the Host's QR code.
4. Host selects a game (e.g. Party Trivia or Hello Room) and launches it for everyone.
5. All phones seamlessly sync via WebRTC and play together, entirely offline.

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for folder structure and core architectural patterns.

## GitHub Pages

The `main` branch includes a GitHub Actions workflow that builds and deploys the story to Pages at `/SwitchBack/story`. Before the first deployment, open [Settings > Pages](https://github.com/SujalPradhan/SwitchBack/settings/pages) and set **Source** to **GitHub Actions**. Without this repository-level setting, `actions/deploy-pages@v4` returns `404 Not Found` even when the build artifact is valid. The workflow assumes the repository is named `SwitchBack`; update `build:pages` in `package.json` if the repository name changes.
