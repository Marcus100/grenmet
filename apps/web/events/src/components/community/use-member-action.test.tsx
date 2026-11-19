import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ActionResult, SIGN_IN_REQUIRED } from "@/data/action-result";
import { goToSignIn } from "@/lib/navigation";
import { useMemberAction } from "./use-member-action";

// No router mock: the hook must not depend on the client router to sign visitors in.
vi.mock("next/navigation", () => ({ usePathname: () => "/events/launch" }));
vi.mock("@/lib/navigation", () => ({ goToSignIn: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

beforeEach(() => {
  vi.mocked(goToSignIn).mockReset();
});

describe("useMemberAction", () => {
  it("sends a visitor to sign in with a full-page navigation", async () => {
    const { result } = renderHook(() => useMemberAction());
    const refused: ActionResult = { ok: false, error: SIGN_IN_REQUIRED };

    await act(async () => {
      await result.current.perform(() => Promise.resolve(refused));
    });

    expect(goToSignIn).toHaveBeenCalledWith("/events/launch");
  });

  it("does not navigate when the action succeeds", async () => {
    const { result } = renderHook(() => useMemberAction());

    await act(async () => {
      await result.current.perform(() =>
        Promise.resolve({ ok: true, data: null } as ActionResult<null>)
      );
    });

    expect(goToSignIn).not.toHaveBeenCalled();
  });
});
