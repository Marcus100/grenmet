import { getApiClientConfig } from "./configure.js";

export interface RequestConfig<TData = unknown> {
  data?: TData;
  headers?: Record<string, string>;
  method: string;
  params?: unknown;
  signal?: AbortSignal;
  url: string;
}

export type ResponseErrorConfig<T = unknown> = Error & {
  status?: number;
  statusText?: string;
  response?: { status: number; data?: T };
};

export type Client = typeof client;

const TRAILING_SLASH_REGEX = /\/$/;

function buildUrl(baseURL: string | undefined, path: string): string {
  if (!baseURL) return path;
  const base = baseURL.replace(TRAILING_SLASH_REGEX, "");
  if (path.startsWith("/")) {
    return `${base}${path}`;
  }
  return `${base}/${path}`;
}

function buildQueryString(params?: unknown): string {
  if (!params || typeof params !== "object" || Array.isArray(params)) return "";
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  const searchParams = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

function buildBody(
  data: unknown,
  contentType?: string
): string | FormData | undefined {
  if (data === undefined || data === null) return;
  if (data instanceof FormData) return data;
  if (
    contentType?.includes("application/x-www-form-urlencoded") &&
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data)
  ) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    return params.toString();
  }
  return JSON.stringify(data);
}

function getContentType(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === "content-type"
  );
  return key ? headers[key] : undefined;
}

async function client<T, E = unknown, D = unknown>(
  config: RequestConfig & { data?: D }
): Promise<{ data: T; status: number; statusText: string }> {
  const { baseURL, getHeaders } = getApiClientConfig();
  const { method, url, params, data, headers = {}, signal } = config;

  const fullUrl = buildUrl(baseURL, url) + buildQueryString(params);
  const authHeaders = getHeaders?.() ?? {};
  const mergedHeaders: Record<string, string> = {
    ...authHeaders,
    ...headers,
  };

  const contentType = getContentType(mergedHeaders);
  const body = buildBody(data, contentType);

  if (body && typeof body === "string" && !contentType) {
    mergedHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(fullUrl, {
    method,
    headers: mergedHeaders,
    body,
    signal,
  });

  if (!response.ok) {
    let detail: E | undefined;
    const text = await response.text();
    try {
      detail = text ? (JSON.parse(text) as E) : undefined;
    } catch {
      detail = { message: text || response.statusText } as E;
    }
    const error = Object.assign(new Error(response.statusText), {
      status: response.status,
      statusText: response.statusText,
      response: { status: response.status, data: detail },
      ...(typeof detail === "object" && detail !== null ? detail : {}),
    });
    throw error;
  }

  let responseData: T;
  const responseText = await response.text();
  if (responseText) {
    try {
      responseData = JSON.parse(responseText) as T;
    } catch {
      responseData = responseText as unknown as T;
    }
  } else {
    responseData = undefined as unknown as T;
  }

  return {
    data: responseData,
    status: response.status,
    statusText: response.statusText,
  } as { data: T; status: number; statusText: string };
}

export default client;
