"use client";

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";

interface Feedback {
  readonly notice: (message: string) => void;
}

const FeedbackContext = createContext<Feedback | null>(null);

/**
 * One live region for the whole team screen. A change refreshes the page and
 * the row that made it can disappear (a revoked role), so the outcome lives
 * above the list. The message is announced and takes focus so keyboard and
 * screen-reader users land on it.
 */
export function TeamFeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{
    kind: "error" | "notice";
    text: string;
  } | null>(null);
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) {
      region.current?.focus();
    }
  }, [message]);

  const feedback: Feedback = {
    notice: (text) => setMessage({ kind: "notice", text }),
  };

  return (
    <FeedbackContext value={feedback}>
      <div className="min-h-0 space-y-1" ref={region} tabIndex={-1}>
        <p
          className="font-medium text-body text-primary empty:hidden"
          role="status"
        >
          {message?.kind === "notice" ? message.text : null}
        </p>
        <p
          className="font-medium text-body text-destructive empty:hidden"
          role="alert"
        >
          {message?.kind === "error" ? message.text : null}
        </p>
      </div>
      {children}
    </FeedbackContext>
  );
}

export function useTeamFeedback(): Feedback {
  const feedback = use(FeedbackContext);
  if (!feedback) {
    throw new Error("useTeamFeedback needs a TeamFeedbackProvider");
  }
  return feedback;
}
