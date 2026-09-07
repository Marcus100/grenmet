import { expect, it, vi } from "vitest";

const { env } = vi.hoisted(() => ({
  env: { NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE: "false" },
}));
vi.mock("@/env", () => ({ env }));

import { getImageUrl } from "./utils";

it("preserves local image paths and uses authenticated cloud redirects in deployment", () => {
  expect(getImageUrl("goes19/image.png")).toBe("/wxwatch/goes19/image.png");
  env.NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE = "true";
  expect(getImageUrl("goes19/image 1.png")).toBe(
    "/api/v1/wxwatch/images/goes19/image%201.png"
  );
});
