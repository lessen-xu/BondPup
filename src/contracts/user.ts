import { z } from "zod";

export const UserProfile = z.object({
  displayName: z.string().optional(),
  expressionPrefs: z.array(z.string()).optional(),
  mainGoalId: z.string().optional(),
  ageConfirmed: z.boolean().optional(),
  createdAt: z.iso.datetime(),
});
export type UserProfile = z.infer<typeof UserProfile>;

export const OutfitState = z.object({
  owned: z.array(z.string()),
  equipped: z.array(z.string()),
  unlockSource: z.record(z.string(), z.string()),
  assetsVersion: z.number().int().min(0),
});
export type OutfitState = z.infer<typeof OutfitState>;

export const SafetyRiskType = z.enum([
  "self_harm",
  "debt_loan",
  "investment",
  "generic_emotion",
  "other",
]);
export type SafetyRiskType = z.infer<typeof SafetyRiskType>;

/** 有意不设用户原文字段:schema 层面就不给存的地方 */
export const SafetyEvent = z.object({
  id: z.string().min(1),
  riskType: SafetyRiskType,
  triggeredRule: z.string(),
  responseTaken: z.string(),
  createdAt: z.iso.datetime(),
});
export type SafetyEvent = z.infer<typeof SafetyEvent>;
