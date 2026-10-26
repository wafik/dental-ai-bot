"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export type SecretInputProps = {
  id: string;
  label: string;
  isConfigured: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onTest?: () => void;
  testDisabled?: boolean;
};

const CONFIGURED_PLACEHOLDER = "•••••••• (leave blank to keep current value)";

/**
 * Write-only credential field. Only the unsaved draft is ever held in state;
 * the stored secret never reaches the browser or the markup.
 */
export function SecretInput({
  id,
  label,
  isConfigured,
  value,
  onChange,
  placeholder,
  onTest,
  testDisabled,
}: SecretInputProps) {
  const [revealed, setRevealed] = React.useState(false);
  const hasDraft = value.length > 0;

  React.useEffect(() => {
    if (!hasDraft) {
      setRevealed(false);
    }
  }, [hasDraft]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {isConfigured && !hasDraft ? <Badge variant="success">Configured</Badge> : null}
      </div>

      <div className="relative">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          value={value}
          placeholder={isConfigured && !hasDraft ? CONFIGURED_PLACEHOLDER : placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="pr-10"
        />
        {hasDraft ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? "Hide value" : "Show value"}
            aria-pressed={revealed}
            className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        ) : null}
      </div>

      {onTest ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onTest}
            disabled={testDisabled}
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Test this field
          </button>
        </div>
      ) : null}
    </div>
  );
}
