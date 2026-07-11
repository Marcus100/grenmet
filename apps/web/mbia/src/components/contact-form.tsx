"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@grenmet/ui/components/ui/native-select";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useState } from "react";
import { CONTACT_SUBJECTS, contactSchema } from "@/lib/contact";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

export function ContactForm() {
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      setState({
        status: "error",
        message: parsed.error.issues[0]?.message ?? "Please check the form",
      });
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setState({
          status: "error",
          message: body.error ?? "Something went wrong — please try again.",
        });
        return;
      }
      form.reset();
      setState({ status: "success" });
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server — please try again.",
      });
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input id="contact-email" name="email" required type="email" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-subject">Subject</Label>
        <NativeSelect className="w-full" id="contact-subject" name="subject">
          {CONTACT_SUBJECTS.map((subject) => (
            <NativeSelectOption key={subject} value={subject}>
              {subject}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea id="contact-message" name="message" required rows={6} />
      </div>
      <Button
        className="bg-gaa-navy text-white hover:bg-gaa-navy-deep"
        disabled={state.status === "submitting"}
        type="submit"
      >
        {state.status === "submitting" ? "Sending…" : "Send message"}
      </Button>
      {state.status === "success" && (
        <p className="text-gaa-status-ontime text-sm" role="status">
          Thank you — your message has been received.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-gaa-status-cancelled text-sm" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
