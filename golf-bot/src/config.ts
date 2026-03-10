import { readFileSync, existsSync } from "fs";

interface HaOptions {
  cps_email: string;
  cps_password: string;
  course_url: string;
  holes: number;
  earliest_time: string;
  latest_time: string;
  days_ahead: number;
  preferred_days: number[];
  preferred_courses: string[];
  buddies: string[];
  schedule_cron: string;
}

const HA_OPTIONS_PATH = "/data/options.json";

function loadHaOptions(): HaOptions | null {
  if (!existsSync(HA_OPTIONS_PATH)) return null;
  return JSON.parse(readFileSync(HA_OPTIONS_PATH, "utf-8"));
}

// Load dotenv for local development only
const ha = loadHaOptions();
if (!ha) {
  try {
    require("dotenv/config");
  } catch {
    // fine if dotenv isn't available
  }
}

export const config = {
  baseUrl: ha?.course_url ?? process.env.CPS_COURSE_URL ?? "https://cityofwichita.cps.golf",

  credentials: {
    email: ha?.cps_email ?? process.env.CPS_EMAIL ?? "",
    password: ha?.cps_password ?? process.env.CPS_PASSWORD ?? "",
  },

  booking: {
    holes: (ha?.holes ?? parseInt(process.env.CPS_HOLES ?? "18")) as 9 | 18,
    earliestTime: ha?.earliest_time ?? process.env.CPS_EARLIEST_TIME ?? "08:30",
    latestTime: ha?.latest_time ?? process.env.CPS_LATEST_TIME ?? "10:00",
    daysAhead: ha?.days_ahead ?? parseInt(process.env.CPS_DAYS_AHEAD ?? "7"),
    preferredDays: ha?.preferred_days ?? ([] as number[]),

    // Courses in priority order (case-insensitive matching)
    preferredCourses: ha?.preferred_courses ?? ["MacDonald", "Arthur B. Sim"],

    // Buddies to auto-add on the confirmation page
    buddies: ha?.buddies ?? ["REBEKAH BRAKEBILL"],

    // 1 (you) + number of buddies
    get players(): number {
      return 1 + this.buddies.length;
    },
  },

  scheduleCron: ha?.schedule_cron ?? process.env.CPS_SCHEDULE_CRON ?? "0 6 * * *",

  headless: !!ha || process.env.HEADLESS === "1",
  isHa: !!ha,
  screenshotDir: "screenshots",
};

export function validateConfig() {
  if (!config.credentials.email || !config.credentials.password) {
    throw new Error(
      config.isHa
        ? "cps_email and cps_password must be configured in the add-on settings"
        : "CPS_EMAIL and CPS_PASSWORD must be set in .env"
    );
  }
}
