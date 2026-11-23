const DESK_SECTIONS = new Set([
  "profiles",
  "settings",
  "areas",
  "feeds",
  "import",
  "audit",
  "integrations",
]);

const ADMIN_ALERT =
  /^\/cap\/admin\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;
const PUBLIC_ALERT = /^\/cap\/alerts\/([^/]+)$/u;
const TRAILING_SLASH = /\/$/u;

function deskPath(pathname: string): string {
  const path = pathname.replace(TRAILING_SLASH, "");
  const section = path.slice("/cap/".length);
  if (DESK_SECTIONS.has(section)) return `/${section}`;
  if (path === "/cap/admin/new") return "/new";

  const id = ADMIN_ALERT.exec(path)?.[1];
  if (id) return `/alerts/${id.toLowerCase()}`;

  const identifier = PUBLIC_ALERT.exec(path)?.[1];
  if (identifier) {
    try {
      return `/alerts/by-identifier/${encodeURIComponent(decodeURIComponent(identifier))}`;
    } catch {
      // Malformed encoded identifiers fall back to the desk board.
    }
  }

  return "";
}

export function capDeskDestination(
  pathname: string,
  deskUrl: string | undefined
): URL | null {
  if (!(deskUrl && (pathname === "/cap" || pathname.startsWith("/cap/")))) {
    return null;
  }

  const target = new URL(deskUrl);
  target.pathname = `${target.pathname.replace(TRAILING_SLASH, "")}${deskPath(pathname)}`;
  return target;
}

export function capDeskHref(
  pathname: string,
  deskUrl: string | undefined
): string {
  return capDeskDestination(pathname, deskUrl)?.href ?? pathname;
}
