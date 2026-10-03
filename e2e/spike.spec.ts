import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the Switchback platform (Step 1 — real lobby UI).
 * Spike routes are preserved for regression.
 */

test.describe('Home page', () => {
  test('shows app name and both action cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Switch-Back');
    await expect(page.locator('#host-link')).toBeVisible();
    await expect(page.locator('#guest-link')).toBeVisible();
  });
});

test.describe('Host lobby (/host)', () => {
  test('loads with Start Room button', async ({ page }) => {
    await page.goto('/host');
    await expect(page.locator('h1')).toHaveText('Switch-Back');
    await expect(page.locator('.role-pill')).toHaveText('Host');
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  test('clicking Start Room produces a QR code', async ({ page }) => {
    await page.goto('/host');
    await page.locator('#start-btn').click();
    await expect(page.locator('#offer-qr')).toBeVisible({ timeout: 15_000 });
    // The "add player" scan button should also appear
    await expect(page.locator('#scan-answer-btn')).toBeVisible();
  });
});

test.describe('Guest join (/join)', () => {
  test('loads with Scan to Join button', async ({ page }) => {
    await page.goto('/join');
    await expect(page.locator('h1')).toHaveText('Switch-Back');
    await expect(page.locator('.role-pill')).toHaveText('Player');
    await expect(page.locator('#scan-offer-btn')).toBeVisible();
  });
});

test.describe('Spike regression (/spike/host, /spike/guest)', () => {
  test('spike host still loads', async ({ page }) => {
    await page.goto('/spike/host');
    await expect(page.locator('.role-badge')).toHaveText('Host');
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  test('spike guest still loads', async ({ page }) => {
    await page.goto('/spike/guest');
    await expect(page.locator('.role-badge')).toHaveText('Guest');
    await expect(page.locator('#scan-offer-btn')).toBeVisible();
  });
});

test.describe('SDP codec', () => {
  test('encode/decode round-trip in browser', async ({ page }) => {
    await page.goto('/host');
    const result = await page.evaluate(async () => {
      async function streamToUint8(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
        const chunks: Uint8Array[] = [];
        const r = s.getReader();
        for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total); let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        return out;
      }
      const input = 'v=0\r\no=- 99 2 IN IP4 127.0.0.1\r\ns=-\r\n';
      const encoded = new TextEncoder().encode(input);
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter(); w.write(encoded); w.close();
      const comp = await streamToUint8(cs.readable as ReadableStream<Uint8Array>);
      const b64 = btoa(String.fromCharCode(...comp)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const back = b64.replace(/-/g,'+').replace(/_/g,'/');
      const pad = (4 - back.length % 4) % 4;
      const bin = atob(back + '='.repeat(pad));
      const bytes = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      const ds = new DecompressionStream('deflate-raw');
      const w2 = ds.writable.getWriter(); w2.write(bytes); w2.close();
      const dec = await streamToUint8(ds.readable as ReadableStream<Uint8Array>);
      return new TextDecoder().decode(dec);
    });
    expect(result).toBe('v=0\r\no=- 99 2 IN IP4 127.0.0.1\r\ns=-\r\n');
  });
});
