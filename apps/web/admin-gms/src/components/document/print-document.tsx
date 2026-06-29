"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders the document full-size, portaled to `<body>` inside `[data-print-root]`.
 * The `@media print` rules in globals.css print only that node.
 */
export function PrintDocument({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(<div data-print-root>{children}</div>, document.body);
}
