export type CameraProblem = "denied" | "in-use" | "no-camera" | "failed";

export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, string> = {
  denied:
    "Camera access is blocked. Allow the camera for this app in the phone's settings, then try again.",
  "in-use": "The camera is being used by another app. Close it and try again.",
  "no-camera": "No camera was found on this device.",
  failed: "The camera could not be started. Close the app and open it again.",
};

/** Maps the browser's error names to something gate staff can act on. */
export function cameraProblemFor(error: unknown): CameraProblem {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "denied";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "in-use";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "no-camera";
  }
  return "failed";
}
