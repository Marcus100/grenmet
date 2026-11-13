"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface QuizQuestion {
  answer: number;
  explanation: string;
  options: readonly string[];
  question: string;
}

/**
 * A short multiple-choice quiz. Each answer is shown right or wrong in words
 * and with an icon (never colour alone), followed by the explanation.
 */
export function WeatherQuiz({
  questions,
}: {
  questions: readonly QuizQuestion[];
}) {
  const [picked, setPicked] = useState<(number | null)[]>(() =>
    questions.map(() => null)
  );
  const answered = picked.filter((p) => p !== null).length;
  const score = picked.filter((p, i) => p === questions[i]?.answer).length;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-5">
        {questions.map((q, qi) => {
          const choice = picked[qi];
          return (
            <li
              className="rounded-gm-card border-gm-border bg-background border p-4 lg:p-5"
              key={q.question}
            >
              <fieldset>
                <legend className="text-body-base text-gm-heading leading-body-base font-bold">
                  {qi + 1}. {q.question}
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {q.options.map((option, oi) => {
                    const isAnswer = oi === q.answer;
                    const isPicked = choice === oi;
                    return (
                      <button
                        aria-pressed={isPicked}
                        className={cn(
                          "text-body leading-body flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left",
                          choice === null &&
                            "border-gm-border-input hover:border-gm-blue-ink",
                          choice !== null && isAnswer && "border-gm-risk-green",
                          choice !== null &&
                            isPicked &&
                            !isAnswer &&
                            "border-gm-risk-red",
                          choice !== null &&
                            !isAnswer &&
                            !isPicked &&
                            "border-gm-border text-gm-text-muted"
                        )}
                        disabled={choice !== null}
                        key={option}
                        onClick={() =>
                          setPicked((prev) =>
                            prev.map((p, i) => (i === qi ? oi : p))
                          )
                        }
                        type="button"
                      >
                        {option}
                        {choice !== null && isAnswer && (
                          <span className="text-body-sm leading-body-sm flex items-center gap-1 font-bold">
                            <CheckIcon aria-hidden="true" className="size-4" />
                            Correct answer
                          </span>
                        )}
                        {isPicked && !isAnswer && (
                          <span className="text-body-sm leading-body-sm flex items-center gap-1 font-bold">
                            <XIcon aria-hidden="true" className="size-4" />
                            Your answer
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {choice !== null && (
                  <p
                    aria-live="polite"
                    className="text-body text-gm-text-secondary leading-body mt-3"
                  >
                    {q.explanation}
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      <p
        aria-live="polite"
        className="font-gm-display text-gm-heading text-heading-md leading-heading-md font-bold"
      >
        {answered === questions.length
          ? `You scored ${score} out of ${questions.length}.`
          : `${answered} of ${questions.length} answered`}
      </p>
      {answered > 0 && (
        <button
          className="border-gm-border-input text-body leading-body hover:border-gm-blue-ink h-11 w-fit rounded-md border px-4 font-semibold"
          onClick={() => setPicked(questions.map(() => null))}
          type="button"
        >
          Start again
        </button>
      )}
    </div>
  );
}
