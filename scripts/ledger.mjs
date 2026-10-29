import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadDocuments(root = process.cwd()) {
  const documents = {};
  for (const file of [
    "AGENTS.md",
    "IMPLEMENTATION_SPEC.md",
    "MILESTONES.md",
    "PROGRESS.md",
  ]) {
    if (!existsSync(resolve(root, file)))
      throw new Error(`Missing required document: ${file}`);
    documents[file] = readFileSync(resolve(root, file), "utf8");
  }
  return documents;
}

export function inspectLedger(documents, evidenceExists) {
  const errors = [];
  for (const file of [
    "AGENTS.md",
    "IMPLEMENTATION_SPEC.md",
    "MILESTONES.md",
    "PROGRESS.md",
  ]) {
    if (!documents[file]?.trim())
      errors.push(`Missing required document: ${file}`);
  }
  if (errors.length)
    return {
      errors,
      milestones: [],
      tasks: [],
      current: null,
      next: null,
      blocker: null,
    };
  const plan = documents["MILESTONES.md"];
  const progress = documents["PROGRESS.md"];
  const milestones = [...plan.matchAll(/^\| (M\d{2}) \| ([^|]+) \|/gm)]
    .map((match) => ({ id: match[1], state: match[2].trim() }))
    .filter((row) => !row.state.startsWith("`"));
  const states = new Set(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"]);
  if (
    milestones.length !== 15 ||
    milestones.some(
      (row, index) => row.id !== `M${String(index).padStart(2, "0")}`,
    )
  )
    errors.push("Expected ordered milestone states M00–M14 exactly once");
  const tasks = [...plan.matchAll(/^- \[([ x])\] (M\d{2}\.\d{2}) (.+)$/gm)].map(
    (match) => ({
      id: match[2],
      done: match[1] === "x",
      description: match[3],
    }),
  );
  const taskIds = new Set(tasks.map((task) => task.id));
  if (tasks.length !== taskIds.size) errors.push("Duplicate subtask ID");
  for (const reference of `${plan}\n${progress}`.matchAll(
    /\bM\d{2}\.\d{2}\b/g,
  )) {
    if (!taskIds.has(reference[0]))
      errors.push(`Unknown subtask reference: ${reference[0]}`);
  }
  let incomplete = false;
  for (const row of milestones) {
    if (!states.has(row.state))
      errors.push(`Invalid state for ${row.id}: ${row.state}`);
    const children = tasks.filter((task) => task.id.startsWith(`${row.id}.`));
    if (!children.length) errors.push(`No subtasks for ${row.id}`);
    children.forEach((task, index) => {
      if (task.id !== `${row.id}.${String(index + 1).padStart(2, "0")}`)
        errors.push(`Nonsequential task ID: ${task.id}`);
    });
    const evidence = `docs/evidence/${row.id}.md`;
    if (
      (row.state !== "NOT_STARTED" || children.some((task) => task.done)) &&
      !evidenceExists(evidence)
    )
      errors.push(`Missing evidence: ${evidence}`);
    if (row.state === "NOT_STARTED" && children.some((task) => task.done))
      errors.push(`NOT_STARTED has completed tasks: ${row.id}`);
    if (row.state === "COMPLETE" && children.some((task) => !task.done))
      errors.push(`COMPLETE has incomplete subtasks: ${row.id}`);
    if (incomplete && row.state !== "NOT_STARTED")
      errors.push(`Dependency incomplete before ${row.id}`);
    if (row.state !== "COMPLETE") incomplete = true;
  }
  const overall = progress.match(/^- Overall status: (\S+)/m)?.[1];
  if (!states.has(overall))
    errors.push("Invalid or missing progress overall status");
  for (const field of [
    "Current milestone/subtask",
    "Last verification",
    "Current failure/blocker",
    "Next executable action",
  ]) {
    if (!progress.includes(`- ${field}: `))
      errors.push(`Missing progress field: ${field}`);
  }
  const current = milestones.find((row) => row.state !== "COMPLETE") ?? null;
  const next =
    current && current.state !== "BLOCKED"
      ? (tasks.find(
          (task) => task.id.startsWith(`${current.id}.`) && !task.done,
        ) ?? null)
      : null;
  const blocker =
    progress.match(/^- Current failure\/blocker: (.+)$/m)?.[1] ?? null;
  if (current?.state === "BLOCKED" && (!blocker || blocker === "none"))
    errors.push("BLOCKED milestone requires a progress blocker");
  if (
    overall === "COMPLETE" &&
    milestones.slice(0, 11).some((row) => row.state !== "COMPLETE")
  )
    errors.push("Foundation COMPLETE with incomplete milestones");
  return {
    errors: [...new Set(errors)],
    milestones,
    tasks,
    current,
    next,
    blocker,
  };
}

export function inspectRepository(root = process.cwd()) {
  return inspectLedger(loadDocuments(root), (path) =>
    existsSync(resolve(root, path)),
  );
}
