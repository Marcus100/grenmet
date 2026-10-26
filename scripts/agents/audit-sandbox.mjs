import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";

const UNSAFE_PATH = /[\s:]/;
function propertyPath(path) {
  if (!isAbsolute(path) || path === "/" || UNSAFE_PATH.test(path))
    throw new Error("Unsupported sandbox mount path");
  return path;
}
export function executable(name, env = process.env) {
  for (const directory of (env.PATH ?? "").split(delimiter)) {
    const path = join(directory, name);
    if (existsSync(path)) return { path, real: realpathSync(path) };
  }
  throw new Error("Required audit executable is unavailable");
}
export function buildAuditSandboxArgs(
  argv,
  {
    root,
    cwd = root,
    env,
    home,
    commonGitDir,
    readOnlyPaths = [],
    timeout = 6_000_000,
    nodeRuntime = resolve(dirname(process.execPath), ".."),
    uv = executable("uv"),
    resolver = realpathSync("/etc/resolv.conf"),
  } = {}
) {
  propertyPath(root);
  propertyPath(home);
  propertyPath(cwd);
  if (
    !(
      home.startsWith(`${root}/`) &&
      (cwd === root || cwd.startsWith(`${root}/`))
    )
  )
    throw new Error("Sandbox writes must remain in its own checkout");
  const args = [
    "--user",
    "--wait",
    "--pipe",
    "--collect",
    "--quiet",
    "--service-type=exec",
    `--working-directory=${cwd}`,
    "--property=Nice=15",
    "--property=CPUWeight=20",
    "--property=IOWeight=20",
    "--property=MemoryHigh=3G",
    "--property=ProtectHome=tmpfs",
    "--property=ProtectSystem=strict",
    "--property=PrivateTmp=yes",
    "--property=PrivateDevices=yes",
    "--property=PrivateUsers=yes",
    "--property=ProtectProc=invisible",
    "--property=ProcSubset=pid",
    "--property=NoNewPrivileges=yes",
    "--property=ProtectKernelTunables=yes",
    "--property=ProtectKernelModules=yes",
    "--property=ProtectControlGroups=yes",
    "--property=RestrictSUIDSGID=yes",
    `--property=RuntimeMaxSec=${Math.ceil(timeout / 1000)}`,
    "--property=TimeoutStopSec=30s",
    `--property=BindPaths=${root}`,
    `--property=ReadWritePaths=${root}`,
    `--property=BindReadOnlyPaths=${propertyPath(nodeRuntime)}`,
  ];
  for (const hidden of ["/mnt", "/media", "/run"])
    args.push(`--property=TemporaryFileSystem=${hidden}:ro`);
  if (
    ["/mnt/", "/media/", "/run/"].some((prefix) => resolver.startsWith(prefix))
  )
    args.push(`--property=BindReadOnlyPaths=${propertyPath(resolver)}`);
  for (const path of readOnlyPaths)
    args.push(`--property=BindReadOnlyPaths=${propertyPath(path)}`);
  if (commonGitDir)
    args.push(`--property=BindReadOnlyPaths=${propertyPath(commonGitDir)}`);
  args.push(
    `--property=BindReadOnlyPaths=${propertyPath(uv.real)}:${propertyPath(uv.path)}`
  );
  const isolated = {
    ...env,
    HOME: home,
    HUSKY: "0",
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_CONFIG_HOME: join(home, ".config"),
    COREPACK_HOME: join(home, ".cache/corepack"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  args.push(
    "/usr/bin/env",
    "-i",
    ...Object.entries(isolated).map(([key, value]) => `${key}=${value}`),
    ...argv
  );
  return args;
}
