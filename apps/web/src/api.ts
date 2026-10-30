import type { z } from "zod";
export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string | null,
  ) {
    super(
      status === 401
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
  if (!response.ok)
    throw new ApiClientError(
      response.status,
      response.headers.get("x-request-id"),
    );
  return schema.parse(await response.json());
}
