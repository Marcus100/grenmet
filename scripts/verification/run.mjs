import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyManaged } from "./managed.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let interrupted = false;
let active;
function stop() {
  interrupted = true;
  if (!active?.pid) return;
  try {
    if (process.platform === "win32") active.kill("SIGTERM");
    else process.kill(-active.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function run(command, args, env, capture = false, cleanup = false) {
  if (interrupted && !cleanup)
    return Promise.reject(new Error("Verification interrupted"));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      detached: process.platform !== "win32",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (!cleanup) active = child;
    let output = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      // Do not echo diagnostic streams that could contain credentials.
      child.stderr.resume();
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (active === child) active = undefined;
      if (code !== 0 || (interrupted && !cleanup)) {
        reject(new Error(`${command} failed (${code ?? "interrupted"})`));
      } else resolve(output.trim());
    });
  });
}
try {
  await verifyManaged(process.argv[2], {
    run,
    inContainer: existsSync("/.dockerenv"),
    env: process.env,
    log: (message) => console.log(message),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
