import cron from "node-cron";
import { chromium } from "playwright";
import { config, validateConfig } from "./config.js";
import { login } from "./login.js";
import { selectDateAndBook, findTeeTimes } from "./book.js";
import { notify } from "./notify.js";
import { mkdirSync } from "fs";

async function run() {
  console.log(`[${new Date().toISOString()}] Starting booking attempt...`);

  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      ...(config.headless ? ["--disable-blink-features=AutomationControlled"] : []),
    ],
    channel: config.headless ? "chromium" : undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Hide automation signals — CPS checks multiple properties
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    // Fake plugin array (headless Chrome has 0 plugins)
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const arr = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ];
        (arr as any).namedItem = (n: string) => arr.find((p) => p.name === n) ?? null;
        (arr as any).refresh = () => {};
        return arr;
      },
    });

    // Fake languages
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });

    // Fake chrome object (missing in headless)
    (window as any).chrome = {
      runtime: { onConnect: { addListener: () => {} }, onMessage: { addListener: () => {} } },
      loadTimes: () => ({}),
      csi: () => ({}),
    };

    // Fake permissions query to avoid "notification denied" fingerprint
    const origQuery = Permissions.prototype.query;
    Permissions.prototype.query = function (desc: any) {
      if (desc.name === "notifications") {
        return Promise.resolve({ state: "prompt", onchange: null } as PermissionStatus);
      }
      return origQuery.call(this, desc);
    };
  });

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("*** DRY RUN -- will not book ***");

  try {
    await login(page);

    if (dryRun) {
      await findTeeTimes(page);
    } else {
      const booking = await selectDateAndBook(page);
      if (booking) {
        await notify(
          `Booked ${booking.time} at ${booking.course} on ${booking.date} for ${booking.players} player(s).`
        );
      } else {
        console.log("No suitable tee time found this run.");
      }
    }
  } catch (err) {
    if (!config.isHa) {
      await page.screenshot({
        path: `${config.screenshotDir}/error.png`,
        fullPage: true,
      });
    }
    console.error("Error:", err);
    await notify(`Booking failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  validateConfig();
  if (!config.isHa) {
    mkdirSync(config.screenshotDir, { recursive: true });
  }

  // If run with --once flag, just run once and exit
  if (process.argv.includes("--once")) {
    await run();
    return;
  }

  // Otherwise schedule via cron
  console.log(`Scheduling booking attempts with cron: ${config.scheduleCron}`);
  await notify(`Golf Bot started. Schedule: ${config.scheduleCron}`);

  cron.schedule(config.scheduleCron, () => {
    run().catch(console.error);
  });

  // Also run immediately on startup
  await run();
}

main().catch(console.error);
