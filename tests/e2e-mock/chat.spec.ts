import { test, expect } from "@playwright/test";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { randomUUID } from "node:crypto";
test("mock chat stays labelled, shows exact source links and cancels/retries safely", async ({
  page,
}) => {
  test.setTimeout(90000);
  await browserAccount(page);
  const orgId = await browserOrganization(
    page,
    "Mock chat " + randomUUID().slice(0, 8),
  );
  await page
    .getByRole("link", { name: "Browse knowledge", exact: true })
    .click();
  await page
    .getByLabel("Space name", { exact: true })
    .fill("Mock source space");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await page.getByLabel("New page title").fill("Synthetic simulation source");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page).toHaveURL(/\/pages\/[^/]+\/edit$/);
  await page
    .getByRole("textbox", { name: "Page body", exact: true })
    .fill("Synthetic source preview for UI validation");
  await expect(
    page.getByRole("status").filter({ hasText: /^Saved$/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish saved draft", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published version 1" }),
  ).toBeVisible();
  await page.goto(`/organizations/${orgId}/chat`);
  await expect(
    page.getByRole("status", { name: "AI provider status" }),
  ).toContainText("SIMULATION ONLY");
  await page.getByLabel("Conversation title").fill("Mock conversation");
  await page
    .getByLabel("Search scope")
    .selectOption({ label: "Mock source space" });
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  const path = new URL(page.url()).pathname;
  await page
    .getByLabel("Question", { exact: true })
    .fill("Test a simulated answer");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Conversation messages" }),
  ).toContainText("Simulation only: AI is not connected");
  await page
    .getByRole("link", {
      name: "Synthetic simulation source — exact published version",
      exact: true,
    })
    .click();
  await expect(page.locator("article")).toContainText("Historical version 1");
  await expect(page.locator("article")).toContainText(
    "Synthetic source preview for UI validation",
  );
  await page.goto(path);
  await page
    .getByLabel("Question", { exact: true })
    .fill("Cancel this simulated request");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Conversation messages" }),
  ).toContainText("CANCELLED");
  await page
    .getByRole("button", { name: "Retry saved request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved request", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("list", { name: "Conversation messages" })
      .locator(":scope > li")
      .last(),
  ).toContainText("COMPLETE");
  await expect(
    page
      .getByRole("list", { name: "Conversation messages" })
      .locator(":scope > li"),
  ).toHaveCount(4);
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Conversation messages" }),
  ).toContainText("Simulation only");
});
