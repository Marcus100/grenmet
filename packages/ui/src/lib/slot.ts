import type React from "react";
import { cloneElement, isValidElement } from "react";

type AnyProps = Record<string, unknown>;

function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps };

  for (const key of Object.keys(childProps)) {
    const slotVal = slotProps[key];
    const childVal = childProps[key];

    if (key === "className") {
      merged[key] = [slotVal, childVal].filter(Boolean).join(" ");
    } else if (key === "style") {
      merged[key] = { ...(slotVal as object), ...(childVal as object) };
    } else if (
      typeof slotVal === "function" &&
      typeof childVal === "function"
    ) {
      merged[key] = (...args: unknown[]) => {
        (childVal as (...a: unknown[]) => void)(...args);
        (slotVal as (...a: unknown[]) => void)(...args);
      };
    } else {
      merged[key] = childVal !== undefined ? childVal : slotVal;
    }
  }

  return merged;
}

export function Slot({
  children,
  ...slotProps
}: { children?: React.ReactNode } & AnyProps) {
  if (!isValidElement(children)) return null;
  return cloneElement(
    children,
    mergeProps(slotProps, children.props as AnyProps) as AnyProps
  );
}
