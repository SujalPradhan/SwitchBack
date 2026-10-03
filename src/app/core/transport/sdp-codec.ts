/**
 * SDP Codec
 *
 * Compresses an SDP string with deflate-raw via CompressionStream, then
 * encodes it as base64url (URL-safe, no padding) for use in QR codes.
 *
 * Decoder reverses the process. Both functions are async because
 * CompressionStream operates on ReadableStream.
 *
 * No Angular imports — this file is plain TypeScript.
 */

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  // Re-add padding
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes an SDP blob to a compact base64url string suitable for a QR code.
 * Uses deflate-raw compression.
 */
export async function encodeSdp(sdp: string): Promise<string> {
  const encoded = new TextEncoder().encode(sdp);
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(encoded);
  writer.close();
  const compressed = await streamToUint8Array(cs.readable);
  return toBase64Url(compressed);
}

/**
 * Decodes a base64url string back to an SDP blob.
 * Throws if decompression fails (corrupt input).
 */
export async function decodeSdp(encoded: string): Promise<string> {
  let compressed: Uint8Array;
  try {
    compressed = fromBase64Url(encoded);
  } catch {
    throw new Error('SDP decode: invalid base64url input');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();
  let decompressed: Uint8Array;
  try {
    decompressed = await streamToUint8Array(ds.readable);
  } catch {
    throw new Error('SDP decode: decompression failed (corrupt data)');
  }
  return new TextDecoder().decode(decompressed);
}
