import { test, expect } from "@playwright/test";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { mailToken } from "../helpers/auth";
import { randomUUID } from "node:crypto";
test("publishes independent of drafts, preserves history and exposes archived citations", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await browserAccount(page);
  const orgId = await browserOrganization(
    page,
    "Publishing " + randomUUID().slice(0, 8),
  );
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  const readerEmail = await browserAccount(reader);
  await page.getByLabel("Invite email").fill(readerEmail);
  await page.getByLabel("Invite role").selectOption("READER");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await reader.goto(
    `/invite#token=${await mailToken(readerEmail, "Organization invitation")}`,
  );
  await reader
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Browse knowledge", exact: true })
    .click();
  await page.getByLabel("Space name", { exact: true }).fill("Publishing space");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await page.getByLabel("New page title").fill("Published setup");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page).toHaveURL(/\/pages\/[^/]+\/edit$/);
  const editPath = new URL(page.url()).pathname;
  const publishedPath = editPath.replace(/\/edit$/, "");
  const body = page.getByRole("textbox", { name: "Page body", exact: true });
  await body.fill("First synthetic installation instructions");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published version 1" }),
  ).toBeVisible();
  await reader.goto(publishedPath);
  await expect(reader.locator("article")).toContainText(
    "First synthetic installation instructions",
  );
  const permanent = await reader
    .getByRole("link", { name: "Permanent link to this version" })
    .getAttribute("href");
  await body.fill("Second synthetic installation instructions");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await reader.reload();
  await expect(reader.locator("article")).toContainText(
    "First synthetic installation instructions",
  );
  await expect(reader.locator("article")).not.toContainText("Second synthetic");
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published version 2" }),
  ).toBeVisible();
  await reader.reload();
  await expect(reader.locator("article")).toContainText(
    "Second synthetic installation instructions",
  );
  await reader.goto(permanent!);
  await expect(reader.locator("article")).toContainText("Historical version 1");
  await expect(reader.locator("article")).toContainText(
    "This page has changed",
  );
  await expect(reader.locator("article")).toContainText(
    "First synthetic installation instructions",
  );
  await reader
    .getByRole("button", { name: "Compare version 2 with displayed version" })
    .click();
  await expect(
    reader.getByRole("region", { name: "Plain-text version diff" }),
  ).toContainText("Second synthetic installation instructions");
  await reader.goto(`/organizations/${orgId}/search?q=Second`);
  await expect(
    reader.getByRole("link", { name: "Published setup", exact: true }),
  ).toBeVisible();
  await page.goto(publishedPath);
  await page
    .getByRole("button", { name: "Archive page and descendants", exact: true })
    .click();
  await expect(page.locator("article")).toContainText(
    "Archived — historical content",
  );
  await reader.goto(permanent!);
  await expect(reader.locator("article")).toContainText(
    "Archived — historical content",
  );
  await reader.goto(`/organizations/${orgId}/search?q=Second`);
  await expect(
    reader.getByText("No published pages match.", { exact: false }),
  ).toBeVisible();
  await readerContext.close();
});
