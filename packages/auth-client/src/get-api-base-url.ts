export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return (window as unknown as { __GRENMET_API_URL__?: string })
      .__GRENMET_API_URL__ ?? "";
  }
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL ?? "";
  }
  return "";
}
