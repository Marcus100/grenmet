import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ClickToLoadMedia } from "@/components/home/click-to-load-media";
import { mediaEmbed } from "@/lib/media-embed";

afterEach(cleanup);

it("loads nothing until the reader presses play, then moves focus to the player", () => {
  const embed = mediaEmbed(
    "video",
    "https://www.facebook.com/GrenadaMet/videos/123"
  );
  if (!embed) throw new Error("expected a Facebook embed");
  const { container } = render(
    <ClickToLoadMedia embed={embed} kind="video" title="Forecast briefing" />
  );

  expect(container.querySelector("iframe")).toBeNull();
  const play = screen.getByRole("button", {
    name: "Play video from Facebook",
  });
  expect(play).toHaveClass("focus-visible:ring-2");

  fireEvent.click(play);

  const frame = screen.getByTitle("Forecast briefing");
  expect(frame.tagName).toBe("IFRAME");
  expect(frame).toHaveAttribute("src", embed.src);
  expect(document.activeElement).toBe(frame);
});

it("plays SoundCloud audio through its player in an audio-sized frame", () => {
  const embed = mediaEmbed("audio", "https://soundcloud.com/gms/brief");
  if (!embed) throw new Error("expected a SoundCloud embed");
  render(<ClickToLoadMedia embed={embed} kind="audio" title="Morning brief" />);

  fireEvent.click(
    screen.getByRole("button", { name: "Play audio from SoundCloud" })
  );

  const frame = screen.getByTitle("Morning brief");
  expect(frame).toHaveAttribute("src", embed.src);
  expect(frame.className).toContain("h-[166px]");
});

it("builds no player for a refused URL, so no button or frame is shown", () => {
  for (const [kind, url] of [
    ["video", "https://www.facebook.com.evil.test/watch/123"],
    ["video", "http://www.facebook.com/GrenadaMet/videos/123"],
    ["audio", "https://www.facebook.com/GrenadaMet/videos/123"],
  ] as const) {
    expect(mediaEmbed(kind, url)).toBeNull();
  }
});

it("keeps focus where the reader put it when the parent re-renders", () => {
  const embed = mediaEmbed("audio", "https://soundcloud.com/gms/brief");
  if (!embed) throw new Error("expected a SoundCloud embed");
  const { rerender } = render(
    <>
      <ClickToLoadMedia embed={embed} kind="audio" title="Morning brief" />
      <button type="button">Next story</button>
    </>
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Play audio from SoundCloud" })
  );
  const next = screen.getByRole("button", { name: "Next story" });
  next.focus();
  expect(document.activeElement).toBe(next);

  rerender(
    <>
      <ClickToLoadMedia embed={embed} kind="audio" title="Morning brief" />
      <button type="button">Next story</button>
    </>
  );

  expect(document.activeElement).toBe(next);
});
