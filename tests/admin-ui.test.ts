import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLoginForm } from "../src/components/admin/admin-login-form";
import { AdminSettingsForm } from "../src/components/admin/admin-settings-form";
import { CalendarSettingsSection } from "../src/components/admin/calendar-settings-section";
import { CredentialsSection } from "../src/components/admin/credentials-section";
import { SecretInput } from "../src/components/admin/secret-input";

const noop = () => {};
const VALID_AI = { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };

/** Renders the credentials tab with the given overrides. */
function renderCredentials(
  props: Partial<{
    secrets: Record<string, { isConfigured: boolean }>;
    testingProvider: string | null;
  }> = {},
): string {
  return renderToStaticMarkup(
    createElement(CredentialsSection, {
      secrets: props.secrets ?? {},
      drafts: {},
      onDraftChange: noop,
      onTest: noop,
      testingProvider: props.testingProvider ?? null,
      ai: VALID_AI,
      onAiChange: noop,
    }),
  );
}

function renderSecretInput(props: {
  isConfigured: boolean;
  value: string;
  placeholder?: string;
}): string {
  return renderToStaticMarkup(
    createElement(SecretInput, {
      id: "secret-openai-apiKey",
      label: "API Key",
      isConfigured: props.isConfigured,
      value: props.value,
      onChange: noop,
      placeholder: props.placeholder ?? "sk-...",
    }),
  );
}

describe("SecretInput", () => {
  it("shows configured state and masked placeholder without a draft", () => {
    const markup = renderSecretInput({ isConfigured: true, value: "" });

    expect(markup).toContain("Configured");
    expect(markup).toContain("(leave blank to keep current value)");
    expect(markup).toContain('type="password"');
    expect(markup).not.toContain('aria-label="Show value"');
    expect(markup).not.toContain('aria-label="Hide value"');
  });

  it("keeps a draft masked and offers only the show control", () => {
    const markup = renderSecretInput({
      isConfigured: true,
      value: "draft-value",
      placeholder: "sk-...",
    });

    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-label="Show value"');
    expect(markup).not.toContain('type="text"');
  });

  it("never renders a configured badge while a draft is being typed", () => {
    const markup = renderSecretInput({ isConfigured: true, value: "draft-value" });

    expect(markup).not.toContain(">Configured<");
  });

  it("links its label to the input id", () => {
    const markup = renderSecretInput({ isConfigured: false, value: "" });

    expect(markup).toContain('for="secret-openai-apiKey"');
    expect(markup).toContain('id="secret-openai-apiKey"');
  });
});

describe("CalendarSettingsSection", () => {
  it("renders a stable calendar id input for every dentist", () => {
    const markup = renderToStaticMarkup(
      createElement(CalendarSettingsSection, {
        provider: "none",
        onProviderChange: noop,
        mappings: [
          { dentistId: "junior", provider: "google", calendarId: "junior@example.com" },
          { dentistId: "senior-1", provider: "google", calendarId: "" },
          { dentistId: "senior-2", provider: "outlook", calendarId: "" },
        ],
        onMappingChange: noop,
      }),
    );

    for (const dentistId of ["junior", "senior-1", "senior-2"]) {
      expect(markup).toContain(`id="mapping-${dentistId}-calendar"`);
      expect(markup).toContain(`id="mapping-${dentistId}-provider"`);
    }
    expect(markup).toContain('id="calendar-provider"');
    expect(markup).toContain("Dr. Junior");
    expect(markup).toContain("Dr. Senior 1");
    expect(markup).toContain("Dr. Senior 2");
  });

  it("falls back to a full mapping list when settings are empty", () => {
    const markup = renderToStaticMarkup(
      createElement(CalendarSettingsSection, {
        provider: "google",
        onProviderChange: noop,
        mappings: [],
        onMappingChange: noop,
      }),
    );

    expect(markup).toContain('id="mapping-junior-calendar"');
    expect(markup).toContain('id="mapping-senior-1-calendar"');
    expect(markup).toContain('id="mapping-senior-2-calendar"');
  });
});

describe("CredentialsSection", () => {
  it("renders one test button per secret group and write-only inputs", () => {
    const markup = renderCredentials({ secrets: { "openai.apiKey": { isConfigured: true } } });

    expect(markup).toContain('data-testid="test-openai"');
    expect(markup).toContain('data-testid="test-google"');
    expect(markup).toContain('data-testid="test-microsoft"');
    expect(markup).toContain("Test connection");
    expect(markup).toContain("Configured");
    expect(markup).not.toContain('type="text"');
  });

  it("renders the editable base URL and model next to the OpenAI key", () => {
    const markup = renderCredentials();

    expect(markup).toContain('id="ai-baseUrl"');
    expect(markup).toContain('id="ai-model"');
    expect(markup).toContain("https://api.openai.com/v1");
    expect(markup).toContain("gpt-4o-mini");
  });

  it("flags an invalid base URL below the field", () => {
    const markup = renderToStaticMarkup(
      createElement(CredentialsSection, {
        secrets: {},
        drafts: {},
        onDraftChange: noop,
        onTest: noop,
        testingProvider: null,
        ai: { baseUrl: "not-a-url", model: "" },
        onAiChange: noop,
      }),
    );

    expect(markup).toContain("Use the full URL");
    expect(markup).toContain('aria-invalid="true"');
  });

  it("labels the pressed group as testing", () => {
    const markup = renderCredentials({ testingProvider: "google" });

    expect(markup).toContain("Testing…");
    expect(markup).toContain("disabled");
  });

  it("offers a key JSON file picker for the Google group only", () => {
    const markup = renderCredentials();

    expect(markup.match(/data-testid="google-key-file"/g)).toHaveLength(1);
    expect(markup).toContain('accept="application/json,.json"');
    expect(markup).toContain("The file is read in your browser only.");
  });
});

describe("Client forms", () => {
  it("exports the admin login form with its stable test id", () => {
    const markup = renderToStaticMarkup(createElement(AdminLoginForm));

    expect(markup).toContain('data-testid="admin-login-form"');
    expect(markup).toContain('id="admin-username"');
    expect(markup).toContain('id="admin-password"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain("Sign in");
  });

  it("renders the settings shell with save, logout, and status test ids", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminSettingsForm, { username: "e2e-admin" }),
    );

    expect(markup).toContain('data-testid="save-settings"');
    expect(markup).toContain('data-testid="logout"');
    expect(markup).toContain("e2e-admin");
    // The overview tab is the landing view; credentials live behind their own tab.
    expect(markup).toContain('data-testid="status-openai"');
    expect(markup).toContain("Not configured");
    expect(markup).toContain('role="tab"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Calendar");
    expect(markup).toContain("Credentials");
  });
});
