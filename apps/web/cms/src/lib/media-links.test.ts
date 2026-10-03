import { expect, it } from "vitest";
import { checkMediaLink } from "./media-links";

it.each([
  ["video", "https://www.youtube.com/watch?v=abc123"],
  ["video", "https://youtu.be/abc123"],
  ["video", "https://www.facebook.com/GrenadaMet/videos/123"],
  ["audio", "https://soundcloud.com/gms/morning-brief"],
] as const)("accepts a %s link on the allowlist: %s", (kind, url) => {
  expect(checkMediaLink(kind, url)).toBe(true);
});

it.each([
  ["video", "http://youtu.be/abc123"],
  ["video", "https://youtube.com.evil.test/watch?v=abc"],
  ["video", "https://user:pw@youtu.be/abc123"],
  ["video", "https://soundcloud.com/gms/clip"],
  ["audio", "https://youtu.be/abc123"],
  ["audio", "not a link"],
] as const)("refuses %s link %s", (kind, url) => {
  expect(checkMediaLink(kind, url)).toEqual(expect.any(String));
});
