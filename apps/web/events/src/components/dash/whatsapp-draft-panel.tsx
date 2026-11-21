"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";
import { reportError } from "@/lib/report-error";
import type { WhatsAppDraft } from "@/lib/whatsapp-draft";

export function WhatsAppDraftPanel({ facts, prompt }: WhatsAppDraft) {
  const [opening, setOpening] = useState("Join us!");
  const [feedback, setFeedback] = useState("");
  const draft = [opening.trim(), facts].filter(Boolean).join("\n\n");

  async function copy(text: string, label: "Draft" | "AI prompt") {
    const manual = `Select the ${label.toLowerCase()} text to copy it.`;
    if (!navigator.clipboard) {
      setFeedback(manual);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied.`);
    } catch (error) {
      reportError(error, "events.whatsapp-draft.clipboard");
      setFeedback(manual);
    }
  }

  return (
    <section
      aria-labelledby="whatsapp-draft-heading"
      className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h2
          className="font-display text-heading-sm font-semibold"
          id="whatsapp-draft-heading"
        >
          WhatsApp announcement
        </h2>
        <p className="text-body text-muted-foreground">
          Review the wording and saved event details before sending.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="whatsapp-opening">Opening line</Label>
        <Input
          id="whatsapp-opening"
          maxLength={140}
          onChange={(event) => {
            setOpening(event.currentTarget.value);
            setFeedback("");
          }}
          value={opening}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whatsapp-draft">Draft preview</Label>
        <Textarea id="whatsapp-draft" readOnly rows={6} value={draft} />
        <Button onClick={() => copy(draft, "Draft")} type="button">
          Copy draft
        </Button>
      </div>
      <details className="space-y-3">
        <summary className="text-body w-fit cursor-pointer font-medium">
          Use an AI prompt
        </summary>
        <p className="text-body text-muted-foreground">
          Paste the prompt into your approved AI tool. Review its suggestion
          before using it as the opening line.
        </p>
        <Textarea aria-label="AI prompt" readOnly rows={8} value={prompt} />
        <Button
          onClick={() => copy(prompt, "AI prompt")}
          type="button"
          variant="outline"
        >
          Copy AI prompt
        </Button>
      </details>
      <p className="text-body text-muted-foreground" role="status">
        {feedback}
      </p>
    </section>
  );
}
