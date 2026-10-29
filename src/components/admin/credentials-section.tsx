"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SECRET_GROUPS,
  type AiSettings,
  type SecretGroupDef,
  type SecretMetadataView,
} from "@/domain/admin-settings";
import { AiEndpointFields } from "@/components/admin/ai-endpoint-fields";
import { SecretInput } from "@/components/admin/secret-input";
import { parseGoogleServiceAccountJson } from "@/utils/google-service-account";
import { validateSecretField } from "@/utils/form-validation";

export type CredentialsSectionProps = {
  secrets: Record<string, SecretMetadataView>;
  drafts: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onTest: (provider: SecretGroupDef["testProvider"]) => void;
  testingProvider: string | null;
  ai: AiSettings;
  onAiChange: (patch: Partial<AiSettings>) => void;
};

/**
 * Reads the picked key file in the browser and fills the two service-account
 * drafts. The file itself is never uploaded anywhere.
 */
function GoogleKeyFileInput({ onLoad }: { onLoad: (email: string, privateKey: string) => void }) {
  const inputId = "google-service-account-file";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        Load key JSON
      </label>
      <input
        id={inputId}
        type="file"
        accept="application/json,.json"
        data-testid="google-key-file"
        className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          const parsed = parseGoogleServiceAccountJson(await file.text());
          if (!parsed) {
            toast.error("That file is not a Google service-account key JSON.");
            event.target.value = "";
            return;
          }

          onLoad(parsed.email, parsed.privateKey);
          toast.success("Key JSON loaded into the fields below. Review, then save.");
          event.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">
        The file is read in your browser only. Its two values appear as unsaved drafts until you
        save, then they are encrypted.
      </p>
    </div>
  );
}

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
  ai,
  onAiChange,
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
              {group.id === "google" ? (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Which credentials to use</p>
                  <p className="mt-1">
                    Enter <span className="font-medium text-foreground">either</span> the service
                    account pair or the delegated OAuth triple. Service account values come from the
                    downloaded key JSON: Service Account Email is its{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">client_email</code> and
                    Service Account Private Key is its{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">private_key</code>. When
                    both methods are configured, the service account is used.
                  </p>
                  <p className="mt-1">
                    The service account email is not your own Gmail address. It ends in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      @&lt;project&gt;.iam.gserviceaccount.com
                    </code>
                    , and the calendars must be shared with that exact address.
                  </p>
                </div>
              ) : null}

              {group.id === "google" ? (
                <GoogleKeyFileInput
                  onLoad={(email, privateKey) => {
                    onDraftChange("google.serviceAccountEmail", email);
                    onDraftChange("google.serviceAccountPrivateKey", privateKey);
                  }}
                />
              ) : null}

              {group.fields.map((field) => (
                <SecretInput
                  key={field.key}
                  id={`secret-${field.key.replace(/\./g, "-")}`}
                  label={field.label}
                  isConfigured={Boolean(secrets[field.key]?.isConfigured)}
                  value={drafts[field.key] ?? ""}
                  onChange={(value) => onDraftChange(field.key, value)}
                  placeholder={field.placeholder}
                  error={validateSecretField(field.key, drafts[field.key] ?? "")}
                />
              ))}

              {group.id === "openai" ? <AiEndpointFields ai={ai} onChange={onAiChange} /> : null}

              <div className="flex items-center gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`test-${group.id}`}
                  disabled={
                    isTesting ||
                    group.fields.some((field) =>
                      Boolean(validateSecretField(field.key, drafts[field.key] ?? "")),
                    )
                  }
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
