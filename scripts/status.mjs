import { inspectRepository } from "./ledger.mjs";
try {
  const result = inspectRepository();
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  console.log(
    `Current milestone: ${result.current?.id ?? "none"} (${result.current?.state ?? "COMPLETE"})`,
  );
  const gated = result.current && Number(result.current.id.slice(1)) >= 11;
  console.log(
    `Next eligible task: ${gated ? "none; AI phase requires explicit authorization" : (result.next?.id ?? "none")}`,
  );
  console.log(`Blocker: ${result.blocker ?? "none"}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
