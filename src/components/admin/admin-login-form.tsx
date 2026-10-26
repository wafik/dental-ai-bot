"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecretInput } from "@/components/admin/secret-input";

/**
 * Authenticates the single deployment-configured admin account and navigates
 * to the settings page on success.
 */
export function AdminLoginForm() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <Input
          id="admin-username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </div>

      <SecretInput
        id="admin-password"
        label="Password"
        isConfigured={false}
        value={password}
        onChange={setPassword}
        placeholder="Admin password"
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
