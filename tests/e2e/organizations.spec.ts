import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { browserAccount, browserOrganization } from "../helpers/browser";
import { mailToken } from "../helpers/auth";
test("two organizations, real invitation, role changes and cache clearing on organization switch", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const ownerEmail = await browserAccount(page);
  const suffix = randomUUID().slice(0, 8);
  const firstName = `Alpha ${suffix}`;
  const secondName = `Beta ${suffix}`;
  const ownName = `Independent ${suffix}`;
  await browserOrganization(page, firstName);
  const secondId = await browserOrganization(page, secondName);
  await page
    .getByLabel("Current organization")
    .selectOption({ label: firstName });
  await expect(
    page.getByRole("heading", { name: firstName, exact: true }),
  ).toBeVisible();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    const readerEmail = await browserAccount(other);
    await page.getByLabel("Invite email").fill(readerEmail);
    await page.getByLabel("Invite role").selectOption("READER");
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Changes saved");
    await other.goto(
      "/invite#token=" +
        (await mailToken(readerEmail, "Organization invitation")),
    );
    await expect(
      other.getByText("Join as Reader.", { exact: true }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: firstName, exact: true }),
    ).toBeVisible();
    await expect(
      other.getByText("Your role: Reader", { exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("heading", {
        name: "Organization settings",
        exact: true,
      }),
    ).toHaveCount(0);
    await browserOrganization(other, ownName);
    await expect(
      other.getByText("Your role: Admin", { exact: true }),
    ).toBeVisible();
    await other
      .getByLabel("Current organization")
      .selectOption({ label: firstName });
    await expect(other.getByText(ownerEmail, { exact: true })).toBeVisible();
    await other
      .getByLabel("Current organization")
      .selectOption({ label: ownName });
    await expect(
      other.getByRole("heading", { name: ownName, exact: true }),
    ).toBeVisible();
    await expect(other.getByText(ownerEmail, { exact: true })).toHaveCount(0);
    expect(
      (await other.request.get(`/api/v1/organizations/${secondId}`)).status(),
    ).toBe(404);
    await page.reload();
    await page
      .getByRole("button", { name: `Remove ${ownerEmail}`, exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Keep at least one Admin",
    );
    await page
      .getByRole("combobox", { name: `Role for ${readerEmail}`, exact: true })
      .selectOption("EDITOR");
    await page
      .locator(".member-list li")
      .filter({ hasText: readerEmail })
      .getByRole("button", { name: "Save role", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Changes saved");
    await other
      .getByLabel("Current organization")
      .selectOption({ label: firstName });
    await expect(
      other.getByText("Your role: Editor", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Current organization")
      .selectOption({ label: secondName });
    await page
      .getByLabel("Organization name", { exact: true })
      .fill(`Renamed ${suffix}`);
    await page
      .getByRole("button", { name: "Save organization name", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `Renamed ${suffix}`, exact: true }),
    ).toBeVisible();
  } finally {
    await otherContext.close();
  }
});
