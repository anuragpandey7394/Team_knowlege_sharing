import { spawn } from "node:child_process";
const children = ["@tka/api", "@tka/web"].map((workspace) =>
  spawn("npm", ["run", "dev", "--workspace", workspace], { stdio: "inherit" }),
);
function stop(signal = "SIGTERM") {
  for (const child of children) child.kill(signal);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && !signal) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
}
