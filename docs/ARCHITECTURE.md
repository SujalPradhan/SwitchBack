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

## Data Flow (High Level)

1. **Connection (WebRTC & QR Codes):**
   - **Host** generates a WebRTC offer, compresses it via an SDP codec, and displays it as a QR code.
   - **Guest** scans the QR code, unpacks the offer, generates an answer, compresses it into an answer QR code.
   - **Host** scans the Guest's answer QR to finalize a peer-to-peer WebRTC Data Channel connection.

2. **Game Launch:**
   - The **Host** selects a game (e.g., Trivia).
   - The Angular `RoomService` broadcasts a `game-start` message over the WebRTC data channel with the game's URL.
   - All **Guests** receive this message, and both Host and Guests navigate to the `/play` route.

3. **In-Game Communication:**
   - The Angular shell loads the game inside a sandboxed `<iframe>`.
   - The game code (pure HTML/JS) uses the `Switchback.send()` API provided by `switchback-sdk.js`.
   - The SDK sends the message up to the parent window (Angular `GameFrameComponent`) using `postMessage`.
   - The Angular `GameFrameComponent` intercepts the message and passes it to `RoomService`.
   - `RoomService` sends the message across the WebRTC Data Channel to the peers.
   - On the receiving end, the peer's `RoomService` pushes the message to their `GameFrameComponent`, which pushes it down into the game `<iframe>` via `postMessage`.
   - The game processes the message using `Switchback.onMessage()`.
