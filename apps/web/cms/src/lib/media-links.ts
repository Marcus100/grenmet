/** Hosts a Weather now post may embed; everything else is refused. */
export const MEDIA_HOSTS = {
  video: [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.facebook.com",
    "facebook.com",
    "fb.watch",
  ],
  audio: ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com"],
} as const;

export type MediaKind = keyof typeof MEDIA_HOSTS;

/** An https link on the allowlist for its kind, or a reason it is not. */
export function checkMediaLink(kind: MediaKind, value: string): true | string {
  if (!URL.canParse(value)) return "Paste the full link, starting https://";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    return "Use an https link.";
  const hosts: readonly string[] = MEDIA_HOSTS[kind];
  if (hosts.includes(url.hostname)) return true;
  return kind === "video"
    ? "Video links must be YouTube or Facebook."
    : "Audio links must be SoundCloud.";
}
