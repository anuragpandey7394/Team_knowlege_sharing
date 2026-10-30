import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
export class AuthClient {
  cookies = new Map<string, string>();
  csrfToken = "";
  ip = `127.0.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
  constructor(
    public app: FastifyInstance,
    public origin = "http://localhost:5173",
  ) {}
  cookieHeader() {
    return [...this.cookies]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }
  async request(
    path: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await this.app.inject({
      method,
      url: path,
      remoteAddress: this.ip,
      headers: {
        origin: this.origin,
        cookie: this.cookieHeader(),
        ...(method === "POST"
          ? {
              "content-type": "application/json",
              "x-csrf-token": this.csrfToken,
            }
          : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    const values = response.headers["set-cookie"];
    for (const value of typeof values === "string"
      ? [values]
      : (values ?? [])) {
      const pair = value.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index > 0)
        this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async post(path: string, body: unknown) {
    const csrf = await this.request("/api/v1/auth/csrf");
    if (csrf.statusCode !== 200)
      throw new Error(`CSRF bootstrap failed: ${csrf.statusCode}`);
    this.csrfToken = csrf.json().csrfToken;
    return this.request(path, "POST", body);
  }
}
export async function mailToken(
  email: string,
  subject: string,
  excluded: string[] = [],
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const inbox = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((r) => r.json())) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const message = inbox.messages.find(
      (message) =>
        message.Subject === subject &&
        message.To.some((to) => to.Address === email),
    );
    if (message) {
      const detail = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${message.ID}`,
      ).then((r) => r.json())) as { Text: string };
      const token = detail.Text.match(/#token=([a-f0-9]{64})/)?.[1];
      if (token && !excluded.includes(token)) return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Expected synthetic email/token not received");
}
export const newEmail = () => `${randomBytes(10).toString("hex")}@example.test`;
export const password = "Synthetic correct horse battery 42";
