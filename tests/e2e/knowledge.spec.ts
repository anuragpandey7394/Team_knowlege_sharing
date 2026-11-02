import { test, expect, type Page } from "@playwright/test";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { randomUUID } from "node:crypto";
async function draft(page: Page) {
  await browserAccount(page);
  const orgId = await browserOrganization(
    page,
    "Knowledge " + randomUUID().slice(0, 8),
  );
  await page
    .getByRole("link", { name: "Browse knowledge", exact: true })
    .click();
  await page.getByLabel("Space name", { exact: true }).fill("Engineering");
  await page
    .getByLabel("Space description", { exact: true })
    .fill("Synthetic technical notes");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await page.getByLabel("New page title").fill("Root draft");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Page body", exact: true }),
  ).toBeVisible();
  return { orgId, path: new URL(page.url()).pathname };
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
}
test("autosaves rich content, nested drafts and moves; warns on dirty navigation and preserves network-failed edits", async ({
  page,
}) => {
  test.setTimeout(90000);
  const { path } = await draft(page);
  const body = page.getByRole("textbox", { name: "Page body", exact: true });
  await body.fill("Technical setup");
  await saved(page);
  await page.getByRole("button", { name: "Code block", exact: true }).click();
  await expect(body.locator("pre")).toContainText("Technical setup");
  await saved(page);
  await body.press("Control+End");
  await body.press("ArrowDown");
  await body.press("Enter");
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect(body.locator("table")).toBeVisible();
  await saved(page);
  await page
    .getByRole("button", { name: "New child of Root draft", exact: true })
    .click();
  await page.getByLabel("New page title").fill("Child draft");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByLabel("Page title", { exact: true })).toHaveValue(
    "Child draft",
  );
  await page
    .getByRole("button", {
      name: "Move current page to space root",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", { name: "Child draft", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Move current page under Root draft",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Browse children of Root draft", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Child draft", exact: true }),
  ).toBeVisible();
  await page.goto(path);
  const selector = "**/pages/*/draft";
  await page.route(selector, (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  const current = page.getByRole("textbox", { name: "Page body", exact: true });
  await current.click();
  await current.press("Control+A");
  await current.pressSequentially("Unsaved network recovery text");
  await expect(current).toContainText("Unsaved network recovery text");
  await expect(page.getByRole("alert")).toContainText(
    "Your edits are kept here",
  );
  await expect(current).toContainText("Unsaved network recovery text");
  await page
    .getByRole("link", { name: "All organizations", exact: true })
    .click();
  await expect(
    page.getByRole("alertdialog", { name: "Unsaved page changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(current).toContainText("Unsaved network recovery text");
  await page.unroute(selector);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Page body", exact: true }),
  ).toContainText("Unsaved network recovery text");
});
test("two editors retain stale edits and explicitly merge after a real 409", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const { path } = await draft(page);
  const second = await context.newPage();
  try {
    await second.goto(path);
    const otherBody = second.getByRole("textbox", {
      name: "Page body",
      exact: true,
    });
    await expect(otherBody).toBeVisible();
    await page
      .getByRole("textbox", { name: "Page body", exact: true })
      .fill("First editor content");
    await saved(page);
    await otherBody.fill("Second editor preserved content");
    await expect(second.getByRole("alert")).toContainText(
      "Another editor saved a newer draft",
    );
    await expect(otherBody).toContainText("Second editor preserved content");
    await second
      .getByRole("button", { name: "Load latest for comparison", exact: true })
      .click();
    await expect(
      second.getByRole("complementary", { name: "Latest server draft" }),
    ).toContainText("First editor content");
    await expect(otherBody).toContainText("Second editor preserved content");
    await otherBody.fill(
      "First editor content + Second editor preserved content",
    );
    await second
      .getByRole("button", { name: "Save my merged draft", exact: true })
      .click();
    await saved(second);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Page body", exact: true }),
    ).toContainText("First editor content + Second editor preserved content");
  } finally {
    await second.close();
  }
});
