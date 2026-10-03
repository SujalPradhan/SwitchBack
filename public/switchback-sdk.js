/**
 * switchback-sdk.js
 *
 * Include this script in any Switchback game:
 *   <script src="/switchback-sdk.js"></script>
 *
 * Then use the global `Switchback` object:
 *
 *   Switchback.onReady(({ player, players }) => { ... });
 *   Switchback.onPlayers((players) => { ... });
 *   Switchback.onMessage((fromPlayerId, data) => { ... });
 *   Switchback.send({ myKey: 'myValue' });
 *   Switchback.getPlayer();   // returns this player's PlayerInfo
 */
(function () {
  'use strict';

  const _handlers = { ready: [], players: [], message: [] };
  let _localPlayer = null;
  let _ready = false;

  function _emit(event, ...args) {
    (_handlers[event] || []).forEach((fn) => {
      try { fn(...args); } catch (e) { console.error('[Switchback SDK] handler error', e); }
    });
  }

  // ── Receive messages from the platform ──────────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (!msg.type.startsWith('sb:')) return;

    switch (msg.type) {
      case 'sb:init':
        _localPlayer = msg.player;
        _ready = true;
        _emit('ready', { player: msg.player, players: msg.players });
        break;

      case 'sb:players':
        _emit('players', msg.players);
        break;

      case 'sb:message':
        _emit('message', msg.from, msg.data);
        break;
    }
  });

  // ── Tell the platform we are ready ──────────────────────────────────────────

  // Use a small delay so the game's onReady handler can be registered first.
  setTimeout(() => {
    window.parent.postMessage({ type: 'sb:ready' }, '*');
  }, 0);

  // ── Public API ───────────────────────────────────────────────────────────────

  window.Switchback = {
    /**
     * Called once when the platform sends the initial player list.
     * @param {function({ player: PlayerInfo, players: PlayerInfo[] }): void} fn
     */
    onReady(fn) {
      _handlers.ready.push(fn);
      // If already initialised (e.g. hot-reload), fire immediately.
      if (_ready && _localPlayer) fn({ player: _localPlayer, players: [] });
    },

    /**
     * Called whenever the player list changes (someone joins or leaves).
     * @param {function(PlayerInfo[]): void} fn
     */
    onPlayers(fn) { _handlers.players.push(fn); },

    /**
     * Called when another player sends a game message.
     * @param {function(string, any): void} fn  (fromPlayerId, data)
     */
    onMessage(fn) { _handlers.message.push(fn); },

    /**
     * Send a game message to all other players.
     * The platform broadcasts it via the data channel.
     * @param {any} data - Any JSON-serialisable value.
     */
    send(data) {
      window.parent.postMessage({ type: 'sb:send', data }, '*');
    },

    /** Returns this player's PlayerInfo, or null before onReady fires. */
    getPlayer() { return _localPlayer; },
  };
})();
