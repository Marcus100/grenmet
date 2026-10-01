import { expect, it } from "vitest";
import { mediaEmbed } from "@/lib/media-embed";

it.each([
  [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ],
  [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ],
  [
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ],
])("embeds YouTube %s privately", (url, src) => {
  expect(mediaEmbed("video", url)).toMatchObject({ provider: "YouTube", src });
});

it("embeds Facebook video and SoundCloud audio through their players", () => {
  expect(
    mediaEmbed("video", "https://www.facebook.com/GrenadaMet/videos/123")?.src
  ).toBe(
    "https://www.facebook.com/plugins/video.php?show_text=false&href=https%3A%2F%2Fwww.facebook.com%2FGrenadaMet%2Fvideos%2F123"
  );
  expect(
    mediaEmbed("audio", "https://soundcloud.com/gms/brief")?.provider
  ).toBe("SoundCloud");
});

it.each([
  ["video", "http://youtu.be/dQw4w9WgXcQ"],
  ["video", "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"],
  ["video", "https://youtu.be/<script>"],
  ["video", "https://soundcloud.com/gms/brief"],
  ["audio", "https://youtu.be/dQw4w9WgXcQ"],
  ["audio", null],
] as const)("refuses %s %s", (kind, url) => {
  expect(mediaEmbed(kind, url)).toBeNull();
});
