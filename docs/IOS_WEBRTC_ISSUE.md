# Why Switch-Back's Local WebRTC Doesn't Work on iOS (Yet)

Currently, Switch-Back works flawlessly between Android devices and laptops, but connecting an iPhone to the local WebRTC room fails. This is a known limitation caused by Apple's strict privacy policies regarding local network routing.

## The Core Issue: mDNS and Local IP Hiding

To establish a Peer-to-Peer connection without an internet server, WebRTC needs to know the **Local IP Addresses** (e.g., `192.168.43.5`) of the phones on the hotspot so they can route traffic directly to each other.

To prevent malicious websites from scanning local networks and tracking users, Apple (WebKit/Safari) hides the real Local IP address. Instead, iOS generates a randomized, temporary `.local` address using a protocol called **mDNS** (Multicast DNS).

1. iOS Safari says: *"I won't give you my IP, but you can reach me at `3f8a9b21-4c...local`."*
2. This works perfectly on home Wi-Fi networks (routers support mDNS).
3. **However, Mobile Hotspots block mDNS traffic.** When an Android phone is acting as the hotspot, it does not route multicast packets between connected devices.

Because the hotspot drops the mDNS packets, and iOS refuses to share its real local IP, the devices simply cannot "find" each other on the network. The connection times out.

## How do we fix it?

1. **Wait for Apple:** WebKit developers are constantly tweaking these privacy restrictions. In the future, PWAs added to the iOS homescreen may be granted exemptions to bypass mDNS masking.
2. **Use a portable travel router:** If players connect to a cheap, battery-powered travel router instead of a phone's mobile hotspot, mDNS packets will route correctly, and iPhones will instantly connect.
3. **The Bluetooth Alternative:** Web Bluetooth API is expanding. In the future, we may be able to negotiate the WebRTC handshake over Bluetooth instead of QR codes, bypassing the Wi-Fi local routing entirely.
