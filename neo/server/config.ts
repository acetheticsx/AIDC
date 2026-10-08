import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000)
});

export const config = ConfigSchema.parse({
  HOST: process.env.HOST,
  PORT: process.env.PORT
});
