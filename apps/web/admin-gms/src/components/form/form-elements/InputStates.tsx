"use client";
import type React from "react";
import { useState } from "react";
import ComponentCard from "../../common/ComponentCard";
import Input from "../input/InputField";
import Label from "../Label";

export default function InputStates() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);

  // Simulate a validation check
  const validateEmail = (value: string) => {
    const isValidEmail =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
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
        {/* Error Input */}
        <div>
          <Label>Email</Label>
          <Input
            defaultValue={email}
            error={error}
            hint={error ? "This is an invalid email address." : ""}
            onChange={handleEmailChange}
            placeholder="Enter your email"
            type="email"
          />
        </div>

        {/* Success Input */}
        <div>
          <Label>Email</Label>
          <Input
            defaultValue={email}
            hint={error ? "" : "Valid email!"}
            onChange={handleEmailChange}
            placeholder="Enter your email"
            success={!error}
            type="email"
          />
        </div>

        {/* Disabled Input */}
        <div>
          <Label>Email</Label>
          <Input
            defaultValue="disabled@barrels.gd"
            disabled={true}
            hint="This field is disabled."
            placeholder="Disabled email"
            type="text"
          />
        </div>
      </div>
    </ComponentCard>
  );
}
