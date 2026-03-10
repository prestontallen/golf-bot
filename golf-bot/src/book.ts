import { Page, Locator } from "playwright";
import { config } from "./config.js";

async function screenshot(page: Page, name: string): Promise<void> {
  if (config.isHa) return;
  const path = `${config.screenshotDir}/${name}`;
  await page.screenshot({ path, fullPage: true });
  console.log(`Screenshot: ${name}`);
}

function getTargetDate(): Date {
  const target = new Date();
  target.setDate(target.getDate() + config.booking.daysAhead);
  return target;
}

interface TeeTime {
  time: string;
  time24: string;
  course: string;
  holes: string;
  players: string;
  buttonText: string;
  button: Locator;
}

function parseTime(text: string): string | null {
  const match = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function parseTeeTimeButton(text: string): Omit<TeeTime, "button"> | null {
  // Button text format: "11:20AMMacDonald 9 or 18 HOLES | 2 - 3 GOLFERS $0.00"
  const match = text.match(
    /^(\d{1,2}:\d{2}[AP]M)(.+?)\s+(9 or 18|9|18)\s+HOLES?\s*\|\s*(.+?GOLFERS?)\s+\$/
  );
  if (!match) return null;

  const timeStr = match[1];
  const time24 = parseTime(timeStr);
  if (!time24) return null;

  return {
    time: timeStr,
    time24,
    course: match[2].trim(),
    holes: match[3],
    players: match[4].trim(),
    buttonText: text.trim(),
  };
}

function isTimeInWindow(time24: string): boolean {
  return time24 >= config.booking.earliestTime && time24 <= config.booking.latestTime;
}

function isPreferredCourse(course: string): boolean {
  if (config.booking.preferredCourses.length === 0) return true;
  return config.booking.preferredCourses.some(
    (c) => course.toLowerCase().includes(c.toLowerCase())
  );
}

function coursePriority(course: string): number {
  const courses = config.booking.preferredCourses;
  for (let i = 0; i < courses.length; i++) {
    if (course.toLowerCase().includes(courses[i].toLowerCase())) return i;
  }
  return courses.length;
}

async function expandAllSections(page: Page): Promise<void> {
  while (true) {
    const showMore = page.getByRole("button", { name: /show more/i });
    const count = await showMore.count();
    if (count === 0) break;
    await showMore.first().click();
    await page.waitForTimeout(1000);
  }
}

async function navigateToDate(page: Page, target: Date): Promise<void> {
  const targetDay = target.getDate();
  const targetMonthName = target.toLocaleString("default", { month: "long" });
  const targetYear = target.getFullYear();

  console.log(`Navigating to ${targetMonthName} ${targetDay}, ${targetYear}...`);

  // Check if we need to go to the next month
  const calendarHeader = page.locator("text=/[A-Z][a-z]+ \\d{4}/").first();
  const headerText = await calendarHeader.textContent().catch(() => "");

  if (headerText && !headerText.includes(targetMonthName)) {
    const nextArrow = page.locator("button[aria-label='Next month'], .mat-calendar-next-button");
    if (await nextArrow.count() > 0) {
      await nextArrow.click();
      await page.waitForTimeout(1000);
    }
  }

  // Click the target day in the calendar
  const dayCell = page.locator(`.mat-calendar-body-cell:has-text("${targetDay}")`).first();
  if (await dayCell.count() > 0) {
    await dayCell.click();
  } else {
    console.log(`Calendar cell not found for day ${targetDay}, trying fallback...`);
    await page.locator(`[class*="calendar"] >> text="${targetDay}"`).first().click();
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}

async function setPlayerFilter(page: Page): Promise<void> {
  // The tee sheet has player count filter buttons: 2, 3, 4, 5, Any
  // These are in the "Players" section, separate from the calendar
  const playerCount = config.booking.players.toString();
  console.log(`Setting player filter to ${playerCount}...`);

  // Look for the Players section and click the matching number
  // The player buttons are near the "Players" label
  const playersSection = page.locator("text=Players").first();
  if (await playersSection.count() > 0) {
    // Find the button with the exact player count near the Players label
    const playerBtn = page.locator(`button:has-text("${playerCount}")`);
    const allPlayerBtns = await playerBtn.all();

    // The player filter buttons are small buttons with just a number
    // We need to find the one that's part of the player filter, not calendar
    for (const btn of allPlayerBtns) {
      const text = (await btn.textContent())?.trim();
      if (text === playerCount) {
        await btn.click();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        console.log(`Player filter set to ${playerCount}.`);
        return;
      }
    }
  }
  console.log("Could not find player filter, proceeding with defaults.");
}

async function getAllTeeTimes(page: Page): Promise<TeeTime[]> {
  const teeTimes: TeeTime[] = [];
  const buttons = await page.getByRole("button").all();

  for (const button of buttons) {
    const text = await button.textContent().catch(() => "");
    if (!text) continue;

    const cleaned = text.replace(/\s+/g, " ").trim();
    const parsed = parseTeeTimeButton(cleaned);
    if (parsed) {
      teeTimes.push({ ...parsed, button });
    }
  }

  return teeTimes;
}

async function addBuddies(page: Page): Promise<void> {
  if (config.booking.buddies.length === 0) return;

  console.log("Adding playing partners...");

  // Wait for the Prior Playing Partners section to render
  try {
    await page.waitForSelector("text=Prior Playing Partners", { timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch {
    console.log("  Prior Playing Partners section not found, skipping buddy add.");
    return;
  }

  for (const buddy of config.booking.buddies) {
    console.log(`  Adding ${buddy}...`);

    const nameEl = page.locator(`text="${buddy}"`).first();
    if (await nameEl.count() === 0) {
      console.log(`  ${buddy} not found in Prior Playing Partners.`);
      continue;
    }

    // The + button is the mat-icon "add" sibling within the same card.
    // Walk up to the nearest ancestor that contains both the name and the + button.
    // Try clicking the "add" / "+" icon that shares a parent with the buddy name.
    const card = nameEl.locator("xpath=ancestor::*[.//mat-icon][position()=1]").first();
    const addIcon = card.locator("mat-icon, .mat-icon").last();

    if (await addIcon.count() > 0) {
      await addIcon.click();
      await page.waitForTimeout(1500);
      console.log(`  ${buddy} added.`);
    } else {
      // Fallback: click the + button directly after the name text
      const plusBtn = nameEl.locator("xpath=following-sibling::*[1] | ../following-sibling::*[1]//button | ../*[contains(@class,'add')]").first();
      if (await plusBtn.count() > 0) {
        await plusBtn.click();
        await page.waitForTimeout(1500);
        console.log(`  ${buddy} added (fallback).`);
      } else {
        console.log(`  Could not find add button for ${buddy}.`);
      }
    }
  }
}

/** Clicks a tee time button and waits for the checkout page. Returns false if already booked. */
async function clickTeeTimeAndWaitForConfirm(page: Page, button: Locator): Promise<boolean> {
  console.log("Clicking tee time button...");

  // Handle browser-level dialogs (window.confirm) that CPS may use
  page.on("dialog", async (dialog) => {
    console.log(`  Dialog: ${dialog.message()}`);
    await dialog.accept();
  });

  // Click and wait for the LockTeeTimes API response
  const [lockResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("LockTeeTimes"), { timeout: 15000 }),
    button.click(),
  ]);

  console.log(`  LockTeeTimes: ${lockResp.status()}`);

  // CPS shows a warning dialog when there's already a reservation for that day
  const lockBody = await lockResp.text().catch(() => "");
  try {
    const lockJson = JSON.parse(lockBody);
    if (lockJson.warning) {
      console.log(`  Warning: ${lockJson.warning}`);
      await page.waitForTimeout(2000);

      // Click "No" to cancel — we don't want to double-book
      const dialogBtns = page.locator(".cdk-overlay-container button");
      for (let i = 0; i < await dialogBtns.count(); i++) {
        const btnText = (await dialogBtns.nth(i).textContent())?.trim() ?? "";
        if (/no|cancel/i.test(btnText)) {
          await dialogBtns.nth(i).click();
          console.log("  Declined — already have a reservation for this day.");
          return false;
        }
      }
    }
  } catch {
    // Not JSON, continue
  }

  // Wait for the SPA to transition to the confirmation/checkout page
  await page.waitForLoadState("networkidle");

  try {
    await page.locator("text=Player 1")
      .or(page.locator("text=Time left to book"))
      .or(page.locator("text=Customize your Reservation"))
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    console.log("  Confirmation page loaded.");
  } catch {
    console.log(`  URL: ${page.url()}`);
    const bodyText = await page.locator("body").innerText();
    console.log(`  Page text: ${bodyText.slice(0, 500)}`);
    await screenshot(page, "confirm-missing.png");
    throw new Error("Confirmation page never loaded after tee time click");
  }

  return true;
}

async function finalizeReservation(page: Page): Promise<boolean> {
  console.log("Finalizing reservation...");

  // Wait for the Finalize button to appear
  const finalizeBtn = page.getByRole("button", { name: /finalize reservation/i });
  try {
    await finalizeBtn.waitFor({ state: "visible", timeout: 15000 });
  } catch {
    console.log("Finalize Reservation button not found!");
    await screenshot(page, "finalize-missing.png");
    return false;
  }

  await finalizeBtn.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  await screenshot(page, "finalized.png");

  return true;
}

async function searchTeeTimes(page: Page): Promise<{ target: Date; candidates: TeeTime[]; all: TeeTime[] } | null> {
  const target = getTargetDate();
  const dayOfWeek = target.getDay();

  if (
    config.booking.preferredDays.length > 0 &&
    !config.booking.preferredDays.includes(dayOfWeek)
  ) {
    console.log(`Target date ${target.toDateString()} is not a preferred day, skipping.`);
    return null;
  }

  console.log(`Target: ${target.toDateString()} (${config.booking.daysAhead} days ahead)`);
  console.log(`Window: ${config.booking.earliestTime} - ${config.booking.latestTime}`);
  console.log(`Courses: ${config.booking.preferredCourses.join(", ")}`);
  console.log(`Players: ${config.booking.players}`);

  await setPlayerFilter(page);
  await navigateToDate(page, target);

  await screenshot(page, "target-date.png");

  await expandAllSections(page);

  const teeTimes = await getAllTeeTimes(page);
  if (teeTimes.length === 0) {
    console.log("No tee times found on this date.");
    return null;
  }

  teeTimes.sort((a, b) => a.time24.localeCompare(b.time24));

  const onPreferredCourse = teeTimes.filter((tt) => isPreferredCourse(tt.course));

  console.log(`\nFound ${teeTimes.length} total tee times, ${onPreferredCourse.length} at preferred courses:\n`);
  console.log("  Time      Course              Slots");
  console.log("  --------  ------------------  ---------------");

  for (const tt of onPreferredCourse) {
    const marker = isTimeInWindow(tt.time24) ? " <<" : "";
    console.log(
      `  ${tt.time.padEnd(8)}  ${tt.course.padEnd(18)}  ${tt.players}${marker}`
    );
  }

  const candidates = onPreferredCourse
    .filter((tt) => isTimeInWindow(tt.time24))
    .sort((a, b) => {
      const pDiff = coursePriority(a.course) - coursePriority(b.course);
      if (pDiff !== 0) return pDiff;
      return a.time24.localeCompare(b.time24);
    });

  if (candidates.length === 0) {
    const windowMid =
      (parseInt(config.booking.earliestTime.replace(":", "")) +
        parseInt(config.booking.latestTime.replace(":", ""))) /
      2;

    const closest = [...onPreferredCourse].sort((a, b) => {
      const aDist = Math.abs(parseInt(a.time24.replace(":", "")) - windowMid);
      const bDist = Math.abs(parseInt(b.time24.replace(":", "")) - windowMid);
      return aDist - bDist;
    });

    console.log(`\nNo tee times in window ${config.booking.earliestTime}-${config.booking.latestTime}.`);
    if (closest.length > 0) {
      console.log("Closest available:");
      for (const tt of closest.slice(0, 5)) {
        console.log(`  ${tt.time.padEnd(8)}  ${tt.course.padEnd(18)}  ${tt.players}`);
      }
    }
  }

  return { target, candidates, all: onPreferredCourse };
}

/** Dry run: search, select time, add buddies, but do NOT finalize */
export async function findTeeTimes(page: Page): Promise<void> {
  const result = await searchTeeTimes(page);
  if (!result) return;

  if (result.candidates.length === 0) {
    console.log("\n[dry-run] No bookable times found in window.");
    return;
  }

  const pick = result.candidates[0];
  console.log(`\n[dry-run] Selecting: ${pick.time} at ${pick.course} (${pick.players})`);

  const proceeded = await clickTeeTimeAndWaitForConfirm(page, pick.button);
  if (!proceeded) {
    console.log("\n[dry-run] Already booked for this day, skipping.");
    return;
  }

  await screenshot(page, "booking-confirm.png");

  await addBuddies(page);

  await screenshot(page, "dry-run-final.png");
  console.log("\n[dry-run] Stopping before Finalize Reservation.");
}

/** Full run: search, select, add buddies, and finalize */
export async function selectDateAndBook(page: Page): Promise<boolean> {
  const result = await searchTeeTimes(page);
  if (!result || result.candidates.length === 0) return false;

  const pick = result.candidates[0];
  console.log(`\nSelecting: ${pick.time} at ${pick.course} (${pick.players})`);

  const proceeded = await clickTeeTimeAndWaitForConfirm(page, pick.button);
  if (!proceeded) {
    console.log("Already booked for this day, skipping.");
    return false;
  }

  await screenshot(page, "booking-confirm.png");

  await addBuddies(page);

  await screenshot(page, "pre-finalize.png");

  const finalized = await finalizeReservation(page);
  if (finalized) {
    console.log(`Booked ${pick.time} at ${pick.course} on ${result.target.toDateString()}!`);
  }

  return finalized;
}
