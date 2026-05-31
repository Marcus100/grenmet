"use client";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { useState } from "react";
import DatePicker from "@/components/form/date-picker";
import { EyeCloseIcon, EyeIcon, TimeIcon } from "../../../icons";
import ComponentCard from "../../common/ComponentCard";
import Label from "../Label";

export default function DefaultInputs() {
  const [showPassword, setShowPassword] = useState(false);
  const options = [
    { value: "marketing", label: "Marketing" },
    { value: "template", label: "Template" },
    { value: "development", label: "Development" },
  ];

  return (
    <ComponentCard title="Default Inputs">
      <div className="space-y-6">
        <div>
          <Label>Input</Label>
          <Input type="text" />
        </div>
        <div>
          <Label>Input with Placeholder</Label>
          <Input placeholder="info@gmail.com" type="text" />
        </div>
        <div>
          <Label>Select Input</Label>
          <Select onValueChange={() => undefined}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue>Select an option</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Password Input</Label>
          <div className="relative">
            <Input
              placeholder="Enter your password"
              type={showPassword ? "text" : "password"}
            />
            <button
              className="absolute top-1/2 right-4 z-30 -translate-y-1/2 cursor-pointer"
              onClick={() => setShowPassword(!showPassword)}
              type="button"
            >
              {showPassword ? (
                <EyeIcon className="fill-muted-foreground" />
              ) : (
                <EyeCloseIcon className="fill-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        <div>
          <DatePicker
            id="date-picker"
            label="Date Picker Input"
            onChange={() => undefined}
            placeholder="Select a date"
          />
        </div>

        <div>
          <Label htmlFor="tm">Time Picker Input</Label>
          <div className="relative">
            <Input id="tm" name="tm" onChange={() => undefined} type="time" />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
              <TimeIcon />
            </span>
          </div>
        </div>
        <div>
          <Label htmlFor="tm">Input with Payment</Label>
          <div className="relative">
            <Input
              className="pl-[62px]"
              placeholder="Card number"
              type="text"
            />
            <span className="absolute top-1/2 left-0 flex h-11 w-[46px] -translate-y-1/2 items-center justify-center border-border border-r">
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                viewBox="0 0 20 20"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="6.25" cy="10" fill="#E80B26" r="5.625" />
                <circle cx="13.75" cy="10" fill="#F59D31" r="5.625" />
                <path
                  d="M10 14.1924C11.1508 13.1625 11.875 11.6657 11.875 9.99979C11.875 8.33383 11.1508 6.8371 10 5.80713C8.84918 6.8371 8.125 8.33383 8.125 9.99979C8.125 11.6657 8.84918 13.1625 10 14.1924Z"
                  fill="#FC6020"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </ComponentCard>
  );
}
