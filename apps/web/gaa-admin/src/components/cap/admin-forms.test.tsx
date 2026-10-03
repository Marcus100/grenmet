import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  createFeed: vi.fn(),
  updateFeed: vi.fn(),
  deleteFeed: vi.fn(),
  importAlert: vi.fn(),
  createArea: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@barrelsgd/api-client", () => ({
  capUpdateCapSettings: (args: unknown) => ({
    unwrap: () => mocks.settings(args),
  }),
  capCreateFeed: (args: unknown) => ({ unwrap: () => mocks.createFeed(args) }),
  capUpdateFeed: (args: unknown) => ({ unwrap: () => mocks.updateFeed(args) }),
  capDeleteFeed: (args: unknown) => ({ unwrap: () => mocks.deleteFeed(args) }),
  capImportAlert: (args: unknown) => ({
    unwrap: () => mocks.importAlert(args),
  }),
  capCreatePredefinedArea: (args: unknown) => ({
    unwrap: () => mocks.createArea(args),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("./area-picker", () => ({
  AreaPicker: ({
    onAreasChange,
  }: {
    onAreasChange: (areas: unknown[]) => void;
  }) => (
    <button
      onClick={() =>
        onAreasChange([
          {
            area_desc: "St George",
            geocodes: [{ value_name: "parish", value: "George" }],
          },
        ])
      }
      type="button"
    >
      Choose area
    </button>
  ),
}));

import { CapFeedManager } from "./feed-manager";
import { CapImportForm } from "./import-form";
import { PredefinedAreaManager } from "./predefined-area-manager";
import { CapSettingsEditor } from "./settings-editor";

const settings = {
  id: "settings",
  sender: "GMS",
  sender_name: "Met Office",
  feed_limit: 100,
  signing_enabled: false,
  created_at: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z",
};
const feed = {
  id: "feed",
  name: "Partner",
  url: "https://example.org/cap",
  status: "ACTIVE" as const,
  created_at: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z",
};
beforeEach(() => vi.resetAllMocks());

it("saves sender settings and reports success only after the API succeeds", async () => {
  mocks.settings.mockResolvedValue(settings);
  render(<CapSettingsEditor initial={settings} />);
  fireEvent.change(screen.getByLabelText("Sender name"), {
    target: { value: "GMS Operations" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(mocks.settings).toHaveBeenCalledWith({
      body: expect.objectContaining({
        sender_name: "GMS Operations",
        feed_limit: 100,
        signing_enabled: false,
      }),
    })
  );
  expect(await screen.findByRole("status")).toHaveTextContent("saved");
});

it("keeps settings failures visible and does not refresh as if saved", async () => {
  mocks.settings.mockRejectedValue(new Error("Forbidden"));
  render(<CapSettingsEditor initial={settings} />);
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "not confirmed saved"
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("requires explicit confirmation before deleting a feed", async () => {
  mocks.deleteFeed.mockResolvedValue(undefined);
  render(<CapFeedManager feeds={[feed]} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete feed" }));
  expect(mocks.deleteFeed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() =>
    expect(mocks.deleteFeed).toHaveBeenCalledWith({ path: { feed_id: "feed" } })
  );
});

it("creates a feed from the form without issuing an update", async () => {
  mocks.createFeed.mockResolvedValue(feed);
  render(<CapFeedManager feeds={[]} />);
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Partner" },
  });
  fireEvent.change(screen.getByLabelText("Feed URL"), {
    target: { value: feed.url },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save feed" }));
  await waitFor(() =>
    expect(mocks.createFeed).toHaveBeenCalledWith({
      body: { name: "Partner", url: feed.url },
    })
  );
  expect(mocks.updateFeed).not.toHaveBeenCalled();
});

it("invalidates import confirmation on source edit and opens the saved review workflow", async () => {
  mocks.importAlert.mockResolvedValue({ id: "saved-alert" });
  render(<CapImportForm />);
  fireEvent.change(screen.getByLabelText("CAP XML"), {
    target: { value: "<alert />" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("CAP XML"), {
    target: { value: "<alert>changed</alert>" },
  });
  expect(
    screen.getByRole("button", { name: "Import for review" })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Import for review" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/cap/admin/saved-alert")
  );
  expect(mocks.importAlert).toHaveBeenCalledWith({
    body: { source: "xml", value: "<alert>changed</alert>" },
  });
});

it("requires a geographic selection before saving a predefined area", async () => {
  mocks.createArea.mockResolvedValue({ id: "area" });
  render(<PredefinedAreaManager areas={[]} />);
  fireEvent.change(screen.getByLabelText("Area name"), {
    target: { value: "South" },
  });
  expect(
    screen.getByRole("button", { name: "Create predefined area" })
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Choose area" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Create predefined area" })
  );
  await waitFor(() =>
    expect(mocks.createArea).toHaveBeenCalledWith({
      body: expect.objectContaining({
        name: "South",
        area_desc: "St George",
        geocodes: [{ value_name: "parish", value: "George" }],
      }),
    })
  );
});
