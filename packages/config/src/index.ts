import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);
export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    CSRF_SECRET: z
      .string()
      .min(32)
      .default("local-development-only-csrf-secret-change-before-hosting"),
    ARGON2_MEMORY_KIB: z.coerce
      .number()
      .int()
      .min(19456)
      .max(65536)
      .default(19456),
    ARGON2_TIME_COST: z.coerce.number().int().min(2).max(6).default(2),
    AUTH_VERIFY_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    AUTH_RESET_MINUTES: z.coerce.number().int().min(1).max(60).default(30),
    AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_MAIL_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
    AUTH_RATE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86400)
      .default(900),
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
    if (
      env.NODE_ENV === "production" &&
      env.CSRF_SECRET.startsWith("local-development-only")
    ) {
      context.addIssue({
        code: "custom",
        path: ["CSRF_SECRET"],
        message: "Hosted mode requires a unique CSRF secret",
      });
    }
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
