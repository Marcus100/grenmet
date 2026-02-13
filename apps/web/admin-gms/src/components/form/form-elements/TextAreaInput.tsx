"use client";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";
import TextArea from "../input/TextArea";
import Label from "../Label";

export default function TextAreaInput() {
  const [message, setMessage] = useState("");
  const [messageTwo, setMessageTwo] = useState("");
  return (
    <ComponentCard title="Textarea input field">
      <div className="space-y-6">
        {/* Default TextArea */}
        <div>
          <Label>Description</Label>
          <TextArea
            onChange={(value) => setMessage(value)}
            rows={6}
            value={message}
          />
        </div>

        {/* Disabled TextArea */}
        <div>
          <Label>Description</Label>
          <TextArea disabled rows={6} />
        </div>

        {/* Error TextArea */}
        <div>
          <Label>Description</Label>
          <TextArea
            error
            hint="Please enter a valid message."
            onChange={(value) => setMessageTwo(value)}
            rows={6}
            value={messageTwo}
          />
        </div>
      </div>
    </ComponentCard>
  );
}
