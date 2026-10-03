# Switchback Architecture

```
src/app/
├── core/          Plain TypeScript, zero Angular imports
│   └── transport/ WebRTC, SDP codec
└── shell/         Angular UI (thin wrappers over core)
    ├── home/
    ├── host-lobby/
    ├── guest-join/
    └── game-frame/
```

## Folder structure

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
