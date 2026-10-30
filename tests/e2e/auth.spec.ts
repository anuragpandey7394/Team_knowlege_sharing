import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { mailToken, newEmail, password } from "../helpers/auth";
import { createDatabase } from "../../apps/api/src/database";
import { hashToken } from "../../apps/api/src/tenant";
import { testEnvironment, assertSafeTestDatabase } from "../helpers/database";
async function submit(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function register(page: Page) {
  const email = newEmail();
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Synthetic Browser User");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await submit(page);
  await expect(page.getByRole("status")).toContainText(
    "If this request is eligible",
  );
  return email;
}
async function verifyEmail(page: Page, email: string) {
  const token = await mailToken(email, "Verify your email");
  await page.goto(`/verify-email#token=${token}`);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Email verified");
}
async function login(page: Page, email: string, value = password) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("register through real inbox verification, login/logout, forgot/reset and new login", async ({
  page,
}) => {
  const email = await register(page);
  await verifyEmail(page, email);
  await login(page, email);
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await expect(
    page.getByText("Email verified.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await submit(page);
  await expect(page.getByRole("status")).toContainText(
    "If this request is eligible",
  );
  const token = await mailToken(email, "Reset your password");
  await page.goto(`/reset-password#token=${token}`);
  const replacement = "New browser synthetic password 42";
  await page.getByLabel("Password", { exact: true }).fill(replacement);
  await submit(page);
  await expect(page.getByRole("status")).toContainText("Password reset");
  await login(page, email);
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect",
  );
  await login(page, email, replacement);
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
});
test("unverified account can resend email and recover from an expired real session", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await login(page, email);
  await expect(
    page.getByText(
      "Verify your email before accessing organization knowledge.",
    ),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Resend verification email", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await submit(page);
  await expect(page.getByRole("status")).toContainText(
    "If this request is eligible",
  );
  await verifyEmail(page, email);
  await page.goto("/account");
  const token = (await context.cookies()).find(
    (cookie) => cookie.name === "tka_session",
  )?.value;
  expect(token).toBeTruthy();
  const env = testEnvironment();
  assertSafeTestDatabase(
    env.TEST_DATABASE_URL,
    env.DATABASE_URL,
    process.env.NODE_ENV,
  );
  const { schema } = JSON.parse(
    readFileSync(".cache/e2e-schema.json", "utf8"),
  ) as { schema: string };
  expect(schema).toMatch(/^test_[a-f0-9]{32}$/);
  const db = createDatabase(env.TEST_DATABASE_URL, schema);
  try {
    await db.session.update({
      where: { tokenHash: hashToken(token!) },
      data: { expiresAt: new Date(0) },
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await expect(
    page.getByText("Your session expired. Please sign in again."),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
});
test("invalid email action link offers recovery", async ({ page }) => {
  await page.goto("/verify-email#token=" + "0".repeat(64));
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This link is invalid or expired",
  );
  await expect(
    page.getByRole("link", { name: "Resend verification", exact: true }),
  ).toBeVisible();
});
