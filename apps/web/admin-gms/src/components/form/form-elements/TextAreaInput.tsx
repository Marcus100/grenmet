"use client";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";
import Label from "../Label";

export default function TextAreaInput() {
  const [message, setMessage] = useState("");
  const [messageTwo, setMessageTwo] = useState("");
  return (
    <ComponentCard title="Textarea input field">
      <div className="space-y-6">
        {/* Default */}
        <div>
          <Label>Description</Label>
          <Textarea
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            value={message}
          />
        </div>

        {/* Disabled */}
        <div>
          <Label>Description</Label>
          <Textarea disabled rows={6} />
        </div>

        {/* Error */}
        <div>
          <Label>Description</Label>
          <Textarea
            aria-invalid
            onChange={(e) => setMessageTwo(e.target.value)}
            rows={6}
            value={messageTwo}
          />
          <p className="mt-2 text-error-500 text-sm">
            Please enter a valid message.
          </p>
        </div>
      </div>
    </ComponentCard>
  );
}
