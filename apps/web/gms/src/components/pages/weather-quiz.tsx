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
  const score = picked.filter((p, i) => p === questions[i].answer).length;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-5">
        {questions.map((q, qi) => {
          const choice = picked[qi];
          return (
            <li
              className="rounded-gm-card border border-gm-border bg-background p-4 lg:p-5"
              key={q.question}
            >
              <fieldset>
                <legend className="font-bold text-body-base text-gm-heading leading-body-base">
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
                          "flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-body leading-body",
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
                          <span className="flex items-center gap-1 font-bold text-body-sm leading-body-sm">
                            <CheckIcon aria-hidden="true" className="size-4" />
                            Correct answer
                          </span>
                        )}
                        {isPicked && !isAnswer && (
                          <span className="flex items-center gap-1 font-bold text-body-sm leading-body-sm">
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
                    className="mt-3 text-body text-gm-text-secondary leading-body"
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
        className="font-bold font-gm-display text-gm-heading text-heading-md leading-heading-md"
      >
        {answered === questions.length
          ? `You scored ${score} out of ${questions.length}.`
          : `${answered} of ${questions.length} answered`}
      </p>
      {answered > 0 && (
        <button
          className="h-11 w-fit rounded-md border border-gm-border-input px-4 font-semibold text-body leading-body hover:border-gm-blue-ink"
          onClick={() => setPicked(questions.map(() => null))}
          type="button"
        >
          Start again
        </button>
      )}
    </div>
  );
}
