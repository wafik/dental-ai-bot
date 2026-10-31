"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AI_FIELDS, type AiSettings } from "@/domain/admin-settings";
import { aiFieldErrors } from "@/utils/form-validation";

export type AiEndpointFieldsProps = {
  ai: AiSettings;
  onChange: (patch: Partial<AiSettings>) => void;
  /** Prevents edits before the stored settings arrive and overwrite them. */
  disabled?: boolean;
};

/**
 * Editable, non-secret half of the OpenAI configuration: the endpoint the
 * chat adapter calls and the model name it sends. Rendered inside the OpenAI
 * credentials card so one provider is configured in one place.
 */
export function AiEndpointFields({ ai, onChange, disabled = false }: AiEndpointFieldsProps) {
  const errors = aiFieldErrors(ai);

  return (
    <>
      {AI_FIELDS.map((field) => {
        const id = `ai-${field.key}`;
        const error = errors[field.key];

        return (
          <Field key={field.key} data-invalid={Boolean(error)} className="gap-1.5">
            <FieldLabel htmlFor={id} className="text-foreground">
              {field.label}
            </FieldLabel>
            <Input
              id={id}
              value={ai[field.key]}
              placeholder={field.placeholder}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => onChange({ [field.key]: event.target.value })}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : `${id}-hint`}
              className={cn(error && "border-destructive focus-visible:ring-destructive")}
            />
            {error ? (
              <FieldError id={`${id}-error`} className="text-xs">
                {error}
              </FieldError>
            ) : (
              <FieldDescription id={`${id}-hint`} className="text-xs">
                {field.hint}
              </FieldDescription>
            )}
          </Field>
        );
      })}
    </>
  );
}
