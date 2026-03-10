# Golf Bot

Automated tee time booking for [CPS Golf](https://cityofwichita.cps.golf) (Club Prophet Systems) courses. Uses Playwright to log in, navigate to the target date, and book the best available tee time based on your preferences.

## Features

- Logs into CPS Golf and books tee times automatically
- Course priority ordering (e.g., MacDonald first, then Arthur B. Sim)
- Configurable time window, player count, and days-ahead targeting
- Auto-adds playing partners from your Prior Playing Partners list
- Cron-based scheduling for daily booking attempts
- Home Assistant add-on support with persistent notifications
- Screenshots saved at each step for debugging

## Local Setup

```bash
cd golf-bot
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env with your CPS credentials and preferences
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CPS_EMAIL` | | Your CPS Golf login email |
| `CPS_PASSWORD` | | Your CPS Golf password |
| `CPS_COURSE_URL` | `https://cityofwichita.cps.golf` | CPS booking site URL |
| `CPS_PLAYERS` | `2` | Number of players |
| `CPS_HOLES` | `18` | Number of holes (9 or 18) |
| `CPS_EARLIEST_TIME` | `08:30` | Earliest tee time (24h format) |
| `CPS_LATEST_TIME` | `10:00` | Latest tee time (24h format) |
| `CPS_DAYS_AHEAD` | `7` | Days ahead to book (max availability window) |
| `CPS_SCHEDULE_CRON` | `0 6 * * *` | Cron schedule for booking attempts |

Course priority and buddies are configured in `golf-bot/src/config.ts`.

## Usage

```bash
cd golf-bot

# Dry run -- searches and selects a time but does not finalize
npm run dry-run

# Book once and exit
npm run start:once

# Run with cron scheduling (default: 6 AM daily)
npm start

# Headless single run
npm run start:headless
```

## Home Assistant Add-on

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**
2. Click the three dots menu (top right) > **Repositories**
3. Add: `https://github.com/prestontallen/golf-bot`
4. Install the **Golf Bot** add-on
5. Go to the add-on **Configuration** tab and set your credentials and preferences
6. Start the add-on -- it will run on the configured cron schedule

The add-on sends Home Assistant persistent notifications on booking success or failure.

## Screenshots

The bot saves screenshots to `screenshots/` at each step:

- `post-login.png` -- state after login
- `target-date.png` -- tee sheet for the target date
- `booking-confirm.png` -- reservation confirmation page
- `pre-finalize.png` -- state after adding buddies, before finalizing
- `finalized.png` -- final state after booking
- `error.png` -- captured on any failure
