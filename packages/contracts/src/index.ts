import { z } from "zod";
export const providerModeSchema = z.enum(["disabled", "mock"]);
export type ProviderMode = z.infer<typeof providerModeSchema>;
