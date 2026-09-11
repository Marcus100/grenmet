"use client";
import { useField } from "@payloadcms/ui";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function MarkdownPreview() {
  const { value } = useField<string>({ path: "body" });
  return (
    <details>
      <summary>Preview</summary>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml>
        {value ?? ""}
      </Markdown>
    </details>
  );
}
