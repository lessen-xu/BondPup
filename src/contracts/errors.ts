import { z } from "zod";

export const ErrorCode = z.enum([
  "validation_error",
  "not_found",
  "state_conflict",
  "model_timeout",
  "rate_limited",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  state_conflict: 409,
  model_timeout: 504,
  rate_limited: 429,
  internal_error: 500,
};

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "DomainError";
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}
