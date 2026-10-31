/**
 * Calendar provider identifier.
 */
export type CalendarProviderName = "google" | "outlook";

/**
 * Calendar operations that can be performed by adapters.
 */
export type CalendarOperation = "getBusyIntervals" | "createEvent" | "deleteEvent" | "refreshToken";

/**
 * Initialization options for CalendarProviderError.
 */
export type CalendarProviderErrorOptions = {
  message: string;
  provider: CalendarProviderName;
  operation: CalendarOperation;
  status?: number;
  cause?: unknown;
};

/**
 * Standard error thrown by calendar provider adapters.
 * Never embed raw credentials, access tokens, or sensitive response bodies.
 */
export class CalendarProviderError extends Error {
  readonly provider: CalendarProviderName;
  readonly operation: CalendarOperation;
  readonly status?: number;

  constructor(options: CalendarProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "CalendarProviderError";
    this.provider = options.provider;
    this.operation = options.operation;
    this.status = options.status;
  }
}
