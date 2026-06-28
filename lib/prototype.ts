import { z } from "zod";

export const PrototypeSchema = z.object({
  name: z.string(),
  strategy: z.string(),
  sampleCopy: z.string(),
  highlight: z.string(),
  recommend: z.string(),
  html: z.string(),
});

export const PrototypesSchema = z.object({
  prototypes: z.array(PrototypeSchema),
});

export type Prototype = z.infer<typeof PrototypeSchema>;
