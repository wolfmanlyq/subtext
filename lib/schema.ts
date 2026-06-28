import { z } from "zod";

export const RealDemandSchema = z.object({
  explicit: z.array(z.string()),
  implicit: z.array(z.string()),
});

export const TensionSchema = z.object({
  left: z.string(),
  right: z.string(),
  leftPercent: z.number(),
  rightPercent: z.number(),
  note: z.string(),
});

export const NextActionSchema = z.object({
  role: z.string(),
  title: z.string(),
  detail: z.string(),
  reason: z.string(),
});

export const CoreSchema = z.object({
  needMoreInfo: z.boolean(),
  realDemand: RealDemandSchema,
  coreTension: z.array(TensionSchema),
  foresight: z.array(z.string()),
  evidence: z.array(z.string()),
  questionsToConfirm: z.array(z.string()),
});

export const DeliverySchema = z.object({
  clientReply: z.string(),
  checklist: z.array(z.string()),
  nextActions: z.array(NextActionSchema),
});

export type RealDemand = z.infer<typeof RealDemandSchema>;
export type Tension = z.infer<typeof TensionSchema>;
export type NextAction = z.infer<typeof NextActionSchema>;
export type Core = z.infer<typeof CoreSchema>;
export type Delivery = z.infer<typeof DeliverySchema>;
