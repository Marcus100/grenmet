import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FeaturedLink } from "@/components/featured-link";
import { LinkedAlert } from "@/components/linked-alert";
import { fetchPublicAlert } from "@/lib/cap";
import type { RelatedLink } from "@/lib/cms";

vi.mock("@/lib/products", () => ({ fetchPublishedProduct: vi.fn() }));
vi.mock("@/lib/cap", () => ({ fetchPublicAlert: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const link = (overrides: Partial<RelatedLink>): RelatedLink => ({
  title: "Link",
  category: "article",
  url: "/x",
  type: "page",
  ref: "/weather/radar",
  isMain: true,
  ...overrides,
});
const alert = (overrides: Record<string, unknown> = {}) =>
  ({
    status: "ok",
    alert: {
      identifier: "GMS-1",
      lifecycle_state: "PUBLISHED",
      status: "Actual",
      sent: "2026-10-28T12:00:00Z",
      info: [
        {
          areas: [{ area_desc: "St. George" }],
          certainty: "Likely",
          description: "Heavy showers tonight.",
          event: "Heavy Rainfall Watch",
          expires: "2999-01-01T00:00:00Z",
          headline: "Heavy rainfall likely from tonight",
          language: "en",
          sequence: 0,
          severity: "Moderate",
        },
      ],
      ...overrides,
    },
  }) as never;

it("shows a GMS page as a card using the site's own menu title and description", () => {
  render(<FeaturedLink link={link({ ref: "/weather/radar" })} />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/weather/radar");
  expect(screen.getByText("Radar")).toBeInTheDocument();
  expect(
    screen.getByText("Rainfall over Grenada right now")
  ).toBeInTheDocument();
});

it("uses the editor's title for a page that is not in the menu", () => {
  render(
    <FeaturedLink
      link={link({ ref: "/weather/2026/10/28", title: "Wednesday" })}
    />
  );
  expect(screen.getByText("Wednesday")).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/weather/2026/10/28"
  );
});

it("hands a warning to the live warning card and leaves a product as a plain link", () => {
  const cap = FeaturedLink({ link: link({ type: "cap", ref: "GMS-1" }) });
  expect(cap).toMatchObject({
    type: LinkedAlert,
    props: { identifier: "GMS-1" },
  });
  const product = FeaturedLink({
    link: link({
      type: "product",
      ref: "0b3c6f1e-1111-4a2b-9c3d-222233334444",
    }),
  });
  expect(product).toBeNull();
});

it("shows nothing for an outside link, which cannot be the main link", () => {
  const { container } = render(
    <FeaturedLink
      link={link({ type: "link", ref: null, url: "https://example.test/" })}
    />
  );
  expect(container).toBeEmptyDOMElement();
});

it("shows a warning live, in effect, with its own page", async () => {
  vi.mocked(fetchPublicAlert).mockResolvedValue(alert());
  render(await LinkedAlert({ identifier: "GMS-1" }));
  expect(fetchPublicAlert).toHaveBeenCalledWith("GMS-1");
  expect(screen.getByText("In effect")).toBeInTheDocument();
  expect(
    screen.getByText("Heavy rainfall likely from tonight")
  ).toBeInTheDocument();
  expect(screen.getByText("St. George")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Read the warning" })
  ).toHaveAttribute("href", "/alerts/GMS-1");
});

it("says an ended warning has ended, and says so when it is gone or unreachable", async () => {
  vi.mocked(fetchPublicAlert).mockResolvedValue(
    alert({ lifecycle_state: "EXPIRED" })
  );
  render(await LinkedAlert({ identifier: "GMS-1" }));
  expect(screen.getByText("Ended")).toBeInTheDocument();
  cleanup();
  vi.mocked(fetchPublicAlert).mockResolvedValue({ status: "not-found" });
  render(await LinkedAlert({ identifier: "GMS-1" }));
  expect(screen.getByRole("status")).toHaveTextContent("no longer published");
  cleanup();
  vi.mocked(fetchPublicAlert).mockResolvedValue({ status: "unavailable" });
  render(await LinkedAlert({ identifier: "GMS-1" }));
  expect(screen.getByRole("status")).toHaveTextContent("can't be loaded");
});
