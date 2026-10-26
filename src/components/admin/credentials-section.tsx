"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SECRET_GROUPS,
  type SecretGroupDef,
  type SecretMetadataView,
} from "@/domain/admin-settings";
import { SecretInput } from "@/components/admin/secret-input";

export type CredentialsSectionProps = {
  secrets: Record<string, SecretMetadataView>;
  drafts: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onTest: (provider: SecretGroupDef["testProvider"]) => void;
  testingProvider: string | null;
};

/**
 * Renders every credential group as a card with write-only inputs and an
 * explicit connection test per provider.
 */
export function CredentialsSection({
  secrets,
  drafts,
  onDraftChange,
  onTest,
  testingProvider,
}: CredentialsSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      {SECRET_GROUPS.map((group) => {
        const isTesting = testingProvider === group.testProvider;

        return (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>
                Stored credentials are never displayed. Leave a field blank to keep its current
                value.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {group.fields.map((field) => (
                <SecretInput
                  key={field.key}
                  id={`secret-${field.key.replace(/\./g, "-")}`}
                  label={field.label}
                  isConfigured={Boolean(secrets[field.key]?.isConfigured)}
                  value={drafts[field.key] ?? ""}
                  onChange={(value) => onDraftChange(field.key, value)}
                  placeholder={field.placeholder}
                />
              ))}

              <div className="flex items-center gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`test-${group.id}`}
                  disabled={isTesting}
                  onClick={() => onTest(group.testProvider)}
                >
                  {isTesting ? "Testing…" : "Test connection"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
