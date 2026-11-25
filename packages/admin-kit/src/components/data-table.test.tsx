import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable, type DataTableColumn } from "./data-table";

const RE_0 = /Name/u;

interface Person {
  id: string;
  name: string;
  role: string;
}

const columns: DataTableColumn<Person>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "role", header: "Role" },
];
const PEOPLE: Person[] = [
  { id: "1", name: "Carol", role: "Owner" },
  { id: "2", name: "Alice", role: "Admin" },
  { id: "3", name: "Bob", role: "Staff" },
];
const EMPTY = {
  title: "No people yet.",
  link: { href: "/people/new", label: "Add a person" },
};

function table() {
  return screen.getByRole("table", { name: "People" });
}
function names() {
  return within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

describe("DataTable", () => {
  it("renders the rows with named columns", () => {
    render(
      <DataTable columns={columns} data={PEOPLE} empty={EMPTY} label="People" />
    );
    expect(
      within(table()).getByRole("columnheader", { name: RE_0 })
    ).toBeInTheDocument();
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("sorts by a column and reports it with aria-sort", async () => {
    render(
      <DataTable columns={columns} data={PEOPLE} empty={EMPTY} label="People" />
    );
    await userEvent.click(within(table()).getByRole("button", { name: RE_0 }));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);
    expect(
      within(table()).getByRole("columnheader", { name: RE_0 })
    ).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(within(table()).getByRole("button", { name: RE_0 }));
    expect(names()).toEqual(["Carol", "Bob", "Alice"]);
    expect(
      within(table()).getByRole("columnheader", { name: RE_0 })
    ).toHaveAttribute("aria-sort", "descending");
  });

  it("searches, says when nothing matches and clears", async () => {
    render(
      <DataTable columns={columns} data={PEOPLE} empty={EMPTY} label="People" />
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search People" }),
      "bo"
    );
    expect(names()).toEqual(["Bob"]);
    await userEvent.clear(
      screen.getByRole("searchbox", { name: "Search People" })
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search People" }),
      "zzz"
    );
    expect(screen.getByText("Nothing matches “zzz”.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("paginates", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      role: "Staff",
    }));
    render(
      <DataTable
        columns={columns}
        data={many}
        empty={EMPTY}
        label="People"
        pageSize={2}
      />
    );
    expect(names()).toEqual(["Person 0", "Person 1"]);
    expect(screen.getByText("Showing 1–2 of 5 rows")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(names()).toEqual(["Person 2", "Person 3"]);
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows the empty state with its next step, and no table", () => {
    render(
      <DataTable columns={columns} data={[]} empty={EMPTY} label="People" />
    );
    expect(screen.getByText("No people yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a person" })).toHaveAttribute(
      "href",
      "/people/new"
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a loading state instead of rows", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        empty={EMPTY}
        label="People"
        loading
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading People");
    expect(screen.queryByText("No people yet.")).toBeNull();
    expect(screen.queryByText("Carol")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("adds row actions to the table", () => {
    render(
      <DataTable
        columns={columns}
        data={PEOPLE}
        empty={EMPTY}
        label="People"
        rowActions={(row) => (
          <button type="button">{`Edit ${row.name}`}</button>
        )}
      />
    );
    expect(screen.getAllByRole("button", { name: "Edit Alice" })).toHaveLength(
      1
    );
  });

  it("can hide the search box", () => {
    render(
      <DataTable
        columns={columns}
        data={PEOPLE}
        empty={EMPTY}
        label="People"
        searchable={false}
      />
    );
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

function setPhone(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function make(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `Person ${i}`,
    role: "Staff",
  }));
}

describe("DataTable page index", () => {
  it("keeps the page when the parent passes a new array", async () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={make(6)}
        empty={EMPTY}
        label="People"
        pageSize={2}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    rerender(
      <DataTable
        columns={columns}
        data={make(6)}
        empty={EMPTY}
        label="People"
        pageSize={2}
      />
    );
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("steps back to the last page when rows shrink", async () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={make(6)}
        empty={EMPTY}
        label="People"
        pageSize={2}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    rerender(
      <DataTable
        columns={columns}
        data={make(3)}
        empty={EMPTY}
        label="People"
        pageSize={2}
      />
    );
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(names()).toEqual(["Person 2"]);
  });
});

describe("DataTable phone view", () => {
  afterEach(() => setPhone(false));

  it("renders only the table on wide screens, with row actions once", () => {
    setPhone(false);
    render(
      <DataTable
        columns={columns}
        data={PEOPLE}
        empty={EMPTY}
        label="People"
        rowActions={(row) => (
          <button type="button">{`Edit ${row.name}`}</button>
        )}
      />
    );
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "People list" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Edit Alice" })).toHaveLength(
      1
    );
  });

  it("renders only cards on phones, with row actions once and a sort select", async () => {
    setPhone(true);
    render(
      <DataTable
        cardTitle={(row) => row.name}
        columns={columns}
        data={PEOPLE}
        empty={EMPTY}
        label="People"
        rowActions={(row) => (
          <button type="button">{`Edit ${row.name}`}</button>
        )}
      />
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Edit Alice" })).toHaveLength(
      1
    );
    const cards = () =>
      within(screen.getByRole("list", { name: "People list" }))
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p")?.textContent);
    expect(cards()).toEqual(["Carol", "Alice", "Bob"]);
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "name:asc");
    expect(cards()).toEqual(["Alice", "Bob", "Carol"]);
    await userEvent.selectOptions(
      screen.getByLabelText("Sort by"),
      "name:desc"
    );
    expect(cards()).toEqual(["Carol", "Bob", "Alice"]);
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "");
    expect(cards()).toEqual(["Carol", "Alice", "Bob"]);
  });
});
