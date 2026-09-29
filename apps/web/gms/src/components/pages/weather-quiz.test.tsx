import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WeatherQuiz } from "@/components/pages/weather-quiz";

const QUESTIONS = [
  {
    question: "Trade winds blow from?",
    options: ["East", "West"],
    answer: 0,
    explanation: "From the east.",
  },
  {
    question: "Season starts?",
    options: ["May", "June"],
    answer: 1,
    explanation: "1 June.",
  },
];

const EAST = /^East/;
const MAY = /^May/;
const JUNE = /^June/;

describe("WeatherQuiz", () => {
  it("marks answers in words, explains, and scores", async () => {
    const user = userEvent.setup();
    render(<WeatherQuiz questions={QUESTIONS} />);
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: EAST }));
    expect(screen.getByText("From the east.")).toBeInTheDocument();
    expect(screen.getByText("Correct answer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: MAY }));
    expect(screen.getByText("Your answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: JUNE })).toBeDisabled();
    expect(screen.getByText("You scored 1 out of 2.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();
  });
});
