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

export function Guides() {
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
