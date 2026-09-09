import type { WeatherImage } from "@/db/wxwatch/schema";
import { relativeTime, summarizeImagery } from "./home-data";
import { loadImagery } from "./home-loaders";
import { ImageryStrip } from "./imagery-strip";
import { Panel, PanelEmpty, PanelUnavailable } from "./panel";

const MAX_FRAMES = 8;

/** Newest frame per source — the strip shows breadth (every source), not a
 *  single source's timeline; that is what /wxwatch is for. */
function latestPerSource(
  groups: Awaited<ReturnType<typeof loadImagery>> & { ok: true }
): WeatherImage[] {
  return groups.data
    .map((group) => {
      const images = Object.values(group.synopticImages).filter(
        (image): image is WeatherImage => image !== null
      );
      return images.at(-1) ?? null;
    })
    .filter((image): image is WeatherImage => image !== null)
    .slice(0, MAX_FRAMES);
}

export async function ImageryPanel({ className }: { className?: string }) {
  const imagery = await loadImagery();

  if (!imagery.ok) {
    return (
      <Panel
        className={className}
        description="Latest satellite and model frames"
        title="WxWatch imagery"
      >
        <PanelUnavailable message={imagery.message} />
      </Panel>
    );
  }

  const summary = summarizeImagery(imagery.data);
  const frames = latestPerSource(imagery);

  return (
    <Panel
      action={{ href: "/wxwatch", label: "Open gallery" }}
      className={className}
      description={`${summary.captured} of ${summary.expected} synoptic slots captured — latest ${relativeTime(summary.latest?.observationTime)}`}
      title="WxWatch imagery"
    >
      {frames.length === 0 ? (
        <PanelEmpty>No imagery collected yet today.</PanelEmpty>
      ) : (
        <ImageryStrip images={frames} />
      )}
    </Panel>
  );
}
