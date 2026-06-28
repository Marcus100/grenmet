import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PDF_BASE_URL || "http://127.0.0.1:3001";
const route = process.argv[2] || "/wxproducts/pdf/morning";
const output = process.argv[3] || "artifacts/wxproducts/pdf/morning.pdf";

if (route.charAt(0) !== "/") {
  throw new Error("First argument must be a route starting with /");
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "America/Grenada",
  });

  // The PDF route lives under admin's auth gate. Supply a session cookie via
  // PDF_SESSION_COOKIE (value of the SESSION_COOKIE_NAME cookie) so the headless
  // browser is authenticated. Name overridable via PDF_SESSION_COOKIE_NAME.
  const sessionCookie = process.env.PDF_SESSION_COOKIE;
  if (sessionCookie) {
    const { hostname } = new URL(baseUrl);
    await context.addCookies([
      {
        name: process.env.PDF_SESSION_COOKIE_NAME || "grenmet_session",
        value: sessionCookie,
        domain: hostname,
        path: "/",
      },
    ]);
  }

  const page = await context.newPage();
  const url = new URL(route, baseUrl).toString();

  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.emulateMedia({ media: "print" });

  const absoluteOutput = resolve(output);
  await mkdir(dirname(absoluteOutput), { recursive: true });

  await page.pdf({
    path: absoluteOutput,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: {
      top: "0mm",
      right: "0mm",
      bottom: "0mm",
      left: "0mm",
    },
  });

  console.log(`PDF generated at ${absoluteOutput}`);
} finally {
  await browser.close();
}
