import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { chartRows, OrganisationChart } from "./organisation-chart";

const person = (id: string, supervisor?: string) => ({
  user_id: id,
  name: id,
  department_id: "met",
  status: "active",
  supervisor_id: supervisor,
});
it("orders supervisors before staff without changing the source records", () => {
  const staff = [person("employee", "manager"), person("manager")];
  expect(
    chartRows(staff).map((row) => [row.person.user_id, row.depth])
  ).toEqual([
    ["manager", 0],
    ["employee", 1],
  ]);
  expect(staff[0].user_id).toBe("employee");
});
it("retains disconnected staff, self-references and cycles once each", () => {
  const rows = chartRows([
    person("missing", "outside"),
    person("self", "self"),
    person("a", "b"),
    person("b", "a"),
  ]);
  expect(rows).toHaveLength(4);
  expect(new Set(rows.map((row) => row.person.user_id)).size).toBe(4);
  expect(
    rows.filter((row) => row.issue?.startsWith("Reporting cycle"))
  ).toHaveLength(2);
  expect(rows[0].issue).toBe("Supervisor unavailable in this view");
});
it("shows relationships and an empty state without editing controls", () => {
  const { rerender } = render(
    <OrganisationChart
      staff={[person("employee", "manager"), person("manager")]}
    />
  );
  expect(screen.getByText("Reports to manager · Level 2")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<OrganisationChart staff={[]} />);
  expect(screen.getByText("No staff records available.")).toBeVisible();
});

it("keeps descendants attached when they precede a reporting cycle", () => {
  const rows = chartRows([
    person("employee", "a"),
    person("a", "b"),
    person("b", "a"),
  ]);
  expect(rows[0].person.user_id).toBe("a");
  expect(rows.find((row) => row.person.user_id === "employee")).toMatchObject({
    depth: 1,
    issue: undefined,
  });
  expect(rows.filter((row) => row.issue)).toHaveLength(1);
});
