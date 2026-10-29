import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);
export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: port.default(3001),
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
    DATABASE_URL: z
      .url()
      .refine(
        (value) => /^postgres(?:ql)?:/.test(value),
        "PostgreSQL URL required",
      ),
    TEST_DATABASE_URL: z
      .url()
      .refine(
        (value) => /^postgres(?:ql)?:/.test(value),
        "PostgreSQL URL required",
      ),
    SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    SMTP_PORT: port.default(1025),
    AI_PROVIDER: z.enum(["disabled", "mock"]).default("disabled"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.AI_PROVIDER === "mock") {
      context.addIssue({
        code: "custom",
        path: ["AI_PROVIDER"],
        message: "Mock AI is forbidden in production",
      });
    }
    if (env.DATABASE_URL === env.TEST_DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["TEST_DATABASE_URL"],
        message: "Test database must be separate",
      });
    }
    if (
      env.NODE_ENV === "production" &&
      !env.WEB_ORIGIN.startsWith("https://")
    ) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "Hosted mode requires HTTPS",
      });
    }
  });
export type Environment = z.infer<typeof environmentSchema>;
export function parseEnvironment(input: Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}
