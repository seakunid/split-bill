import type { ApiError } from "@split-bill/shared";

export class HttpError extends Error {
  readonly status: number;
  readonly issues?: NonNullable<ApiError["issues"]>;

  constructor(message: string, status: number, issues?: NonNullable<ApiError["issues"]>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.issues = issues;
  }
}
