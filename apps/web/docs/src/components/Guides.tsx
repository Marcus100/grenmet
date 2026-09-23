import { Button } from "@/components/Button";
import { Heading } from "@/components/Heading";

const guides = [
  {
    href: "/objectives",
    name: "Objectives",
    description:
      "Review the overall goals and expected outcomes of the hurricane plan.",
  },
  {
    href: "/forecast-for-season",
    name: "Forecast for season",
    description:
      "Review the seasonal outlook and planning assumptions used for readiness.",
  },
  {
    href: "/useful-terms-definitions",
    name: "Useful terms and definitions",
    description:
      "Use a shared vocabulary to keep coordination and communications consistent.",
  },
  {
    href: "/special-operating-procedures/met-department",
    name: "Special operating procedures",
    description:
      "See the special operating procedures defined for the Met Department.",
  },
];

export function Guides({ catalogue = false }: { catalogue?: boolean }) {
  if (catalogue) {
    return (
      <div className="not-prose my-10 grid gap-10 sm:grid-cols-2">
        {[
          {
            href: "/hurricane-plan",
            title: "Tropical Cyclone Emergency Plan",
            category: "Preparedness & response",
            edition: "2024 plan",
            description:
              "Department responsibilities, preparations and actions before, during and after a tropical cyclone.",
            cover: "Prepare. Respond. Recover.",
            tone: "bg-gm-navy text-gm-text-inverse",
          },
          {
            href: "/quickstart",
            title: "GMS Staff Guide",
            category: "Working with our tools",
            edition: "September 2026 · evolving guide",
            description:
              "Practical guidance for weather products, observations, alerts and staff administration.",
            cover: "Your work. Your tools. One guide.",
            tone: "bg-gm-surface-panel text-gm-text",
          },
        ].map((document) => (
          <div className="space-y-4" key={document.href}>
            <div
              aria-hidden="true"
              className={`flex aspect-[4/3] flex-col justify-between rounded-lg p-8 ${document.tone}`}
            >
              <span className="text-sm">GRENADA METEOROLOGICAL SERVICE</span>
              <p className="max-w-xs font-semibold text-heading-lg">
                {document.cover}
              </p>
              <span className="text-sm">{document.edition}</span>
            </div>
            <p className="text-gm-text-muted text-sm">{document.category}</p>
            <h3 className="font-semibold text-gm-text text-heading-sm">
              {document.title}
            </h3>
            <p className="text-body text-gm-text-muted">
              {document.description}
            </p>
            <Button arrow="right" href={document.href} variant="text">
              Read document<span className="sr-only">: {document.title}</span>
            </Button>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="my-16 xl:max-w-none">
      <Heading id="plan-chapters" level={2}>
        Plan chapters
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-zinc-900/5 border-t pt-10 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.description}
            </p>
            <p className="mt-4">
              <Button arrow="right" href={guide.href} variant="text">
                Read more
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
