// @vitest-environment jsdom
import { SidebarProvider } from "@barrelsgd/ui/components/ui/sidebar";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NavUser } from "./nav-user";

const USER_TRIGGER = /Test Staff/;
it("keeps the menu without repeated identity details and submits logout as POST", async () => {
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "requestSubmit")
    .mockImplementation(() => undefined);
  render(
    <SidebarProvider>
      <NavUser user={{ name: "Test Staff", email: "staff@example.com" }} />
    </SidebarProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: USER_TRIGGER }));
  const logout = await screen.findByRole("menuitem", { name: "Log out" });
  expect(screen.getAllByText("staff@example.com")).toHaveLength(1);
  expect(screen.getAllByText("Test Staff")).toHaveLength(1);
  expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute(
    "href",
    "/profile"
  );
  const form = logout.closest("form");
  expect(form).toHaveAttribute("method", "post");
  expect(form).toHaveAttribute("action", "/auth/logout");
  fireEvent.click(logout);
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.contexts[0]).toBe(form);
  submit.mockRestore();
});
