#!/usr/bin/env node
import { spawnSync } from "node:child_process";
// Creates a new phone app in apps/pwa/<name> on the shared kit
// (packages/pwa-kit) and registers it everywhere the repository lists
// workspaces: the root dev script, every web Dockerfile, the dev container
// volumes and docs/ports.md.
//
// Usage:
//   pnpm new:pwa <name> --port <port> --title "<App name>"
//     [--short "<Home-screen label>"] [--accent "#rrggbb"]
//     [--site https://<name>.barrels.gd] [--scanner] [--public]
//
// --scanner  the app reads barcodes with the camera (allows the camera and
//            copies the barcode reader's WebAssembly file before dev and build)
// --public   search engines may list the app (staff tools are hidden by default)
//
// Then run `pnpm install` and `pnpm dev:pwa:<name>`.
import {
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import * as t from "./templates.mjs";

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}$/u;
// The name goes into code and page text as written; these would break it.
const UNSAFE_TEXT = /["'`\\{}<>]/u;
const HEX_PATTERN = /^#[0-9a-f]{6}$/iu;
const PORT_ROW = /^\|\s*(\d{4,5})\s*\|/u;
const RESERVED_STATUS = /\|\s*Reserved[^|]*\|\s*$/u;
const DEV_PWA_SCRIPT = /^ {4}"dev:pwa:/u;
const PWA_MAP_ROW = /^\| `apps\/pwa\/<app>\/AGENTS\.md` \|/u;
const ROW_END = / \|$/u;
const DOCKER_PWA_COPY = /^COPY apps\/pwa\/[a-z0-9-]+\/package\.json /u;
const PWA_NODE_MODULES = /^apps\/pwa\/[a-z0-9-]+\/node_modules$/u;
const PWA_NEXT_CACHE = /^apps\/pwa\/[a-z0-9-]+\/\.next$/u;
const BACKGROUND = "#ffffff";
const DEFAULT_ACCENT = "#1d4ed8";

export class UsageError extends Error {}

/** Reads the command line into a checked plan. Throws UsageError on bad input. */
export function readOptions(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      port: { type: "string" },
      title: { type: "string" },
      short: { type: "string" },
      accent: { type: "string", default: DEFAULT_ACCENT },
      site: { type: "string" },
      scanner: { type: "boolean", default: false },
      public: { type: "boolean", default: false },
      root: { type: "string" },
    },
  });
  const [name] = positionals;
  if (!(name && NAME_PATTERN.test(name))) {
    throw new UsageError(
      "Give the app a folder name: lowercase letters, digits and dashes, such as bus."
    );
  }
  const port = Number(values.port);
  if (!(Number.isInteger(port) && port >= 3000 && port <= 3099)) {
    throw new UsageError(
      "Give a free dev port from docs/ports.md with --port, such as --port 3062."
    );
  }
  if (!values.title?.trim()) {
    throw new UsageError(
      'Give the app its name with --title, such as --title "GAA Bus".'
    );
  }
  for (const [flag, value] of [
    ["--title", values.title],
    ["--short", values.short ?? ""],
  ]) {
    if (UNSAFE_TEXT.test(value)) {
      throw new UsageError(
        `${flag} cannot contain quotes, backslashes, braces, angle brackets or backticks.`
      );
    }
  }
  if (!HEX_PATTERN.test(values.accent)) {
    throw new UsageError("--accent must be a colour like #1d4ed8.");
  }
  const site = values.site ?? `https://${name}.barrels.gd`;
  try {
    if (new URL(site).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new UsageError("--site must be an https address.");
  }
  return {
    name,
    port,
    title: values.title.trim(),
    short: (values.short ?? values.title).trim(),
    accent: values.accent.toLowerCase(),
    site: new URL(site).origin,
    scanner: values.scanner,
    public: values.public,
    /** True when writing into another folder, such as a test's copy. */
    custom: Boolean(values.root),
    root: values.root
      ? resolve(values.root)
      : fileURLToPath(new URL("../..", import.meta.url)),
  };
}

/** Black or white, whichever reads better on the given colour. */
export function textOn(hex) {
  const channel = (offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Contrast against white versus against black.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05
    ? "#ffffff"
    : "#000000";
}

/** A plain square PNG in one colour: a placeholder icon until real artwork. */
export function solidPng(size, hex) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rgb = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  );
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) row.set(rgb, 1 + x * 3);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fill(template, plan) {
  const values = {
    __NAME__: plan.name,
    __TITLE__: plan.title,
    __SHORT__: plan.short,
    __PORT__: String(plan.port),
    __SITE__: plan.site,
    __BACKGROUND__: BACKGROUND,
    __ACCENT__: plan.accent,
    __ON_ACCENT__: textOn(plan.accent),
    __ROBOTS__: plan.public ? t.ROBOTS_PUBLIC : t.ROBOTS_PRIVATE,
    __CAMERA__: plan.scanner ? "(self)" : "()",
    __WASM__: plan.scanner ? " 'wasm-unsafe-eval'" : "",
  };
  return template.replace(/__[A-Z_]+__/gu, (key) => values[key] ?? key);
}

