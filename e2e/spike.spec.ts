import { test, expect } from '@playwright/test';

/**
 * Spike smoke test — verifies the three pages load and show the right
 * initial elements. Full WebRTC e2e tests will be added after the
 * real-device spike confirms which ICE/mDNS configuration to use.
 */

test.describe('Spike pages', () => {
  test('home page shows Host and Guest links', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Switchback');
    await expect(page.locator('#host-link')).toBeVisible();
    await expect(page.locator('#guest-link')).toBeVisible();
  });

  test('host page loads with Start Room button', async ({ page }) => {
    await page.goto('/spike/host');
    await expect(page.locator('h1')).toHaveText('Switchback');
    await expect(page.locator('.role-badge')).toHaveText('Host');
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  test('guest page loads with Scan button', async ({ page }) => {
    await page.goto('/spike/guest');
    await expect(page.locator('h1')).toHaveText('Switchback');
    await expect(page.locator('.role-badge')).toHaveText('Guest');
    await expect(page.locator('#scan-offer-btn')).toBeVisible();
  });

  test('host: clicking Start Room begins ICE gathering', async ({ page }) => {
    await page.goto('/spike/host');
    await page.locator('#start-btn').click();
    // After clicking, the "gathering" or "show-offer-qr" phase is active.
    // We wait for the QR canvas to appear (ICE gathering completed).
    await expect(page.locator('#offer-qr')).toBeVisible({ timeout: 15_000 });
    // Verify encoded size is shown and non-zero
    const sizeText = await page.locator('.size-note').textContent();
    expect(sizeText).toMatch(/\d+ chars/);
    const size = parseInt(sizeText!.match(/(\d+) chars/)![1], 10);
    expect(size).toBeGreaterThan(50);
    expect(size).toBeLessThan(2000); // Well within one QR code
  });

  test('SDP codec: encode and decode round-trip in browser context', async ({ page }) => {
    await page.goto('/spike/host');
    // Run the codec directly in the browser to confirm it works there too
    const result = await page.evaluate(async () => {
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
        for (const c of chunks) { out.set(c, offset); offset += c.length; }
        return out;
      }
      const input = 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n';
      const encoded = new TextEncoder().encode(input);
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(encoded); w.close();
      const compressed = await streamToUint8Array(cs.readable as ReadableStream<Uint8Array>);
      const b64 = btoa(String.fromCharCode(...compressed))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const back = b64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = (4 - back.length % 4) % 4;
      const bin = atob(back + '='.repeat(pad));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ds = new DecompressionStream('deflate-raw');
      const w2 = ds.writable.getWriter();
      w2.write(bytes); w2.close();
      const dec = await streamToUint8Array(ds.readable as ReadableStream<Uint8Array>);
      return new TextDecoder().decode(dec);
    });
    expect(result).toBe('v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n');
  });
});
