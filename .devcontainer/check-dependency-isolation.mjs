import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";

const paths = readFileSync(
  new URL("./dependency-volumes.txt", import.meta.url),
  "utf8"
)
  .trim()
  .split("\n");
const configText = readFileSync(
  new URL("./devcontainer.json", import.meta.url),
  "utf8"
);
// This file uses full-line comments; avoid importing packages before installation.
const config = JSON.parse(
  configText
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
);
// biome-ignore lint/style/noProcessEnv: standalone pre-install container configuration check.
const mirror = process.env.GRENMET_HOST_WORKSPACE;
if (!mirror || mirror === "/workspace") {
  throw new Error(
    "GRENMET_HOST_WORKSPACE must identify the separate host-path mirror. Rebuild the dev container."
  );
}
const mounts = new Map(
  readFileSync("/proc/self/mountinfo", "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split(" ");
      return [
        fields[4].replaceAll("\\040", " ").replaceAll("\\134", "\\"),
        `${fields[2]}:${fields[3]}`,
      ];
    })
);
if (process.argv.includes("--diagnose")) {
  // biome-ignore lint/suspicious/noConsole: diagnostic output contains only mount metadata.
  console.log(
    JSON.stringify(
      {
        container: hostname(),
        mirror,
        mounts: [...mounts].filter(
          ([path]) => path.includes("node_modules") || path.endsWith("/.turbo")
        ),
      },
      null,
      2
    )
  );
}
for (const relative of paths) {
  const primary = resolve("/workspace", relative);
  const alias = resolve(mirror, relative);
  if (
    !(
      mounts.has(primary) &&
      mounts.has(alias) &&
      mounts.get(primary) === mounts.get(alias)
    )
  ) {
    throw new Error(
      `Container ${hostname()}: missing matching isolated mounts for ${relative}. Do not run pnpm here. Use --diagnose to inspect live mounts; verify the active container before restarting or rebuilding it.`
    );
  }
  if (
    !config.mounts.some((mount) =>
      mount.includes(`target=/workspace/${relative},type=volume,volume-nocopy`)
    )
  ) {
    throw new Error(`Missing container volume configuration for ${relative}`);
  }
}
// biome-ignore lint/suspicious/noConsole: user-facing startup verification result.
console.log(
  "Container dependency and build-cache mounts are isolated from the host."
);
