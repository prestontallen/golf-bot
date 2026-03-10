import { config } from "./config.js";

const HA_SUPERVISOR_URL = "http://supervisor/core/api";

export async function notify(message: string, title = "Golf Bot"): Promise<void> {
  console.log(`[notify] ${title}: ${message}`);

  if (!config.isHa) return;

  try {
    const res = await fetch(`${HA_SUPERVISOR_URL}/services/notify/persistent_notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}`,
      },
      body: JSON.stringify({ title, message }),
    });

    if (!res.ok) {
      console.error(`HA notification failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error("Failed to send HA notification:", err);
  }
}
