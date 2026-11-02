import { test, expect } from "@playwright/test";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { mailToken } from "../helpers/auth";
import { randomUUID } from "node:crypto";
test("reviewer advice is escaped, revised and moderated with tombstoned exact citations", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await browserAccount(page);
  const name = "Comments " + randomUUID().slice(0, 8);
  const orgId = await browserOrganization(page, name);
  const context = await browser.newContext();
  const reviewer = await context.newPage();
  try {
    const email = await browserAccount(reviewer);
    await page.getByLabel("Invite email").fill(email);
    await page.getByLabel("Invite role").selectOption("REVIEWER");
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Changes saved");
    await reviewer.goto(
      `/invite#token=${await mailToken(email, "Organization invitation")}`,
    );
    await reviewer
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      reviewer.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Browse knowledge", exact: true })
      .click();
    await page.getByLabel("Space name", { exact: true }).fill("Advice space");
    await page
      .getByRole("button", { name: "Create space", exact: true })
      .click();
    await page.getByLabel("New page title").fill("Comment provenance");
    await page
      .getByRole("button", { name: "Create page", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pages\/[^/]+\/edit$/);
    const path = new URL(page.url()).pathname.replace(/\/edit$/, "");
    await page
      .getByRole("textbox", { name: "Page body", exact: true })
      .fill("Authoritative synthetic setup");
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publish saved draft", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Published version 1" }),
    ).toBeVisible();
    await reviewer.goto(path);
    const advice =
      "<script>window.syntheticUnsafe = true</script> Speculative advice";
    await reviewer.getByLabel("New comment", { exact: true }).fill(advice);
    await reviewer
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await expect(reviewer.locator(".comment-text")).toHaveText(advice);
    expect(
      await reviewer.evaluate(() => Object.hasOwn(window, "syntheticUnsafe")),
    ).toBe(false);
    const original = await reviewer
      .getByRole("link", { name: "Permanent comment revision link" })
      .getAttribute("href");
    await reviewer
      .getByRole("button", { name: "Edit my comment", exact: true })
      .click();
    await reviewer
      .getByLabel("Edit comment text")
      .fill("Revised synthetic advice");
    await reviewer
      .getByRole("button", { name: "Save comment revision", exact: true })
      .click();
    await expect(reviewer.locator(".comment-text")).toHaveText(
      "Revised synthetic advice",
    );
    await reviewer.goto(original!);
    await expect(
      reviewer.getByRole("region", { name: "Exact comment reference" }),
    ).toContainText(advice);
    await page.goto(path);
    await page
      .getByRole("button", { name: "Moderate comment", exact: true })
      .click();
    await expect(page.locator(".comment-text")).toHaveText(
      "Comment unavailable (removed).",
    );
    await reviewer.reload();
    await expect(
      reviewer.getByRole("region", { name: "Exact comment reference" }),
    ).toContainText("Comment unavailable (removed).");
    await expect(
      reviewer.getByRole("region", { name: "Exact comment reference" }),
    ).not.toContainText(advice);
    await reviewer.goto(`/organizations/${orgId}/knowledge`);
  } finally {
    await context.close();
  }
});
