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
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("*** DRY RUN -- will not book ***");

  try {
    await login(page);

    if (dryRun) {
      await findTeeTimes(page);
    } else {
      const booked = await selectDateAndBook(page);
      if (booked) {
        await notify("Tee time booked! Check the add-on logs for details.");
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
