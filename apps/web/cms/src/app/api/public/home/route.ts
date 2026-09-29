import { getPayload } from "payload";
import {
  findArticles,
  findHomepage,
  findQuestions,
  findWeatherNow,
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

const DEFAULT_SETTINGS = {
  leadStory: null,
  featuredQuestions: [],
  featuredPublication: null,
  discoverCards: ["sky", "on-this-day", "quiz", "fact"],
  hiddenSections: [],
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
  const [deskUpdates, stories, publications, questions, weatherNow] =
    await Promise.all([
      part("desk-updates", () =>
        findArticles(payload, "desk-updates", { limit: 5 })
      ),
      part("stories", async () =>
        withPins(
          settings.leadStory ? [toArticle("stories", settings.leadStory)] : [],
          await findArticles(payload, "stories", { limit: 5 }),
          5
        )
      ),
      part("publications", async () =>
        withPins(
          settings.featuredPublication
            ? [toArticle("publications", settings.featuredPublication)]
            : [],
          await findArticles(payload, "publications", { limit: 6 }),
          6
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
    ]);
  return Response.json(
    {
      deskUpdates,
      stories,
      publications,
      questions,
      weatherNow,
      settings: {
        discoverCards: settings.discoverCards,
        hiddenSections: settings.hiddenSections,
      },
    },
    { headers: NO_STORE }
  );
}
