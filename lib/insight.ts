import { z } from "zod";

export const InsightSchema = z.object({
  keyInsight: z.string(),
  emotionIntensity: z.string(),
});

export type Insight = z.infer<typeof InsightSchema>;
