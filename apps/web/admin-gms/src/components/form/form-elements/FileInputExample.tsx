"use client";
import type React from "react";
import ComponentCard from "../../common/ComponentCard";
import FileInput from "../input/FileInput";
import Label from "../Label";

export default function FileInputExample() {
  const handleFileChange = (_event: React.ChangeEvent<HTMLInputElement>) =>
    undefined;

  return (
    <ComponentCard title="File Input">
      <div>
        <Label>Upload file</Label>
        <FileInput className="custom-class" onChange={handleFileChange} />
      </div>
    </ComponentCard>
  );
}
