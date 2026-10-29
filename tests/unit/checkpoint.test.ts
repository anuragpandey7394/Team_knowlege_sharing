import { describe, it, expect } from "vitest";
// Ledger is also used directly by Node without a compilation prerequisite.
// @ts-expect-error JavaScript CLI module intentionally has no declaration output.
import { inspectLedger, loadDocuments } from "../../scripts/ledger.mjs";
const documents = loadDocuments();
function check(overrides: Record<string, string> = {}, evidence = true) {
  return inspectLedger({ ...documents, ...overrides }, () => evidence);
}
describe("durable checkpoint integrity", () => {
  it("accepts the actual repository ledger", () =>
    expect(check().errors).toEqual([]));
  it("rejects missing progress", () =>
    expect(check({ "PROGRESS.md": "" }).errors).toContain(
      "Missing required document: PROGRESS.md",
    ));
  it("rejects missing active evidence", () =>
    expect(check({}, false).errors).toContain(
      "Missing evidence: docs/evidence/M00.md",
    ));
  it("rejects malformed task references", () =>
    expect(
      check({ "PROGRESS.md": documents["PROGRESS.md"] + "\nM00.99" }).errors,
    ).toContain("Unknown subtask reference: M00.99"));
  it("rejects invalid states", () =>
    expect(
      check({
        "MILESTONES.md": documents["MILESTONES.md"].replace(
          /\| M00 \| \w+ \|/,
          "| M00 | DONE |",
        ),
      }).errors,
    ).toContain("Invalid state for M00: DONE"));
  it("rejects duplicate task IDs", () =>
    expect(
      check({
        "MILESTONES.md":
          documents["MILESTONES.md"] + "\n- [ ] M00.01 duplicated",
      }).errors,
    ).toContain("Duplicate subtask ID"));
  it("rejects premature completion", () =>
    expect(
      check({
        "MILESTONES.md": documents["MILESTONES.md"]
          .replace(/\| M00 \| \w+ \|/, "| M00 | COMPLETE |")
          .replace("- [x] M00.06", "- [ ] M00.06"),
      }).errors,
    ).toContain("COMPLETE has incomplete subtasks: M00"));
  it("rejects skipping a dependency", () => {
    const plan = documents["MILESTONES.md"]
      .replace(/\| M00 \| \w+ \|/, "| M00 | IN_PROGRESS |")
      .replace(/\| M01 \| \w+ \|/, "| M01 | IN_PROGRESS |");
    expect(check({ "MILESTONES.md": plan }).errors).toContain(
      "Dependency incomplete before M01",
    );
  });
  it("reports no eligible task when blocked", () => {
    const result = check({
      "MILESTONES.md": documents["MILESTONES.md"].replace(
        /\| M00 \| \w+ \|/,
        "| M00 | BLOCKED |",
      ),
      "PROGRESS.md": documents["PROGRESS.md"].replace(
        /^- Current failure\/blocker:.*$/m,
        "- Current failure/blocker: fixture dependency unavailable",
      ),
    });
    expect(result.next).toBeNull();
    expect(result.blocker).toBe("fixture dependency unavailable");
  });
});
