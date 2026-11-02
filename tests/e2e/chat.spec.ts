import { test, expect } from "@playwright/test";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { randomUUID } from "node:crypto";
test("disabled chat saves owner-private questions and retries without duplicate messages", async ({
  page,
}) => {
  await browserAccount(page);
  const orgId = await browserOrganization(
    page,
    "Disabled chat " + randomUUID().slice(0, 8),
  );
  await page.getByRole("link", { name: "Private chat", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "AI provider status" }),
  ).toContainText("AI is not connected");
  await page.getByLabel("Conversation title").fill("Saved disabled questions");
  await page
    .getByRole("button", { name: "Create conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  const path = new URL(page.url()).pathname;
  await page
    .getByLabel("Question", { exact: true })
    .fill("Synthetic onboarding question");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("AI is not connected");
  await expect(
    page.getByRole("list", { name: "Conversation messages" }).locator("li"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Retry saved request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved request", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("list", { name: "Conversation messages" }).locator("li"),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Conversation messages" }),
  ).toContainText("Synthetic onboarding question");
  const other = await browserOrganization(
    page,
    "Other chat " + randomUUID().slice(0, 8),
  );
  await page.goto(`/organizations/${other}/chat`);
  await expect(
    page.getByText("Saved disabled questions", { exact: true }),
  ).toHaveCount(0);
  await page.goto(path);
  await expect(
    page.getByRole("heading", {
      name: "Saved disabled questions",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete conversation", exact: true })
    .click();
  await expect(page).toHaveURL(`/organizations/${orgId}/chat`);
});
