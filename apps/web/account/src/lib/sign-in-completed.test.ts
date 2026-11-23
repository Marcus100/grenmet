import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import {
  markSignInCompleted,
  SIGN_IN_COMPLETED_HASH,
} from "./sign-in-completed";

const ORIGIN = "https://account.barrels.gd";

function redirect(path: string, status = 307): NextResponse {
  return NextResponse.redirect(new URL(path, ORIGIN), { status });
}

describe("markSignInCompleted", () => {
  it("adds the hash to a same-origin success redirect", () => {
    const response = markSignInCompleted(redirect("/bookings?tab=1"), ORIGIN);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/bookings?tab=1#${SIGN_IN_COMPLETED_HASH}`
    );
  });

  it("leaves the expired redirect unchanged", () => {
    const location = `${ORIGIN}/signin?sign_in=expired`;
    const response = markSignInCompleted(
      redirect("/signin?sign_in=expired"),
      ORIGIN
    );
    expect(response.headers.get("location")).toBe(location);
  });

  it("leaves another origin unchanged", () => {
    const response = markSignInCompleted(
      redirect("https://bookings.barrels.gd/acme"),
      ORIGIN
    );
    expect(response.headers.get("location")).toBe(
      "https://bookings.barrels.gd/acme"
    );
  });

  it("leaves a non-redirect response unchanged", () => {
    const response = markSignInCompleted(
      new NextResponse("ok", { status: 200 }),
      ORIGIN
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
