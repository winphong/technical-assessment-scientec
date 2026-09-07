// Base URL is baked in at build time (docker-compose sets VITE_API_BASE_URL for the
// nginx-served production build); falls back to the local dev backend port otherwise.
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set Content-Type when there's actually a body: Fastify's JSON body parser
  // runs for any method that can carry a payload (DELETE included, unlike GET/HEAD)
  // and throws FST_ERR_CTP_EMPTY_JSON_BODY if it sees application/json on an empty body.
  const headers = init?.body !== undefined ? { "Content-Type": "application/json", ...init?.headers } : init?.headers;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : res.statusText;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}
