"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/admin/secret-input";
import { adminLoginSchema, collectFieldErrors } from "@/utils/form-validation";

/**
 * Authenticates the single deployment-configured admin account and navigates
 * to the settings page on success.
 */
export function AdminLoginForm() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [touched, setTouched] = React.useState({ username: false, password: false });

  const errors = collectFieldErrors(adminLoginSchema, { username, password });
  const visibleErrors = {
    username: touched.username ? errors.username : undefined,
    password: touched.password ? errors.password : undefined,
  };
  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ username: true, password: true });
    if (pending || !isValid) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v1/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-admin-action": "1",
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        setPassword("");
        window.location.assign("/admin");
        return;
      }

      if (response.status === 401) {
        toast.error("Invalid username or password.");
      } else if (response.status === 429) {
        toast.error("Too many attempts. Try again later.");
      } else {
        toast.error("Unable to sign in right now. Please try again.");
      }
    } catch {
      toast.error("Unable to sign in right now. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      data-testid="admin-login-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      noValidate
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(visibleErrors.username)} className="gap-1.5">
          <FieldLabel htmlFor="admin-username" className="text-foreground">
            Username
          </FieldLabel>
          <Input
            id="admin-username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() => setTouched((current) => ({ ...current, username: true }))}
            required
            aria-invalid={Boolean(visibleErrors.username)}
            aria-describedby={visibleErrors.username ? "admin-username-error" : undefined}
            className={
              visibleErrors.username
                ? "border-destructive focus-visible:ring-destructive"
                : undefined
            }
          />
          <FieldError id="admin-username-error" className="text-xs">
            {visibleErrors.username}
          </FieldError>
        </Field>

        <SecretInput
          id="admin-password"
          label="Password"
          isConfigured={false}
          value={password}
          onChange={(value) => {
            setPassword(value);
            setTouched((current) => ({ ...current, password: true }));
          }}
          placeholder="Admin password"
          error={visibleErrors.password}
        />
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
