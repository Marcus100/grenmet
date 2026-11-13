import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { countsSummary } from "./terminal-format";
import { TerminalWorkspace } from "./terminal-workspace";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/hr/terminal",
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const PATTERN_0 = /You do not manage terminal punches/u;
const PATTERN_1 = /not linked to anyone in this department/u;
const PATTERN_2 = /Name the terminal/u;
const PATTERN_3 = /1 MB/u;
const PATTERN_4 = /Synthetic Seven/u;
const PATTERN_5 = /no spaces/u;
const PATTERN_6 = /already linked/u;
const BASE = "http://localhost";
const HR = `${BASE}/api/v1/hr`;
const ATT = `${HR}/attendance`;
const ZERO = {
  recorded: 0,
  already_recorded: 0,
  repeat: 0,
  no_shift: 0,
  unmapped: 0,
  refused: 0,
};
const HELD = {
  id: "t1",
  department_id: "dept_met",
  terminal: "Main gate",
  device_user_id: "17",
  punched_at: "2026-11-10T11:02:00Z",
  user_id: null,
  employee_name: null,
  roster_assignment_id: null,
  kind: null,
  outcome: "UNMAPPED",
  detail: "No staff member is linked to this device user ID.",
  import_id: "i1",
};
const MAPPING = {
  id: "m1",
  department_id: "dept_met",
  device_user_id: "5",
  user_id: "u5",
  employee_name: "Synthetic Observer",
  created_at: "2026-11-10T10:00:00Z",
};

let access = { is_superuser: false, permission_keys: ["roster.manage"] };
let punches = [HELD];
let punchQueries: URLSearchParams[] = [];
let mappings = [MAPPING];
// jsdom's File cannot be re-parsed by undici, so read the raw multipart body.
let importBody: string | undefined;
let addBody: unknown;
let addStatus = 201;
let reprocessBody: unknown;
let reprocessReply = {
  processed: 1000,
  outcomes: { ...ZERO, recorded: 1000 },
  remaining: 12,
};
let punchStatus = 200;
let removed: string | undefined;

