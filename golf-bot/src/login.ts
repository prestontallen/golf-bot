import { Page } from "playwright";
import { config } from "./config.js";

export async function login(page: Page): Promise<void> {
  console.log("Navigating to login page...");
  await page.goto(config.baseUrl, { waitUntil: "networkidle" });

  // Step 1: Click the nav bar "Sign In" button
  console.log("Clicking Sign In...");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  // Step 2: Wait for email field, fill it
  console.log("Entering email...");
  const emailField = page.getByPlaceholder(/email/i);
  await emailField.waitFor({ state: "visible", timeout: 10000 });
  await emailField.fill(config.credentials.email);
  await page.waitForTimeout(500);

  // Step 3: Click NEXT and wait for VerifyUser API response
  console.log("Clicking NEXT...");
  await page.getByRole("button", { name: /next/i }).click();
  await page.waitForResponse(
    (r) => r.url().includes("VerifyUser"),
    { timeout: 10000 }
  );
  await page.waitForTimeout(2000);

  // Step 4: Wait for password field
  console.log("Waiting for password field...");
  const passwordField = page.getByPlaceholder(/password/i);
  await passwordField.waitFor({ state: "visible", timeout: 15000 });

  // Step 5: Fill password and submit
  console.log("Entering password...");
  await passwordField.fill(config.credentials.password);

  console.log("Clicking SIGN IN...");
  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();

  // Wait for login to complete
  console.log("Waiting for login to complete...");
  await page.waitForSelector("text=Welcome back", { state: "hidden", timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log("Logged in successfully.");
}
