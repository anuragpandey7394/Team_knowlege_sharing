import { inspectRepository } from "./ledger.mjs";
try {
  const result = inspectRepository();
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  console.log(
    `Checkpoint valid: ${result.milestones.length} milestones, ${result.tasks.length} subtasks`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
