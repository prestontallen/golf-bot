import { Page } from "playwright";
import { config } from "./config.js";

const HA_SUPERVISOR_URL = "http://supervisor/core/api";

export interface Reservation {
  date: string;
  time: string;
  course: string;
  players: number;
  holes: number;
}

const RESERVATIONS_PATH = "/onlineresweb/my-reservation";

export async function fetchReservations(page: Page): Promise<Reservation[]> {
  const url = `${config.baseUrl}${RESERVATIONS_PATH}`;
  console.log(`Navigating to reservations page: ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const panels = page.locator("mat-expansion-panel-header");
  const count = await panels.count();
  const reservations: Reservation[] = [];

  for (let i = 0; i < count; i++) {
    const panel = panels.nth(i);

    const date = await panel.locator(".heading-small").first().textContent();
    const time = await panel.locator("small").first().textContent();
    const course = await panel.locator(".course-name").textContent();
    const info = await panel.locator(".player-and-hole-info").textContent();

    if (!date || !time || !course || !info) continue;

    const holesMatch = info.match(/(\d+)\s*Holes?/i);
    const playersMatch = info.match(/(\d+)\s*Players?/i);

    reservations.push({
      date: date.trim(),
      time: time.trim(),
      course: course.trim(),
      players: playersMatch ? parseInt(playersMatch[1]) : 0,
      holes: holesMatch ? parseInt(holesMatch[1]) : 0,
    });
  }

  for (const r of reservations) {
    console.log(`  ${r.date} ${r.time} — ${r.course} (${r.holes}H, ${r.players}P)`);
  }

  return reservations;
}

export async function publishReservations(reservations: Reservation[]): Promise<void> {
  if (!config.isHa) {
    console.log("[publish] Skipping sensor update (not running in HA).");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
  };

  const next = reservations[0];

  try {
    // sensor.golf_bot_next_reservation — friendly state for glance cards
    await fetch(`${HA_SUPERVISOR_URL}/states/sensor.golf_bot_next_reservation`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        state: next
          ? `${next.date} ${next.time}`
          : "None",
        attributes: {
          friendly_name: "Next Tee Time",
          icon: "mdi:golf-tee",
          ...(next && {
            course: next.course,
            players: next.players,
            holes: next.holes,
          }),
        },
      }),
    });

    // sensor.golf_bot_reservations — full list for markdown/template cards
    await fetch(`${HA_SUPERVISOR_URL}/states/sensor.golf_bot_reservations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        state: reservations.length,
        attributes: {
          friendly_name: "Golf Reservations",
          icon: "mdi:golf",
          unit_of_measurement: "reservations",
          reservations,
        },
      }),
    });

    console.log(`[publish] Updated HA sensors (${reservations.length} reservations).`);
  } catch (err) {
    console.error("Failed to publish reservations to HA:", err);
  }
}
