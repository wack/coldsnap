export interface Screenshot {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly extension: string;
}

export interface ScreenshotRequest {
  readonly url: string;
  readonly siteName: string;
  /** Session cookie that lets the browser past the tenant's login page. */
  readonly cookie?: { readonly name: string; readonly value: string };
}

/** Captures the home page of a live tenant site for its dashboard card. */
export interface Screenshotter {
  capture(request: ScreenshotRequest): Promise<Screenshot>;
}

/**
 * Headless Chromium through Playwright. On Vercel the browser binary comes
 * from `@sparticuz/chromium`; locally set `CHROMIUM_EXECUTABLE_PATH`.
 */
export class ChromiumScreenshotter implements Screenshotter {
  async capture(request: ScreenshotRequest): Promise<Screenshot> {
    const { chromium } = await import("playwright-core");
    const local = process.env.CHROMIUM_EXECUTABLE_PATH;
    const serverless = local ? null : (await import("@sparticuz/chromium")).default;
    const browser = await chromium.launch({
      executablePath: local ?? (await serverless!.executablePath()),
      args: serverless?.args ?? [],
      headless: true,
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      if (request.cookie) {
        await context.addCookies([{ ...request.cookie, url: request.url }]);
      }
      const page = await context.newPage();
      await page.goto(request.url, { waitUntil: "networkidle", timeout: 45_000 });
      // Let a page-load reveal settle so the preview shows the finished hero.
      await page.waitForTimeout(1_500);
      const bytes = await page.screenshot({ type: "jpeg", quality: 82 });
      return { bytes: new Uint8Array(bytes), contentType: "image/jpeg", extension: "jpg" };
    } finally {
      await browser.close();
    }
  }
}

/**
 * Deterministic stand-in for tests and memory mode: a pixel-art placeholder
 * card with the site's name, rendered as SVG.
 */
export class PlaceholderScreenshotter implements Screenshotter {
  async capture(request: ScreenshotRequest): Promise<Screenshot> {
    const name = escapeXml(request.siteName);
    const host = escapeXml(new URL(request.url).host);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" shape-rendering="crispEdges">
  <rect width="320" height="200" fill="#0d0221"/>
  <g fill="#2b0f54">${Array.from({ length: 10 }, (_, i) => `<rect x="0" y="${i * 20 + 10}" width="320" height="2"/>`).join("")}</g>
  <rect x="16" y="16" width="288" height="168" fill="none" stroke="#ff2a6d" stroke-width="4"/>
  <rect x="24" y="24" width="72" height="8" fill="#05d9e8"/>
  <text x="160" y="104" text-anchor="middle" font-family="monospace" font-size="18" fill="#f8f8f2">${name}</text>
  <text x="160" y="132" text-anchor="middle" font-family="monospace" font-size="10" fill="#05d9e8">${host}</text>
</svg>`;
    return {
      bytes: new TextEncoder().encode(svg),
      contentType: "image/svg+xml",
      extension: "svg",
    };
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
