export type SecretMetadata = {
  key: string;
  isConfigured: boolean;
  updatedAt?: string;
};

/**
 * Write-only secret storage. Implementations must never expose plaintext
 * through reads; getSecret is for server-side provider construction only.
 */
export type SecretRepository = {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, plaintext: string): Promise<void>;
  getMetadata(keys: readonly string[]): Promise<Record<string, SecretMetadata>>;
};
