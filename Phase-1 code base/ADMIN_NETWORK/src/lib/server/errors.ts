export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  details?: Record<string, unknown>;
  constructor(message: string, status = 400, retryAfter?: number, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}
