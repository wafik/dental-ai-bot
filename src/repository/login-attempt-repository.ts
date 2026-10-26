export type LoginAttemptRepository = {
  recordFailure(identifier: string, atIso: string): Promise<void>;
  countFailures(identifier: string, sinceIso: string): Promise<number>;
  clear(identifier: string): Promise<void>;
};
