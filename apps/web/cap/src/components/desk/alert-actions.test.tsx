import type { CapAlertPublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeskPermissions } from "@/lib/desk/permissions";
import { deskAlert } from "@/test/desk-alert.fixture";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const api = vi.hoisted(() => ({
  capApproveAlert: vi.fn(),
  capCancelAlert: vi.fn(),
  capEmergencyPublishAlert: vi.fn(),
  capExpireAlert: vi.fn(),
  capIssueAlertUpdate: vi.fn(),
  capPublishAlert: vi.fn(),
  capRecordAlertReview: vi.fn(),
  capSubmitAlert: vi.fn(),
  capValidateAlert: vi.fn(),
}));
vi.mock("@barrelsgd/api-client", () => api);

import { AlertActions } from "./alert-actions";

const IMPORTED_NOTICE = /This alert was imported/;
const PATTERN_1 = /I have reviewed/;
const PATTERN_2 = /Not published: the CAP XML does not follow/;
const PATTERN_3 = /Note \(needed/;
const PATTERN_4 = /not a valid date/;
const PATTERN_5 = /severity Critical is not a CAP value/;
const PATTERN_6 = /checked this imported alert/;
const PATTERN_7 = /A public CAP Cancel message was issued/;

const ALL: DeskPermissions = {
  approve: true,
  create: true,
  edit: true,
  emergencyPublish: true,
  feedsManage: true,
  integrationsManage: true,
  publish: true,
  read: true,
  settingsManage: true,
  submit: true,
};

function ok<T>(value: T) {
  return { unwrap: () => Promise.resolve(value) };
}

function refused(status: number, detail: unknown) {
  const error = Object.assign(new Error("failed"), {
    data: { detail },
    name: "ResponseError",
    status,
  });
  return { unwrap: () => Promise.reject(error) };
}

function snapshot(schemaMismatch: string | null = null) {
  return {
    alert: deskAlert({ lifecycle_state: "PUBLISHED" }),
    snapshot: { schema_mismatch: schemaMismatch },
  };
}

function show(
  alert: CapAlertPublic,
  permissions: DeskPermissions = ALL,
  userId = "someone-else"
) {
  return render(
    <AlertActions alert={alert} permissions={permissions} userId={userId} />
  );
}

async function validateAndTick() {
  fireEvent.click(screen.getByRole("button", { name: "Validate" }));
  await screen.findByText("Validation passed.");
  fireEvent.click(screen.getByRole("checkbox", { name: PATTERN_1 }));
}

async function confirm(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.capValidateAlert.mockReturnValue(
    ok({ errors: [], is_valid: true, warnings: ["Check affected areas."] })
  );
});

