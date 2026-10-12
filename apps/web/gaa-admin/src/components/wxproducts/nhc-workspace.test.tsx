import type { NhcContent, NhcJob, NhcPage } from "@barrelsgd/api-client";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NhcWorkspace } from "./nhc-workspace";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  report: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
vi.mock("@/lib/wxproducts/nhc-api", async (original) => ({
  ...(await original<typeof import("@/lib/wxproducts/nhc-api")>()),
  nhcRequest: mocks.request,
}));
vi.mock("./nhc-content", () => ({
  NhcContentView: ({ content }: { content: NhcContent }) => (
    <p>{content.text}</p>
  ),
  RecordTable: () => null,
}));

const job: NhcJob = {
  id: "f0ad6ea5-48a7-4d44-9c02-3cbad5423a75",
  kind: "pull",
  status: "queued",
  created_at: "2026-10-12T12:00:00Z",
};
const archive: NhcPage = {
  items: [
    {
      id: "cb95d558-8202-4c97-a29e-2194b14b7d2b",
      product_key: "nhc:twoat",
      title: "Atlantic outlook",
      family: "tropical_development",
      kind: "outlook",
      sha256: "a".repeat(64),
      first_received_at: "2026-10-12T12:00:00Z",
      status: "success",
      active: true,
      assets: [],
    },
  ],
  offset: 0,
  has_more: false,
};
const firstEdition = archive.items[0];
if (!firstEdition) throw new Error("Missing edition fixture");
const AUTHORING_LINK = /editor|prepare/i;
const EMPTY_ARCHIVE = /does not establish that no weather systems exist/;
const content: NhcContent = {
  edition: firstEdition,
  text: "Preserved source text",
  decoded: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue(content);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("pulls all four families by default and retains the current filters", async () => {
  mocks.request.mockResolvedValue(job);
  render(<NhcWorkspace archive={archive} query="family=marine&latest=false" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Pull latest NHC products" })
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith("pulls", expect.anything(), {
      families: [
        "tropical_development",
        "active_cyclones",
        "marine",
        "aviation_recon",
      ],
    })
  );
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining("family=marine&latest=false&request=")
    )
  );
  expect(
    screen.queryByRole("link", { name: AUTHORING_LINK })
  ).not.toBeInTheDocument();
});

it("keeps selected editions and comparison when filtering collected history", async () => {
  mocks.request.mockImplementation((path: string) =>
    Promise.resolve({
      ...content,
      edition: { ...content.edition, id: path.split("/")[1] },
    })
  );
  await act(async () =>
    render(
      <NhcWorkspace
        archive={archive}
        query="edition=selected&compare=first,second&latest=false&storm=al012026"
      />
    )
  );
  const form = screen
    .getByRole("button", { name: "Filter guidance" })
    .closest("form");
  expect(form).not.toBeNull();
  if (!form) throw new Error("Missing filter form");
  const fields = new FormData(form);
  expect(fields.get("edition")).toBe("selected");
  expect(fields.get("compare")).toBe("first,second");
  expect(fields.get("latest")).toBe("false");
  expect(fields.get("storm")).toBe("al012026");
});

it("retries reading a failed edition and leaves unknown issue times unknown", async () => {
  mocks.request
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockResolvedValue(content);
  render(
    <NhcWorkspace archive={archive} query={`edition=${content.edition.id}`} />
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Preserved source text")).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
});

it("retries a failed pull-status check without requesting another pull", async () => {
  vi.useFakeTimers();
  mocks.request
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockResolvedValue({ ...job, status: "partial" });
  render(<NhcWorkspace archive={archive} query={`request=${job.id}`} />);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not check pull progress"
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByText("Pull: partial")).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(
    mocks.request.mock.calls.every(([path]) => String(path).startsWith("jobs/"))
  ).toBe(true);
});

it("distinguishes an empty collected archive from a no-storm report", () => {
  render(
    <NhcWorkspace
      archive={{ items: [], offset: 0, has_more: false }}
      query=""
    />
  );
  expect(screen.getByText(EMPTY_ARCHIVE)).toBeInTheDocument();
});
