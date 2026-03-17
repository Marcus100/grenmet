import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PDF_BASE_URL || "http://127.0.0.1:3005";
const route = process.argv[2] || "/pdf/morning";
const output = process.argv[3] || "artifacts/pdf/morning.pdf";

if (route.charAt(0) !== "/") {
  throw new Error("First argument must be a route starting with /");
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    locale: "en-GB",
    timezoneId: "America/Grenada",
  });

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

  console.log("PDF generated at " + absoluteOutput);
} finally {
  await browser.close();
}
