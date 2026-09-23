import { Button } from "@/components/Button";
import { Heading } from "@/components/Heading";

const libraries = [
  {
    href: "/messages",
    name: "Forecasts and bulletins",
    description:
      "Prepare a draft, review the preview and check the published issue.",
  },
  {
    href: "/conversations",
    name: "CAP alerts",
    description:
      "Compose an alert and follow its validation, review and publication workflow.",
  },
  {
    href: "/quickstart",
    name: "wxRegister and aviation",
    description:
      "Enter observations and save aviation drafts; distinguish preparation from transmission.",
  },
  {
    href: "/contacts",
    name: "Staff and duty roster",
    description: "Find colleagues and check your roster and staff workflows.",
  },
  {
    href: "/attachments",
    name: "Documents and forms",
    description:
      "Find the available staff forms and operational reference documents.",
  },
];
export function Libraries() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading id="gms-tools" level={2}>
        Tool guides
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-6 border-t pt-10 sm:grid-cols-2 xl:grid-cols-3">
        {libraries.map((library) => (
          <div key={library.name}>
            <h3 className="font-semibold text-foreground text-sm">
              {library.name}
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              {library.description}
            </p>
            <p className="mt-4">
              <Button arrow="right" href={library.href} variant="text">
                Read guide
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
