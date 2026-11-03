import { test, expect, type Page } from "@playwright/test";
import { demoPassword } from "../../apps/api/src/seed";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(demoPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
}
test("seeded two-org golden navigation preserves roles, rich history, comments, search and private disabled chat", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page, "demo-atlas-0@example.test");
  await page
    .getByRole("link", { name: "Your organizations", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Synthetic atlas engineering", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Browse knowledge", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const navigation = page.getByText("Knowledge navigation", { exact: true });
  await navigation.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("aside > details")).not.toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(page.locator("aside > details")).toHaveAttribute("open", "");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page
    .getByRole("link", { name: "Search published pages", exact: true })
    .click();
  let failSearchOnce = true;
  const searchPattern = "**/api/v1/organizations/*/search?*";
  await page.route(searchPattern, (route) => {
    if (failSearchOnce) {
      failSearchOnce = false;
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByLabel("Search words").fill("atlas setup 1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Search unavailable");
  const [recovered] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/") && r.url().includes("/search?"),
    ),
    page.getByRole("button", { name: "Retry", exact: true }).click(),
  ]);
  expect(recovered.status()).toBe(200);
  await page.unroute(searchPattern);
  await page
    .getByRole("link", { name: "Synthetic atlas setup 1", exact: true })
    .click();
  await expect(page.locator("article pre")).toContainText("npm ci");
  await expect(page.locator("article table")).toContainText("Endpoint");
  await expect(page.locator("article")).toContainText("Version 2");
  await expect(
    page.getByRole("heading", { name: "Comments", exact: true }),
  ).toBeVisible();
  const atlasPath = new URL(page.url()).pathname;
  await page.screenshot({
    path: "docs/evidence/M09-golden-atlas.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Version 1: Synthetic atlas setup 1/ })
    .click();
  await expect(page.locator("article")).toContainText("Historical version 1");
  const context = await browser.newContext();
  const other = await context.newPage();
  try {
    await login(other, "demo-boreal-0@example.test");
    await other.goto(atlasPath);
    await expect(other.getByRole("alert")).toContainText(
      "Published page unavailable",
    );
    await expect(other.locator("article")).toHaveCount(0);
    await other.goto("/organizations");
    await other
      .getByRole("link", { name: "Synthetic boreal engineering", exact: true })
      .click();
    await other
      .getByRole("link", { name: "Browse knowledge", exact: true })
      .click();
    await other
      .getByRole("link", { name: "Search published pages", exact: true })
      .click();
    await other.getByLabel("Search words").fill("boreal setup 1");
    await other.getByRole("button", { name: "Search", exact: true }).click();
    await other
      .getByRole("link", { name: "Synthetic boreal setup 1", exact: true })
      .click();
    await expect(other.locator("article")).toContainText("Synthetic boreal");
    await other.screenshot({
      path: "docs/evidence/M09-golden-boreal.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  try {
    await login(reader, "demo-atlas-3@example.test");
    await reader.goto(atlasPath);
    await expect(
      reader.getByRole("link", { name: "Edit shared draft", exact: true }),
    ).toHaveCount(0);
    await expect(reader.getByLabel("New comment", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      reader.getByRole("heading", { name: "Comments", exact: true }),
    ).toBeVisible();
    await reader
      .getByRole("link", { name: "Browse space", exact: true })
      .click();
    await reader
      .getByRole("link", { name: "Private chat", exact: true })
      .click();
    await expect(
      reader.getByRole("status", { name: "AI provider status" }),
    ).toContainText("AI is not connected");
  } finally {
    await readerContext.close();
  }
});
