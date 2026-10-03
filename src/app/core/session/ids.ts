/**
 * core/session/ids.ts
 *
 * Stable, random ID generation for rooms and players.
 * No Angular imports — pure TypeScript.
 */

/**
 * Generate a URL-safe random ID of `byteLength` bytes.
 * Uses crypto.getRandomValues for unpredictability.
 */
export function randomId(byteLength = 12): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  // base64url, no padding
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a human-readable display name from a stable seed.
 * Used as a default when the user hasn't chosen a name yet.
 */
const ADJECTIVES = [
  'Swift', 'Bold', 'Quiet', 'Bright', 'Calm',
  'Sharp', 'Lucky', 'Keen', 'Cool', 'Brave',
];
const NOUNS = [
  'Fox', 'Hawk', 'Wolf', 'Bear', 'Lynx',
  'Stag', 'Hare', 'Crow', 'Owl', 'Elk',
];

export function defaultDisplayName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}
