-- Per-provider calendar synchronization state for each appointment.
-- One row per appointment and provider tracks the latest operation so a
-- booking can be confirmed only after both calendars converge, and a
-- cancellation can be retried without losing the provider event ID.

CREATE TABLE IF NOT EXISTS appointment_calendar_syncs (
  appointment_id varchar(36) NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  provider varchar(16) NOT NULL,
  operation varchar(16) NOT NULL DEFAULT 'book',
  status varchar(24) NOT NULL DEFAULT 'pending',
  event_id text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error varchar(64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, provider)
);

CREATE INDEX IF NOT EXISTS appointment_calendar_syncs_due_idx
  ON appointment_calendar_syncs (status, next_attempt_at);
