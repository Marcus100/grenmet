/**
 * Embed addresses for Weather now media links. The CMS already allowlists
 * hosts; the site re-checks so an iframe is only ever built from a parsed,
 * known link, never from raw editor input.
 */
export type MediaKind = "video" | "audio";

const YOUTUBE_ID = /^[\w-]{6,20}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);
const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
]);
const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "on.soundcloud.com",
]);
const YOUTUBE_PATH = /^\/(?:shorts|live|embed)\/([\w-]+)/;

function youtubeId(url: URL): string | null {
  if (url.hostname === "youtu.be") return url.pathname.slice(1);
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null;
  return (
    url.searchParams.get("v") ?? url.pathname.match(YOUTUBE_PATH)?.[1] ?? null
  );
}

export interface MediaEmbed {
  /** Where the reader can open it instead. */
  href: string;
  provider: "YouTube" | "Facebook" | "SoundCloud";
  src: string;
}

export function mediaEmbed(
  kind: MediaKind,
  value: string | null
): MediaEmbed | null {
  if (!(value && URL.canParse(value))) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const href = url.toString();
  if (kind === "video") {
    const id = youtubeId(url);
    if (id && YOUTUBE_ID.test(id))
      return {
        provider: "YouTube",
        href,
        src: `https://www.youtube-nocookie.com/embed/${id}`,
      };
    if (FACEBOOK_HOSTS.has(url.hostname))
      return {
        provider: "Facebook",
        href,
        src: `https://www.facebook.com/plugins/video.php?show_text=false&href=${encodeURIComponent(href)}`,
      };
    return null;
  }
  return SOUNDCLOUD_HOSTS.has(url.hostname)
    ? {
        provider: "SoundCloud",
        href,
        src: `https://w.soundcloud.com/player/?visual=false&url=${encodeURIComponent(href)}`,
      }
    : null;
}
