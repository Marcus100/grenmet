import { productFields } from "@barrelsgd/gms/products";
import { expect, it } from "vitest";
import { productProblems } from "./product-problems";

it("links a message to the morning field its label names and keeps the text", () => {
  const fields = productFields("morning");
  expect(
    productProblems("morning", fields, [
      "Weather: Weather forecast is required",
    ])
  ).toEqual([
    {
      fieldId: "morning-summary",
      message: "Weather: Weather forecast is required",
      period: "",
    },
  ]);
});

it("leaves a message that names no field unlinked", () => {
  expect(
    productProblems("morning", productFields("morning"), [
      "Validity must end after the issue time",
    ])
  ).toEqual([{ message: "Validity must end after the issue time" }]);
});

it("drops blank messages", () => {
  expect(productProblems("morning", productFields("morning"), ["  "])).toEqual(
    []
  );
});

it("matches an evening day's message to that day's field and tab", () => {
  const fields = productFields("evening");
  const day2 = fields.find((field) => field.key === "day2Max");
  const tonight = fields.find((field) => field.key === "maxTemperature");
  if (!(day2 && tonight)) throw new Error("evening fields changed");
  const [problem] = productProblems("evening", fields, [
    `Day 2: ${day2.label} is required`,
  ]);
  expect(problem).toMatchObject({ fieldId: "evening-day2Max", period: "day2" });
  // The same label without a day prefix belongs to tonight, not day 2.
  const [tonightProblem] = productProblems("evening", fields, [
    `${tonight.label} is required`,
  ]);
  expect(tonightProblem).toMatchObject({
    fieldId: "evening-maxTemperature",
    period: "",
  });
});
