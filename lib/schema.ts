import { z } from "zod";

export const ConflictSchema = z.object({
  left: z.string(),
  right: z.string(),
});

export const RoleActionSchema = z.object({
  role: z.string(),
  title: z.string(),
  desc: z.string(),
});

export const ActionCardSchema = z.object({
  needMoreInfo: z.boolean(),
  emotionIntensity: z.string(),
  agentJudgment: z.string(),
  feedbackTypes: z.array(z.string()),
  explicitNeeds: z.array(z.string()),
  implicitNeeds: z.array(z.string()),
  conflicts: z.array(ConflictSchema),
  risks: z.array(z.string()),
  evidence: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
  roleActions: z.array(RoleActionSchema),
  checklist: z.array(z.string()),
  replyScript: z.string(),
});

export type Conflict = z.infer<typeof ConflictSchema>;
export type RoleAction = z.infer<typeof RoleActionSchema>;
export type ActionCard = z.infer<typeof ActionCardSchema>;
