import { z } from "zod";

// Single source of truth for what a valid CSV data row looks like. Used by the backend
// to validate each parsed row (rejecting/collecting invalid ones without failing the
// whole upload) and importable by the frontend if it ever needs to pre-validate.
export const csvRowSchema = z.object({
  id: z.coerce.number().int().positive(),
  postId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  body: z.string(),
});

export type CsvRowSchema = z.infer<typeof csvRowSchema>;

export const resolveConflictBodySchema = z.object({
  resolution: z.enum(["keep_old", "keep_new"]),
});

export type ResolveConflictBody = z.infer<typeof resolveConflictBodySchema>;

export const recordsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type RecordsQuery = z.infer<typeof recordsQuerySchema>;