function packageJson(plan) {
  const copy = plan.scanner ? "pwa-kit-copy-zxing && " : "";
  return {
    name: `@barrelsgd/pwa-${plan.name}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: `${copy}next dev --turbopack --port ${plan.port}`,
      build: `${copy}next build`,
      lint: "biome lint .",
      "lint:fix": "biome lint --write .",
      format: "biome format --write .",
      check: "biome check .",
      "check:fix": "biome check --write .",
      "check:ci": "biome ci .",
      "type-check":
        "rm -f next-env.d.ts && rm -rf .next/dev/types && next typegen && tsc --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
    },
    dependencies: {
      "@barrelsgd/pwa-kit": "workspace:*",
      "@barrelsgd/ui": "workspace:*",
      next: "catalog:",
      react: "catalog:",
      "react-dom": "catalog:",
    },
    devDependencies: {
      "@barrelsgd/tsconfig": "workspace:*",
      "@tailwindcss/postcss": "catalog:",
      "@testing-library/dom": "catalog:",
      "@testing-library/jest-dom": "catalog:",
      "@testing-library/react": "catalog:",
      "@types/node": "catalog:",
      "@types/react": "catalog:",
      "@types/react-dom": "catalog:",
      "babel-plugin-react-compiler": "catalog:",
      jsdom: "catalog:",
      tailwindcss: "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
    },
    engines: { node: "24.x" },
  };
}

/** Every file of the new app, as [relative path, contents]. */
export function appFiles(plan) {
  const text = [
    ["package.json", `${JSON.stringify(packageJson(plan), null, 2)}\n`],
    ["AGENTS.md", fill(t.AGENTS, plan)],
    [".gitignore", t.GITIGNORE + (plan.scanner ? t.GITIGNORE_SCANNER : "")],
    ["next.config.ts", t.NEXT_CONFIG],
    ["postcss.config.mjs", t.POSTCSS_CONFIG],
    ["tsconfig.json", t.TSCONFIG],
    ["vitest.config.ts", t.VITEST_CONFIG],
    ["public/_headers", fill(t.HEADERS, plan)],
    ["src/env.ts", fill(t.ENV, plan)],
    ["src/env.test.ts", fill(t.ENV_TEST, plan)],
    ["src/app/layout.tsx", fill(t.LAYOUT, plan)],
    ["src/app/page.tsx", t.PAGE],
    ["src/app/manifest.ts", fill(t.MANIFEST, plan)],
    ["src/app/manifest.test.ts", t.MANIFEST_TEST],
    ["src/components/home.tsx", fill(t.HOME, plan)],
    ["src/components/home.test.tsx", fill(t.HOME_TEST, plan)],
    ["src/styles/app.css", fill(t.APP_CSS, plan)],
    ["src/test/setup.ts", t.TEST_SETUP],
  ];
  const icons = [
    ["public/icons/icon-192.png", solidPng(192, plan.accent)],
    ["public/icons/icon-512.png", solidPng(512, plan.accent)],
    ["public/icons/icon-maskable-512.png", solidPng(512, plan.accent)],
    ["public/icons/apple-touch-icon.png", solidPng(180, plan.accent)],
  ];
  return [...text, ...icons];
}

/** Inserts `line` after the last line matching `after`, unless it is there. */
function insertAfterLast(source, after, line, where) {
  if (source.includes(line)) return source;
  const lines = source.split("\n");
  const index = lines.findLastIndex((candidate) => after.test(candidate));
  if (index < 0)
    throw new Error(`${where}: found no line to place "${line.trim()}" after`);
  lines.splice(index + 1, 0, line);
  return lines.join("\n");
}

/** The repository files that list every app, with the new app added. */
export function registrations(plan) {
  const { name, root } = plan;
  const read = (path) => readFileSync(join(root, path), "utf8");
  const edits = new Map();
  const edit = (path, change) =>
    edits.set(path, change(edits.get(path) ?? read(path)));

  edit("package.json", (source) =>
    insertAfterLast(
      source,
      DEV_PWA_SCRIPT,
      `    "dev:pwa:${name}": "turbo run dev --filter=@barrelsgd/pwa-${name}",`,
      "package.json"
    )
  );

  for (const dockerfile of globSync("apps/web/*/Dockerfile", {
    cwd: root,
  }).sort()) {
    edit(dockerfile, (source) =>
      insertAfterLast(
        source,
        DOCKER_PWA_COPY,
        `COPY apps/pwa/${name}/package.json apps/pwa/${name}/`,
        dockerfile
      )
    );
  }

  edit(".devcontainer/dependency-volumes.txt", (source) =>
    insertAfterLast(
      insertAfterLast(
        source,
        PWA_NODE_MODULES,
        `apps/pwa/${name}/node_modules`,
        "dependency-volumes.txt"
      ),
      PWA_NEXT_CACHE,
      `apps/pwa/${name}/.next`,
      "dependency-volumes.txt"
    )
  );

  const mount = (suffix, folder) => [
    `    "source=grenmet-\${devcontainerId}-apps-pwa-${name}-${suffix},target=/workspace/apps/pwa/${name}/${folder},type=volume,volume-nocopy",`,
    `    "source=grenmet-\${devcontainerId}-apps-pwa-${name}-${suffix},target=\${localWorkspaceFolder}/apps/pwa/${name}/${folder},type=volume,volume-nocopy",`,
  ];
  edit(".devcontainer/devcontainer.json", (source) => {
    let next = source;
    for (const [suffix, folder] of [
      ["node_modules", "node_modules"],
      ["next", ".next"],
    ]) {
      const after = new RegExp(
        `apps-pwa-[a-z0-9-]+-${suffix},target=\\$\\{localWorkspaceFolder\\}`,
        "u"
      );
      const [inside, outside] = mount(suffix, folder);
      next = insertAfterLast(next, after, inside, "devcontainer.json");
      next = insertAfterLast(
        next,
        new RegExp(`apps-pwa-${name}-${suffix},target=/workspace`, "u"),
        outside,
        "devcontainer.json"
      );
    }
    return next;
  });

  edit("docs/ports.md", (source) => portsWithApp(source, plan));

  // The root instruction map must name every nested AGENTS.md. Only the name
  // is added: the root file sits at the Codex instruction byte budget.
  edit("AGENTS.md", (source) => {
    const lines = source.split("\n");
    const index = lines.findIndex((line) => PWA_MAP_ROW.test(line));
    if (index < 0) {
      throw new Error(
        "AGENTS.md: no apps/pwa/<app> row in the instruction map"
      );
    }
    lines[index] = lines[index].replace(ROW_END, `, ${name} |`);
    return lines.join("\n");
  });
  return edits;
}

/** docs/ports.md with the app on its port: a Reserved row is taken over. */
export function portsWithApp(markdown, plan) {
  const row = `| ${plan.port} | \`@barrelsgd/pwa-${plan.name}\` (${plan.title} PWA, \`apps/pwa/${plan.name}\`) | Built, dev only; not deployed |`;
  const start = markdown.indexOf("### Reserved and planned");
  if (start < 0)
    throw new Error("docs/ports.md: no Reserved and planned table");
  const lines = markdown.split("\n");
  let line = markdown.slice(0, start).split("\n").length - 1;
  let insertAt = -1;
  for (
    ;
    line < lines.length && !lines[line].startsWith("### Retired");
    line += 1
  ) {
    const match = PORT_ROW.exec(lines[line]);
    if (!match) continue;
    const port = Number(match[1]);
    if (port === plan.port) {
      if (!RESERVED_STATUS.test(lines[line])) {
        throw new UsageError(
          `Port ${plan.port} is already in use: ${lines[line]}`
        );
      }
      lines[line] = row;
      return lines.join("\n");
    }
    if (port < plan.port) insertAt = line + 1;
  }
  // A web app with the port sits in an earlier table, in any column.
  if (
    new RegExp(`\\|\\s*${plan.port}\\s*\\|`, "u").test(markdown.slice(0, start))
  ) {
    throw new UsageError(
      `Port ${plan.port} is already used by a web app in docs/ports.md.`
    );
  }
  if (insertAt < 0)
    throw new Error("docs/ports.md: could not place the new row");
  lines.splice(insertAt, 0, row);
  return lines.join("\n");
}

/**
 * Lays the new files out in the repository's style (a long app name can push
 * a line past the width). Best effort: an unformatted file still works.
 */
function formatApp(plan) {
  spawnSync(
    "pnpm",
    ["exec", "biome", "format", "--write", `apps/pwa/${plan.name}`],
    { cwd: plan.root, stdio: "ignore" }
  );
}

export function createApp(plan) {
  const folder = join(plan.root, "apps/pwa", plan.name);
  if (existsSync(folder)) {
    throw new UsageError(`apps/pwa/${plan.name} already exists.`);
  }
  const edits = registrations(plan);
  for (const [path, contents] of appFiles(plan)) {
    const target = join(folder, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  for (const [path, contents] of edits) {
    writeFileSync(join(plan.root, path), contents);
  }
  return { folder, changed: [...edits.keys()] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const plan = readOptions(process.argv.slice(2));
    const { changed } = createApp(plan);
    console.log(
      `Created apps/pwa/${plan.name} (@barrelsgd/pwa-${plan.name}) on port ${plan.port}.`
    );
    console.log(`Registered it in ${changed.length} files.`);
    if (!plan.custom) {
      formatApp(plan);
    }
    console.log(`Next: pnpm install, then pnpm dev:pwa:${plan.name}`);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
