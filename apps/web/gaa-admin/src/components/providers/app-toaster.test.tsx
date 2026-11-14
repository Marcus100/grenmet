import { readFileSync } from "node:fs";
import path from "node:path";
import { PreferencesStoreProvider } from "@barrelsgd/theme/components/preferences-provider";
import { act, cleanup, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect, it } from "vitest";
import { AppToaster } from "./app-toaster";

afterEach(() => {
  toast.dismiss();
  cleanup();
});

function renderToaster() {
  return render(
    <PreferencesStoreProvider
      contentLayout="centered"
      font="inter"
      navbarStyle="sticky"
      themeMode="light"
      themePreset="default"
    >
      <AppToaster />
    </PreferencesStoreProvider>
  );
}

it("shows a toast raised anywhere in the app", async () => {
  renderToaster();

  act(() => {
    toast.success("Punch approved");
  });

  expect(await screen.findByText("Punch approved")).toBeInTheDocument();
});

it("shows an error toast", async () => {
  renderToaster();

  act(() => {
    toast.error("You cannot approve your own punch");
  });

  expect(
    await screen.findByText("You cannot approve your own punch")
  ).toBeInTheDocument();
});

// Every module calls toast(); without the Toaster in the root layout none of
// those messages can appear. This guards the mount itself.
it("is mounted once in the root layout", () => {
  const layout = readFileSync(
    path.resolve(import.meta.dirname, "../../app/layout.tsx"),
    "utf8"
  );

  expect(layout.match(/<AppToaster \/>/gu)).toHaveLength(1);
});
