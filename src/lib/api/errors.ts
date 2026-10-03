export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function unauthorized(message = "Authentication is required") {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "You do not have permission to perform this action") {
  return new AppError("FORBIDDEN", message, 403);
}

export function notFound(message = "Resource not found") {
  return new AppError("NOT_FOUND", message, 404);
}

export function conflict(message = "The resource is already in that state") {
  return new AppError("CONFLICT", message, 409);
}

export function validationError(details: unknown) {
  return new AppError("VALIDATION_ERROR", "Request validation failed", 422, details);
}

