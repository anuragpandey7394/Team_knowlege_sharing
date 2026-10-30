import { expect, type Page } from "@playwright/test";
import { mailToken, newEmail, password } from "./auth";
export async function browserAccount(page: Page) {
  const email = newEmail();
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Organization Browser User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "If this request is eligible",
  );
  await page.goto(
    "/verify-email#token=" + (await mailToken(email, "Verify your email")),
  );
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  return email;
}
export async function browserOrganization(page: Page, name: string) {
  await page.goto("/organizations");
  await page.getByLabel("Organization name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
