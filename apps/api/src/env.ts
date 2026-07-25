import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  WEB_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3010),
  DATABASE_URL: z.string().url(),
  MONGODB_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BOOTSTRAP_ADMIN_KEY: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "must decode to exactly 32 bytes",
    ),
  SESSION_PEPPER: z.string().min(32),
  OPERATOR_METRICS_TOKEN: z.string().min(32),
});

export const parseEnvironment = (input: NodeJS.ProcessEnv) =>
  environmentSchema.parse(input);
