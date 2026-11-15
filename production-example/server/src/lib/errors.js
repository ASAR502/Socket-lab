export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function publicError(error) {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  console.error("Unhandled operation failure", error);
  return { code: "INTERNAL_ERROR", message: "Operation failed; retry with the same requestId" };
}
