import { render, screen } from "@testing-library/react";
import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { FormSection, SaveButton } from "./form-section";
import { PageHeader } from "./page-header";
import { PageSection } from "./page-section";
import { StatTile } from "./stat-tile";
import { WideContent } from "./wide-content";

describe("PageHeader", () => {
  it("has exactly one h1, a description and actions", () => {
    render(
      <PageHeader
        actions={<button type="button">New</button>}
        description="Everyone on the team."
        title="People"
      />
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "People" })
    ).toBeInTheDocument();
    expect(screen.getByText("Everyone on the team.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("wraps actions under the title on phones", () => {
    const { container } = render(<PageHeader title="People" />);
    expect(container.firstElementChild).toHaveClass("flex-wrap");
  });
});

describe("EmptyState", () => {
  it("says what is missing and the next step", () => {
    render(
      <EmptyState
        description="Add one to start taking bookings."
        icon={<Users />}
        link={{ href: "/services/new", label: "Add a service" }}
        title="No services yet."
      />
    );
    expect(screen.getByText("No services yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a service" })).toHaveAttribute(
      "href",
      "/services/new"
    );
  });

  it("accepts a button as the action", () => {
    render(
      <EmptyState
        action={<button type="button">Add</button>}
        title="Nothing."
      />
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("StatTile", () => {
  it("writes the status in text, with the label and value", () => {
    render(
      <StatTile
        icon={<Users />}
        label="Bookings today"
        status="Up 12% on last week"
        value={18}
      />
    );
    expect(screen.getByText("Bookings today")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Up 12% on last week")).toBeVisible();
  });

  it("keeps the words when a status needs attention", () => {
    render(
      <StatTile
        label="Overdue"
        status="2 overdue"
        statusTone="attention"
        value={2}
      />
    );
    expect(screen.getByText("2 overdue")).toHaveClass("text-destructive");
  });
});

describe("PageSection", () => {
  it("is a titled section with actions", () => {
    render(
      <PageSection
        actions={<button type="button">Edit</button>}
        description="Who works here."
        title="Team"
      >
        <p>Body</p>
      </PageSection>
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Team" })
    ).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("keeps the section and shows its empty state when empty", () => {
    render(
      <PageSection
        empty={{
          title: "No team yet.",
          link: { href: "/team/new", label: "Invite someone" },
        }}
        isEmpty
        level={3}
        title="Team"
      >
        <p>Body</p>
      </PageSection>
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Team" })
    ).toBeInTheDocument();
    expect(screen.getByText("No team yet.")).toBeInTheDocument();
    expect(screen.queryByText("Body")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Invite someone" })
    ).toBeInTheDocument();
  });
});

describe("FormSection and SaveButton", () => {
  it("lays out the label, description, fields and an error", () => {
    render(
      <FormSection
        description="Shown to customers."
        error="Name is required."
        title="Profile"
      >
        <input aria-label="Name" />
      </FormSection>
    );
    expect(
      screen.getByRole("heading", { name: "Profile" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required.");
  });

  it("disables Save and says so while pending", () => {
    const { rerender } = render(<SaveButton />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    rerender(<SaveButton pending />);
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("type", "submit");
  });
});

describe("WideContent", () => {
  it("marks the page wide for the shell", () => {
    render(<WideContent>Register</WideContent>);
    expect(screen.getByText("Register")).toHaveAttribute(
      "data-content-width",
      "wide"
    );
  });
});
