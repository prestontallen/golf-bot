import { Page } from "playwright";
import { config } from "./config.js";

export async function login(page: Page): Promise<void> {
  console.log("Navigating to login page...");
  await page.goto(config.baseUrl);
  await page.waitForLoadState("networkidle");

  // Step 1: Click the nav bar "Sign In" button (mixed case)
  console.log("Looking for Sign In button...");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  // Step 2: Enter email and advance
  console.log("Entering email...");
  await page.getByPlaceholder(/email/i).fill(config.credentials.email);
  await page.getByRole("button", { name: /next/i }).click();

  // Step 3: Enter password and submit (all-caps "SIGN IN")
  console.log("Entering password...");
  await page.getByPlaceholder(/password/i).fill(config.credentials.password);
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();

  // Wait for the login form to disappear (not just networkidle)
  console.log("Waiting for login to complete...");
  await page.waitForSelector("text=Welcome back", { state: "hidden", timeout: 15000 });

  // Give the SPA time to fully render the post-login view
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log("Logged in successfully.");
}
