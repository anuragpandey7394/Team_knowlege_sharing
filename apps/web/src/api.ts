import type { z } from "zod";
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
    public readonly code: string = "REQUEST_FAILED",
  ) {
    super(
      code === "INVALID_CREDENTIALS"
        ? "Email or password is incorrect."
        : code === "TOKEN_INVALID"
          ? "This link is invalid or expired. Request a new email."
          : status === 429
            ? "Too many attempts. Try again later."
            : status === 401
              ? "Please sign in to continue."
              : "The request failed. Please retry.",
    );
  }
}
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...init.headers },
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as {
      code?: string;
    };
    throw new ApiClientError(
      response.status,
      response.headers.get("x-request-id"),
      failure.code,
    );
  }
  return schema.parse(await response.json());
}
