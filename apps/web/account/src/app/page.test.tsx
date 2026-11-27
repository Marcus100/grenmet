import { cleanup, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { reportError } from "@/lib/report-error";
import AccountHomePage from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "kezia@example.com",
    name: "kezia",
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const API = "http://localhost:8000/api/v1";
const PROFILE = {
  email: "kezia@example.com",
  first_name: "kezia",
  last_name: "",
  name_is_placeholder: true,
  phone: null,
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.mocked(reportError).mockClear();
});
afterAll(() => server.close());

function serve(profile: Response, photo: Response): void {
  server.use(
    http.get(`${API}/auth/users/me/profile`, () => profile),
    http.get(`${API}/profile-images/me`, () => photo)
  );
}

const NO_PHOTO = () => HttpResponse.json({ detail: "none" }, { status: 404 });

describe("AccountHomePage", () => {
  it("puts the checklist above the photo and hides a made-up name", async () => {
    serve(HttpResponse.json(PROFILE), NO_PHOTO());

    render(await AccountHomePage());

    // The sign-up's stand-in name is not shown as the person's name.
    expect(
      screen.getByRole("heading", { level: 1, name: "kezia@example.com" })
    ).toBeInTheDocument();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Finish your profile", "Profile photo"]);
    expect(screen.getByText("1 of 4 done")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a photo" })).toHaveAttribute(
      "href",
      "#profile-photo"
    );
    expect(document.getElementById("profile-photo")).toContainElement(
      screen.getByRole("heading", { level: 2, name: "Profile photo" })
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("says what was saved from a fixed code and echoes nothing else", async () => {
    serve(
      HttpResponse.json({
        ...PROFILE,
        first_name: "Kezia",
        last_name: "Mitchell",
        name_is_placeholder: false,
      }),
      NO_PHOTO()
    );

    render(
      await AccountHomePage({
        searchParams: Promise.resolve({ saved: "name" }),
      })
    );

    expect(screen.getByRole("status")).toHaveTextContent("Name saved.");
    expect(
      screen.getByRole("heading", { level: 1, name: "Kezia Mitchell" })
    ).toBeInTheDocument();
    cleanup();

    serve(HttpResponse.json(PROFILE), NO_PHOTO());
    render(
      await AccountHomePage({
        searchParams: Promise.resolve({ saved: "<b>anything</b>" }),
      })
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports a profile that cannot be read and still shows the photo block", async () => {
    serve(HttpResponse.json({ detail: "boom" }, { status: 500 }), NO_PHOTO());

    render(await AccountHomePage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not load your profile just now."
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Profile photo" })
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "account-profile"
    );
  });
});
