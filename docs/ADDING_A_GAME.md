# Adding a Game

To add a new game to Switch-Back, you do not need to write any Angular code! Games are just simple HTML/JS files served statically in the `public/games/` directory.

## 1. Create your folder

Create a folder in `public/games/`, for example `public/games/my-game`.

Create an `index.html` inside it.

## 2. Include the SDK

In your game's `index.html`, include the Switch-Back SDK script:

```html
<script src="../../switchback-sdk.js"></script>
```

## 3. Initialize the SDK

In your script, listen for the `Switchback.onReady` callback. This gives you the initial state of the room, including the local player and the list of all connected players.

```javascript
Switchback.onReady((roomState) => {
  console.log("I am player:", roomState.player);
  console.log("All players:", roomState.players);
  
  // Start your game loop here!
});
```

## 4. Send and Receive Messages

To send a message to everyone else in the room over the WebRTC data channel:

```javascript
Switchback.send({
  type: 'player-moved',
  x: 100,
  y: 200
});
```

To receive messages from other players:

```javascript
Switchback.onMessage((msg) => {
  if (msg.data.type === 'player-moved') {
    console.log(`Player ${msg.from} moved to ${msg.data.x}, ${msg.data.y}`);
  }
});
```

## 5. Register the game

Finally, you can register the game in the `host-lobby.component.ts` (or `game-picker`) so the Host can launch it. 
(In the future, there will be an automatic script to scan the `public/games/` directory and build the index).
