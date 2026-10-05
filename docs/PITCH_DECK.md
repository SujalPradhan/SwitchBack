# Switch-Back: The "No Internet" Multiplayer Platform

## The Problem
You're camping, on a road trip, or waiting in a long line. You want to play a multiplayer party game with your friends, but **you have no cell service or Wi-Fi**.

## The Solution
**Switch-Back** is a completely offline-first web platform. It allows anyone to host a local multiplayer room using just their phone's mobile hotspot. 

- **No app store downloads:** It's a Progressive Web App (PWA). Load it once when you have internet, and it lives on your phone forever.
- **No servers:** Phones connect directly to each other using Peer-to-Peer WebRTC.
- **Instant joining:** Guests don't even need to type a URL. They just point their camera at the Host's QR code.

## The Magic (How it Works)
1. **The Handshake:** The host generates a WebRTC connection offer, compressed into a QR code. The guest scans it, generates an answer, and shows their own QR code back to the host.
2. **The Connection:** The phones establish a direct, encrypted data channel over the local Wi-Fi hotspot. 
3. **The Gameplay:** The host launches a game (like Party Trivia). The game runs locally in the browser, passing data instantly between phones. Zero lag, zero data usage.

---

## 💡 How to Demo Offline Capabilities in an Online Meeting

Since you need internet on your computer to be in the video call, demonstrating a "no internet" app requires a clever setup. Here is the best way to prove it works offline during a pitch:

**The "Network Tab" Proof (Easiest & Most Convincing)**
1. **Setup:** Open Switch-Back on your computer (Host) and share your screen. Hold up your physical phone (Guest) to the webcam.
2. **The Connection:** Scan the QR code on your screen using your phone to establish the connection.
3. **The Proof:** Open the Chrome Developer Tools on your screen share and navigate to the **Network** tab. 
4. **The Mic Drop:** Start playing the game. As you tap buttons on your phone and the screen updates instantly, point out to the investors that the Network tab is **completely empty**. There are absolutely zero HTTP requests being made. Explain that the data is flowing directly from the phone to the computer's Wi-Fi card via WebRTC Data Channels, bypassing the internet entirely.
