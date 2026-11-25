import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

  it("adds row actions to the table and the cards", () => {
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
      2
    );
  });

  it("offers a card view for phones with labelled values", () => {
    render(
      <DataTable
        cardTitle={(row) => row.name}
        columns={columns}
        data={PEOPLE}
        empty={EMPTY}
        label="People"
      />
    );
    const list = screen.getByRole("list", { name: "People list" });
    expect(list.parentElement).toHaveClass("sm:hidden");
    expect(table().closest("[data-slot=data-table-table]")).toHaveClass(
      "hidden",
      "sm:block"
    );
    const first = within(list).getAllByRole("listitem")[0];
    expect(first).toBeDefined();
    if (first) {
      expect(within(first).getByText("Role")).toBeInTheDocument();
      expect(within(first).getByText("Owner")).toBeInTheDocument();
    }
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
