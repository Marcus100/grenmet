"use client";
import { EnvelopeIcon } from "../../../icons";
import ComponentCard from "../../common/ComponentCard";
import PhoneInput from "../group-input/PhoneInput";
import Input from "../input/InputField";
import Label from "../Label";

export default function InputGroup() {
  const countries = [
    { code: "US", label: "+1" },
    { code: "GB", label: "+44" },
    { code: "CA", label: "+1" },
    { code: "AU", label: "+61" },
  ];
  const handlePhoneNumberChange = (phoneNumber: string) => {
    console.log("Updated phone number:", phoneNumber);
  };
  return (
    <ComponentCard title="Input Group">
      <div className="space-y-6">
        <div>
          <Label>Email</Label>
          <div className="relative">
            <Input
              className="pl-[62px]"
              placeholder="info@gmail.com"
              type="text"
            />
            <span className="absolute top-1/2 left-0 -translate-y-1/2 border-gray-200 border-r px-3.5 py-3 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <EnvelopeIcon />
            </span>
          </div>
        </div>
        <div>
          <Label>Phone</Label>
          <PhoneInput
            countries={countries}
            onChange={handlePhoneNumberChange}
            placeholder="+1 (555) 000-0000"
            selectPosition="start"
          />
        </div>{" "}
        <div>
          <Label>Phone</Label>
          <PhoneInput
            countries={countries}
            onChange={handlePhoneNumberChange}
            placeholder="+1 (555) 000-0000"
            selectPosition="end"
          />
        </div>
      </div>
    </ComponentCard>
  );
}