describe("a draft", () => {
  it("needs a passed validation and the review tick before review is requested", async () => {
    api.capSubmitAlert.mockReturnValue(ok(deskAlert()));
    show(deskAlert());
    const request = screen.getByRole("button", { name: "Request review" });
    expect(request).toBeDisabled();

    await validateAndTick();
    expect(screen.getByText("Warning: Check affected areas.")).toBeVisible();
    fireEvent.click(request);

    await screen.findByText("Review requested.");
    expect(api.capSubmitAlert).toHaveBeenCalledWith({
      body: { note: null },
      path: { alert_id: deskAlert().id },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("lists validation errors and keeps every action disabled", async () => {
    api.capValidateAlert.mockReturnValue(
      ok({ errors: ["Expires is in the past"], is_valid: false, warnings: [] })
    );
    show(deskAlert());
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await screen.findByText("Validation failed.");
    expect(screen.getByText("Error: Expires is in the past")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: PATTERN_1 })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Request review" })
    ).toBeDisabled();
  });

  it("links to Edit draft only with the edit permission", () => {
    show(deskAlert());
    expect(screen.getByRole("link", { name: "Edit draft" })).toHaveAttribute(
      "href",
      `/desk/alerts/${deskAlert().id}/edit`
    );
  });
});

describe("approval and publishing", () => {
  it("approves a submitted alert", async () => {
    api.capApproveAlert.mockReturnValue(ok(deskAlert()));
    show(deskAlert({ lifecycle_state: "SUBMITTED" }));
    await validateAndTick();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByText("Approved.");
    expect(api.capApproveAlert).toHaveBeenCalled();
  });

  it("hides colleague review buttons from the author", () => {
    show(deskAlert({ lifecycle_state: "SUBMITTED" }), ALL, "author-id");
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
  });

  it("publishes an approved alert only after the confirmation", async () => {
    api.capPublishAlert.mockReturnValue(ok(snapshot()));
    show(deskAlert({ lifecycle_state: "APPROVED" }));
    await validateAndTick();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(api.capPublishAlert).not.toHaveBeenCalled();
    await confirm("Publish now");
    await screen.findByText("Published.");
    expect(api.capPublishAlert).toHaveBeenCalledWith({
      body: { confirm_imported: false, note: null },
      path: { alert_id: deskAlert().id },
    });
  });

  it("shows each CAP 1.2 schema problem when a publish is refused with 422", async () => {
    api.capPublishAlert.mockReturnValue(
      refused(
        422,
        "CAP XML does not conform to the official CAP 1.2 schema: line 4: sent is not a date; line 12: area missing"
      )
    );
    show(deskAlert({ lifecycle_state: "APPROVED" }));
    await validateAndTick();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await confirm("Publish now");
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(PATTERN_2);
    expect(screen.getByText("line 4: sent is not a date")).toBeVisible();
    expect(screen.getByText("line 12: area missing")).toBeVisible();
  });

  it("shows the session notice with a sign-in link on 401", async () => {
    api.capPublishAlert.mockReturnValue(refused(401, "expired"));
    show(deskAlert({ lifecycle_state: "APPROVED" }));
    await validateAndTick();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await confirm("Publish now");
    expect(
      await screen.findByRole("link", { name: "Sign in again" })
    ).toHaveAttribute("href", "/desk/signin");
  });
});

describe("emergency publish", () => {
  it("needs a reason, confirms, and says when it went out with a format problem", async () => {
    api.capEmergencyPublishAlert.mockReturnValue(
      ok(snapshot("line 2: element 'sent': not a valid date"))
    );
    show(deskAlert());
    await validateAndTick();
    const emergency = screen.getByRole("button", { name: "Emergency publish" });
    expect(emergency).toBeDisabled();
    fireEvent.change(screen.getByLabelText(PATTERN_3), {
      target: { value: "Storm already over the island" },
    });
    fireEvent.click(emergency);
    await confirm("Confirm emergency publish");

    expect(
      await screen.findByText("Published with a CAP format problem")
    ).toBeVisible();
    expect(screen.getByText(PATTERN_4)).toBeVisible();
    expect(api.capEmergencyPublishAlert).toHaveBeenCalledWith({
      body: {
        confirm_imported: false,
        reason: "Storm already over the island",
      },
      path: { alert_id: deskAlert().id },
    });
  });

  it("is not offered without the duty-supervisor permission", () => {
    show(deskAlert(), { ...ALL, emergencyPublish: false });
    expect(
      screen.queryByRole("button", { name: "Emergency publish" })
    ).toBeNull();
  });
});

describe("an imported partner alert", () => {
  const imported = deskAlert({
    import_source: "feed",
    lifecycle_state: "APPROVED",
    schema_conformant: false,
    schema_error: "severity Critical is not a CAP value",
  });

  it("is flagged and cannot be published until the forecaster confirms it", async () => {
    api.capPublishAlert.mockReturnValue(ok(snapshot()));
    show(imported);
    expect(
      screen.getByText("Imported from another sender (feed)")
    ).toBeVisible();
    expect(screen.getByText(PATTERN_5)).toBeVisible();
    await validateAndTick();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: PATTERN_6 }));
    fireEvent.click(publish);
    await confirm("Publish now");
    await waitFor(() =>
      expect(api.capPublishAlert).toHaveBeenCalledWith({
        body: { confirm_imported: true, note: null },
        path: { alert_id: imported.id },
      })
    );
  });

  it("explains a 409 asking for the confirmation", async () => {
    api.capPublishAlert.mockReturnValue(
      refused(409, "This alert was imported. ... confirm_imported set to true.")
    );
    show(imported);
    await validateAndTick();
    fireEvent.click(screen.getByRole("checkbox", { name: PATTERN_6 }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await confirm("Publish now");
    expect(await screen.findByRole("alert")).toHaveTextContent(IMPORTED_NOTICE);
  });

  it("cannot be updated from the desk once published", () => {
    show({ ...imported, lifecycle_state: "PUBLISHED" });
    expect(screen.queryByRole("button", { name: "Issue update" })).toBeNull();
  });
});

describe("a published alert", () => {
  const published = deskAlert({ lifecycle_state: "PUBLISHED" });

  it("issues an Update and opens it for editing", async () => {
    api.capIssueAlertUpdate.mockReturnValue(
      ok(deskAlert({ id: "99999999-2222-4333-8444-555555555555" }))
    );
    show(published);
    fireEvent.click(screen.getByRole("button", { name: "Issue update" }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        "/desk/alerts/99999999-2222-4333-8444-555555555555/edit"
      )
    );
    expect(api.capIssueAlertUpdate).toHaveBeenCalledWith({
      path: { alert_id: published.id },
    });
  });

  it("shows why an Update was refused", async () => {
    api.capIssueAlertUpdate.mockReturnValue(
      refused(409, "Only a published warning can be updated.")
    );
    show(published);
    fireEvent.click(screen.getByRole("button", { name: "Issue update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a published warning can be updated."
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("cancels with a reason after the confirmation", async () => {
    api.capCancelAlert.mockReturnValue(ok(published));
    show(published);
    const cancel = screen.getByRole("button", { name: "Cancel alert" });
    expect(cancel).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Issued in error" },
    });
    fireEvent.click(cancel);
    await confirm("Confirm cancellation");
    await screen.findByText(PATTERN_7);
    expect(api.capCancelAlert).toHaveBeenCalledWith({
      body: { note: "Issued in error" },
      path: { alert_id: published.id },
    });
  });

  it("marks it expired without a public message", async () => {
    api.capExpireAlert.mockReturnValue(ok(published));
    show(published);
    fireEvent.click(screen.getByRole("button", { name: "Mark expired" }));
    await confirm("Confirm: mark expired");
    await screen.findByText("Marked expired. No public message was sent.");
  });

  it("shows a refused cancellation", async () => {
    api.capCancelAlert.mockReturnValue(refused(403, "Missing permission"));
    show(published);
    fireEvent.change(screen.getByLabelText("Cancellation reason"), {
      target: { value: "Issued in error" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel alert" }));
    await confirm("Confirm cancellation");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission for this action."
    );
  });
});
