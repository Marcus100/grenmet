import { describe, expect, it } from "vitest";
import { scorePassword } from "./password-strength";
import { groupPermissions } from "./permissions";
import { describePasswordAge, formatRelative } from "./profile";
import { describeDevice } from "./user-agent";

describe("scorePassword", () => {
  it("rejects anything under the 12-character minimum", () => {
    expect(scorePassword("Sh0rt!pass").label).toBe("Too short");
  });

  it("rises with length and character variety", () => {
    expect(scorePassword("aaaaaaaaaaaa").score).toBe(1);
    expect(scorePassword("Password1234").score).toBe(2);
    expect(scorePassword("Longer-Passw0rd-here").label).toBe("Strong");
  });
});

describe("describeDevice", () => {
  it("names browser and system", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
      )
    ).toEqual({ label: "Chrome on Windows", mobile: false });
  });

  it("recognises Edge before Chrome and phones as mobile", () => {
    expect(describeDevice("Mozilla/5.0 Chrome/140.0 Edg/140.0").label).toBe(
      "Edge"
    );
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1"
      )
    ).toEqual({ label: "Safari on iOS", mobile: true });
  });

  it("falls back when nothing was recorded", () => {
    expect(describeDevice(null).label).toBe("Unknown device");
  });
});

describe("groupPermissions", () => {
  it("groups by the first segment, sorted", () => {
    expect(
      groupPermissions([
        "roster.view",
        "hr.leave.approve",
        "hr.employment.manage",
      ])
    ).toEqual([
      ["hr", ["hr.employment.manage", "hr.leave.approve"]],
      ["roster", ["roster.view"]],
    ]);
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");

  it("says just now inside a minute", () => {
    expect(formatRelative("2026-09-23T11:59:40Z", now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelative("2026-09-23T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-09-22T12:00:00Z", now)).toBe("yesterday");
  });
});

describe("describePasswordAge", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");

  it("says so when no change has been recorded", () => {
    expect(describePasswordAge(null, now)).toBe("No change recorded yet.");
  });

  it("gives a relative and an absolute date", () => {
    expect(describePasswordAge("2026-09-22T12:00:00Z", now)).toBe(
      "Last changed yesterday (September 22, 2026)."
    );
  });
});
