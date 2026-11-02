"use client";

import { Card } from "@barrelsgd/ui/components/ui/card";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The shared desk: editor | preview | archive/history. The archive card sits
 * under whichever column is shorter. Used by weather products and HR forms.
 */
export function DeskLayout({
  editor,
  preview,
  archive,
}: {
  editor: ReactNode;
  preview: ReactNode;
  archive: ReactNode;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [belowEditor, setBelowEditor] = useState(false);

  useEffect(() => {
    const editorPanel = editorRef.current;
    const previewPanel = previewRef.current;
    if (!(editorPanel && previewPanel)) return;
    function measure() {
      if (!(editorPanel && previewPanel)) return;
      // Measure only the content, never the archive that changes columns.
      setBelowEditor(
        editorPanel.getBoundingClientRect().height <
          previewPanel.getBoundingClientRect().height
      );
    }
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(editorPanel);
    observer.observe(previewPanel);
    return () => observer.disconnect();
  }, []);

  const archiveCard = (
    <Card className="order-3 min-w-0 gap-4 p-4">{archive}</Card>
  );

  return (
    <div className="grid items-start gap-4 @4xl:grid-cols-2">
      <div className="contents @4xl:block @4xl:min-w-0 @4xl:space-y-4">
        <div
          className="order-1 min-w-0"
          data-slot="desk-editor-panel"
          ref={editorRef}
        >
          {editor}
        </div>
        {belowEditor ? archiveCard : null}
      </div>
      <div className="contents @4xl:block @4xl:min-w-0 @4xl:space-y-4">
        <div
          className="order-2 min-w-0"
          data-slot="desk-preview-panel"
          ref={previewRef}
        >
          {preview}
        </div>
        {belowEditor ? null : archiveCard}
      </div>
    </div>
  );
}
