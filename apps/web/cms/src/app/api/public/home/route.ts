import { getPayload } from "payload";
import {
  findArticles,
  findDiscover,
  findHomepage,
  findLivePosts,
  findQuestions,
  findWeatherNow,
  LIVE_POST_KINDS,
  NO_STORE,
  toArticle,
  toQuestion,
  withPins,
} from "../../../../lib/public-feed";
import { reportError } from "../../../../lib/report-error";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

type Part<T> = { status: "ok"; items: T } | { status: "unavailable" };

async function part<T>(area: string, load: () => Promise<T>): Promise<Part<T>> {
  try {
    return { status: "ok", items: await load() };
  } catch (error) {
    reportError(error, `cms-public-home-${area}`);
    return { status: "unavailable" };
  }
}

/** The GMS desk row shows eight posts (`MAX_POSTS` in apps/web/gms desk-feed). */
const DESK_POSTS_LIMIT = 8;
/** Enough pins for the three leading posts and one picture per official card. */
const DESK_PINNED_LIMIT = 6;

const DEFAULT_SETTINGS = {
  leadStory: null,
  featuredQuestions: [],
  discoverCards: ["sky", "on-this-day", "quiz", "fact"],
  hiddenSections: [],
  exploreReading: {},
  sectionCopy: {},
};

/**
 * Everything the GMS homepage reads from the CMS in one anonymous call. Each
 * part fails on its own, so one broken section never hides the others.
 * Editor pins lead their sections; empty pins fall back to the newest.
 */
export async function GET() {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  try {
    payload = await getPayload({ config });
  } catch (error) {
    reportError(error, "cms-public-home");
    return Response.json(
      { error: "Content is unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
  // Settings failing must not hide content; fall back to defaults.
  const settings = await findHomepage(payload).catch((error: unknown) => {
    reportError(error, "cms-public-home-settings");
    return DEFAULT_SETTINGS;
  });
  const [
    deskUpdates,
    stories,
    questions,
    weatherNow,
    discover,
    reportNotes,
    livePosts,
  ] = await Promise.all([
    // The GMS row shows eight desk posts with the three newest pinned ones
    // leading, and an official card takes its picture from a pinned post about
    // it. Pinned posts (up to six) are fetched on their own so they always reach
    // the site, however old; the site decides which of them it shows.
    part("desk-updates", async () =>
      withPins(
        await findArticles(payload, "desk-updates", {
          limit: DESK_PINNED_LIMIT,
          pinnedOnly: true,
        }),
        await findArticles(payload, "desk-updates", {
          limit: DESK_POSTS_LIMIT,
        }),
        DESK_PINNED_LIMIT + DESK_POSTS_LIMIT
      )
    ),
    part("stories", async () =>
      withPins(
        settings.leadStory ? [toArticle("stories", settings.leadStory)] : [],
        // A lead plus six rows on the GMS homepage (owner, 1 Nov 2026).
        await findArticles(payload, "stories", { limit: 7 }),
        7
      )
    ),
    part("questions", async () =>
      withPins(
        settings.featuredQuestions.map(toQuestion),
        await findQuestions(payload, { limit: 5 }),
        5
      )
    ),
    part("weather-now", () => findWeatherNow(payload)),
    part("discover", () => findDiscover(payload)),
    part("report-notes", () =>
      findArticles(payload, "report-notes", { limit: 6 })
    ),
    // Newest five of each kind, so updates never crowd out videos.
    part("live-posts", async () =>
      (
        await Promise.all(
          LIVE_POST_KINDS.map((kind) => findLivePosts(payload, { kind }))
        )
      ).flat()
    ),
  ]);
  return Response.json(
    {
      deskUpdates,
      stories,
      questions,
      weatherNow,
      discover,
      reportNotes,
      livePosts,
      settings: {
        discoverCards: settings.discoverCards,
        hiddenSections: settings.hiddenSections,
        exploreReading: settings.exploreReading,
        sectionCopy: settings.sectionCopy,
      },
    },
    { headers: NO_STORE }
  );
}
