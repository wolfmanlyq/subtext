import { z } from "zod";

export const PriorityEnum = z.enum(["必须修改", "建议优化", "需确认"]);

export const ActionItemSchema = z.object({
  desc: z.string(),
  priority: PriorityEnum,
  roles: z.array(z.string()),
  risk: z.string(),
});

export const ActionCardSchema = z.object({
  needMoreInfo: z.boolean(),
  oneLineTranslation: z.string(),
  explicitNeeds: z.array(z.string()),
  implicitNeeds: z.array(z.string()),
  coreConflict: z.string(),
  feedbackTypes: z.array(z.string()),
  items: z.array(ActionItemSchema),
  questionsToAsk: z.array(z.string()),
  replyScript: z.string(),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;
export type ActionCard = z.infer<typeof ActionCardSchema>;
