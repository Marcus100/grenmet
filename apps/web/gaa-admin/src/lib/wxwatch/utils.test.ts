import { expect, it } from "vitest";
import { getImageUrl } from "./utils";

it("routes all image downloads through authenticated FastAPI", () => {
  expect(getImageUrl("goes19/image 1.png")).toBe(
    "/_backend/wxwatch/images/goes19/image%201.png"
  );
});
