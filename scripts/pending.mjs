console.error(
  `Required capability ${process.argv[2] ?? "unknown"} has not been implemented. See MILESTONES.md; this is a failure, not a pass.`,
);
process.exitCode = 1;
