export type AdminSessionRecord = {
  id: string;
  tokenHash: string;
  username: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type AdminSessionRepository = {
  create(input: {
    tokenHash: string;
    username: string;
    nowIso: string;
    expiresAt: string;
  }): Promise<AdminSessionRecord>;
  findActiveByTokenHash(tokenHash: string, nowIso: string): Promise<AdminSessionRecord | null>;
  touch(id: string, nowIso: string): Promise<void>;
  revoke(tokenHash: string): Promise<void>;
  revokeAll(): Promise<void>;
  purgeExpired(nowIso: string): Promise<void>;
};