const server = setupServer(
  http.get(`${BASE}/api/v1/auth/access/me`, () => HttpResponse.json(access)),
  http.get(`${HR}/departments`, () =>
    HttpResponse.json({
      data: [
        {
          id: "dept_met",
          name: "Meteorology",
          code: "MET",
          organisation_id: "o1",
        },
        {
          id: "dept_ops",
          name: "Operations",
          code: "OPS",
          organisation_id: "o1",
        },
      ],
      count: 2,
    })
  ),
  http.get(`${HR}/departments/:id/members`, () =>
    HttpResponse.json({
      data: [
        {
          user_id: "u7",
          username: "synthetic.seven",
          first_name: "Synthetic",
          last_name: "Seven",
          full_name: "Synthetic Seven",
          roster_name: null,
          employment_status: "ACTIVE",
        },
      ],
      count: 1,
    })
  ),
  http.get(`${ATT}/terminal-punches`, ({ request }) => {
    punchQueries.push(new URL(request.url).searchParams);
    if (punchStatus !== 200)
      return HttpResponse.json({ detail: "Refused" }, { status: punchStatus });
    return HttpResponse.json({ data: punches, count: punches.length });
  }),
  http.get(`${ATT}/terminal-users`, () =>
    HttpResponse.json({ data: mappings, count: mappings.length })
  ),
  http.post(`${ATT}/terminal-users`, async ({ request }) => {
    addBody = await request.json();
    if (addStatus !== 201)
      return HttpResponse.json(
        { detail: "Device user ID 17 is already linked in this department." },
        { status: addStatus }
      );
    return HttpResponse.json(
      {
        ...MAPPING,
        id: "m2",
        device_user_id: "17",
        employee_name: "Synthetic Seven",
      },
      { status: 201 }
    );
  }),
  http.delete(`${ATT}/terminal-users/:id`, ({ params }) => {
    removed = String(params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${ATT}/terminal-imports`, async ({ request }) => {
    importBody = await request.text();
    return HttpResponse.json(
      {
        import_id: "i2",
        department_id: "dept_met",
        terminal: "Main gate",
        new_punches: 3,
        duplicates: 2,
        errors: [{ line: 4, message: "Unreadable time" }],
        outcomes: { ...ZERO, recorded: 2, unmapped: 1 },
        rows: [HELD],
      },
      { status: 201 }
    );
  }),
  http.post(`${ATT}/terminal-punches/reprocess`, async ({ request }) => {
    reprocessBody = await request.json();
    return HttpResponse.json(reprocessReply);
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  search = "";
  replace.mockClear();
  vi.mocked(toast.success).mockClear();
  access = { is_superuser: false, permission_keys: ["roster.manage"] };
  punches = [HELD];
  punchQueries = [];
  mappings = [MAPPING];
  importBody = undefined;
  addBody = undefined;
  addStatus = 201;
  reprocessBody = undefined;
  reprocessReply = {
    processed: 1000,
    outcomes: { ...ZERO, recorded: 1000 },
    remaining: 12,
  };
  punchStatus = 200;
  removed = undefined;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TerminalWorkspace />
    </QueryClientProvider>
  );
}

describe("TerminalWorkspace", () => {
  it("tells people without roster management and asks for nothing else", async () => {
    access = { is_superuser: false, permission_keys: ["timesheet.approve"] };
    renderWorkspace();
    expect(await screen.findByText(PATTERN_0)).toBeInTheDocument();
    expect(punchQueries).toHaveLength(0);
  });

  it("lists held punches for the department in the URL", async () => {
    search = "department=dept_ops&outcome=UNMAPPED&offset=50";
    renderWorkspace();
    await waitFor(() => expect(punchQueries.length).toBeGreaterThan(0));
    const query = punchQueries[0];
    expect(query?.get("department_id")).toBe("dept_ops");
    expect(query?.get("outcome")).toBe("UNMAPPED");
    expect(query?.get("offset")).toBe("50");
    expect(await screen.findByText("Not linked")).toBeInTheDocument();
    expect(screen.getByText(PATTERN_1)).toBeInTheDocument();
  });

  it("ignores an unknown department or outcome in the URL", async () => {
    search = "department=nope&outcome=RECORDED&offset=abc";
    renderWorkspace();
    await waitFor(() => expect(punchQueries.length).toBeGreaterThan(0));
    const query = punchQueries[0];
    expect(query?.get("department_id")).toBe("dept_met");
    expect(query?.get("outcome")).toBeNull();
    expect(query?.get("offset")).toBe("0");
  });

  it("keeps the outcome filter in the URL and resets the page", async () => {
    search = "offset=50";
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText("Outcome"), {
      target: { value: "NO_SHIFT" },
    });
    expect(replace).toHaveBeenCalledWith("/hr/terminal?outcome=NO_SHIFT", {
      scroll: false,
    });
  });

  it("asks for a terminal name before uploading", async () => {
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Import punches" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(PATTERN_2);
    expect(importBody).toBeUndefined();
  });

  it("uploads the export and shows what happened", async () => {
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText("Terminal name"), {
      target: { value: "  Main gate " },
    });
    const file = new File(["17\t2026-11-10 07:02:00\n"], "attlog.txt", {
      type: "text/plain",
    });
    fireEvent.change(screen.getByLabelText("Export file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import punches" }));
    const result = await screen.findByRole("region", { name: "Import result" });
    expect(importBody).toContain('name="department_id"\r\n\r\ndept_met\r\n');
    expect(importBody).toContain('name="terminal"\r\n\r\nMain gate\r\n');
    expect(importBody).toContain('name="file"; filename=');
    expect(result).toHaveTextContent(
      "3 new punches from “Main gate”, 2 already imported and skipped."
    );
    expect(result).toHaveTextContent(
      "2 recorded, 1 with an unknown device ID."
    );
    expect(result).toHaveTextContent("1 punch needs your attention below.");
    expect(result).toHaveTextContent("Line 4: Unreadable time");
  });

  it("refuses a file over 1 MB before uploading", async () => {
    renderWorkspace();
    fireEvent.change(await screen.findByLabelText("Terminal name"), {
      target: { value: "Main gate" },
    });
    const big = new File(["x".repeat(1024 * 1024 + 1)], "big.txt");
    fireEvent.change(screen.getByLabelText("Export file"), {
      target: { files: [big] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import punches" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(PATTERN_3);
    expect(importBody).toBeUndefined();
  });

  it("decides held punches again and says when more are waiting", async () => {
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Decide again" })
    );
    await waitFor(() =>
      expect(reprocessBody).toEqual({ department_id: "dept_met" })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Decided 1000 held punches: 1000 recorded. 12 more are waiting: decide again to continue."
      )
    );
  });

  it("says when another press would not place anything", async () => {
    reprocessReply = {
      processed: 1000,
      outcomes: { ...ZERO, unmapped: 1000 },
      remaining: 40,
    };
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole("button", { name: "Decide again" })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Decided 1000 held punches: 1000 with an unknown device ID. 40 more are waiting behind punches that still cannot be placed. Link their device IDs or fix the roster first."
      )
    );
  });

  it("clamps a hand-edited offset to what the API accepts", async () => {
    search = "offset=999999";
    renderWorkspace();
    await waitFor(() => expect(punchQueries.length).toBeGreaterThan(0));
    expect(punchQueries[0]?.get("offset")).toBe("100000");
  });

  it("goes back to the first page when the API refuses the page", async () => {
    search = "offset=50";
    punchStatus = 422;
    renderWorkspace();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/hr/terminal", { scroll: false })
    );
  });

  it("shows an empty state when nothing needs attention", async () => {
    punches = [];
    renderWorkspace();
    expect(
      await screen.findByText("Nothing needs attention")
    ).toBeInTheDocument();
  });

  it("pages through punches with the page kept in the URL", async () => {
    punches = Array.from({ length: 60 }, (_, index) => ({
      ...HELD,
      id: `t${index}`,
    }));
    renderWorkspace();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(replace).toHaveBeenCalledWith("/hr/terminal?offset=50", {
      scroll: false,
    });
  });

  it("links a device ID to an employee", async () => {
    renderWorkspace();
    const form = await screen.findByRole("form", { name: "Link a device ID" });
    fireEvent.change(within(form).getByLabelText("Device user ID"), {
      target: { value: " 17 " },
    });
    await within(form).findByRole("option", { name: PATTERN_4 });
    fireEvent.change(within(form).getByLabelText("Employee"), {
      target: { value: "u7" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Link" }));
    await waitFor(() =>
      expect(addBody).toEqual({
        department_id: "dept_met",
        device_user_id: "17",
        user_id: "u7",
      })
    );
  });

  it("rejects a device ID with spaces without calling the API", async () => {
    renderWorkspace();
    const form = await screen.findByRole("form", { name: "Link a device ID" });
    fireEvent.change(within(form).getByLabelText("Device user ID"), {
      target: { value: "1 7" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Link" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(PATTERN_5);
    expect(addBody).toBeUndefined();
  });

  it("shows the API's reason when a device ID is already linked", async () => {
    addStatus = 409;
    renderWorkspace();
    const form = await screen.findByRole("form", { name: "Link a device ID" });
    fireEvent.change(within(form).getByLabelText("Device user ID"), {
      target: { value: "17" },
    });
    await within(form).findByRole("option", { name: PATTERN_4 });
    fireEvent.change(within(form).getByLabelText("Employee"), {
      target: { value: "u7" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Link" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(PATTERN_6);
  });

  it("removes a link after confirmation", async () => {
    renderWorkspace();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove device ID 5 from Synthetic Observer",
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(removed).toBe("m1"));
  });
});

describe("countsSummary", () => {
  it("leaves out outcomes with no punches", () => {
    expect(countsSummary({ ...ZERO, repeat: 2, refused: 1 })).toBe(
      "2 repeat scans ignored, 1 refused"
    );
    expect(countsSummary(ZERO)).toBe("nothing to decide");
  });
});
