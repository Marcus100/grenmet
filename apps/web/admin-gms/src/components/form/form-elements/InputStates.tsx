"use client";
import { Input } from "@grenmet/ui/components/ui/input";
import type React from "react";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";
import Label from "../Label";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function InputStates() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);

  const validateEmail = (value: string) => {
    const isValidEmail = EMAIL_REGEX.test(value);
    setError(!isValidEmail);
    return isValidEmail;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    validateEmail(value);
  };

  return (
    <ComponentCard
      desc="Validation styles for error, success and disabled states on form controls."
      title="Input States"
    >
      <div className="space-y-5 sm:space-y-6">
        {/* Error state */}
        <div>
          <Label>Email</Label>
          <Input
            aria-invalid={error}
            defaultValue={email}
            onChange={handleEmailChange}
            placeholder="Enter your email"
            type="email"
          />
          {error && (
            <p className="mt-1.5 text-error-500 text-xs">
              This is an invalid email address.
            </p>
          )}
        </div>

        {/* Success state */}
        <div>
          <Label>Email</Label>
          <Input
            defaultValue={email}
            onChange={handleEmailChange}
            placeholder="Enter your email"
            type="email"
          />
          {!error && email && (
            <p className="mt-1.5 text-success-500 text-xs">Valid email!</p>
          )}
        </div>

        {/* Disabled state */}
        <div>
          <Label>Email</Label>
          <Input
            defaultValue="disabled@weather.gd"
            disabled
            placeholder="Disabled email"
            type="text"
          />
          <p className="mt-1.5 text-muted-foreground text-xs">
            This field is disabled.
          </p>
        </div>
      </div>
    </ComponentCard>
  );
}
