import type React from "react";
import type { FC } from "react";

interface FileInputProps {
  className?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const FileInput: FC<FileInputProps> = ({ className, onChange }) => (
  <input
    className={`h-11 w-full overflow-hidden rounded-lg border border-border bg-transparent text-muted-foreground text-sm shadow-gm-card transition-colors file:mr-5 file:border-collapse file:cursor-pointer file:rounded-l-lg file:border-0 file:border-border file:border-r file:border-solid file:bg-muted file:py-3 file:pr-3 file:pl-3.5 file:text-foreground file:text-sm placeholder:text-muted-foreground hover:file:bg-muted focus:border-ring-brand-300 focus:outline-hidden focus:file:ring-brand-300 ${className}`}
    onChange={onChange}
    type="file"
  />
);

export default FileInput;
