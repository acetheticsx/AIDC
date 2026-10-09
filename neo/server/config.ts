import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().optional(),
  ACE_ID_ISSUER: z.string().optional(),
  ACE_ID_CLIENT_ID: z.string().optional(),
  ACE_ID_CLIENT_SECRET: z.string().optional(),
  AIDC_PUBLIC_ORIGIN: z.string().optional(),
  AIDC_ENTITLEMENTS_SHARED_SECRET: z.string().optional(),
  AIDC_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value !== "false"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10)
});

export const getConfig = () =>
  ConfigSchema.parse({
    HOST: process.env.HOST,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    ACE_ID_ISSUER: process.env.ACE_ID_ISSUER,
    ACE_ID_CLIENT_ID: process.env.ACE_ID_CLIENT_ID,
    ACE_ID_CLIENT_SECRET: process.env.ACE_ID_CLIENT_SECRET,
    AIDC_PUBLIC_ORIGIN: process.env.AIDC_PUBLIC_ORIGIN,
    AIDC_ENTITLEMENTS_SHARED_SECRET: process.env.AIDC_ENTITLEMENTS_SHARED_SECRET,
    AIDC_TRUST_PROXY_HOPS: process.env.AIDC_TRUST_PROXY_HOPS,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX
  });
