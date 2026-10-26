CREATE TABLE IF NOT EXISTS appointments (
  id varchar(36) PRIMARY KEY,
  patient_name text NOT NULL,
  patient_phone varchar(32) NOT NULL,
  service_code varchar(8) NOT NULL,
  dentist_id varchar(32) NOT NULL,
  date varchar(10) NOT NULL,
  start_time varchar(5) NOT NULL,
  end_time varchar(5) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'confirmed',
  calendar_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  key varchar(64) PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dentist_calendar_mappings (
  id varchar(36) PRIMARY KEY,
  dentist_id varchar(32) NOT NULL,
  provider varchar(16) NOT NULL,
  calendar_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS encrypted_secrets (
  key varchar(64) PRIMARY KEY,
  ciphertext text NOT NULL,
  iv varchar(32) NOT NULL,
  auth_tag varchar(32) NOT NULL,
  key_version varchar(16) NOT NULL DEFAULT 'v1',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id varchar(36) PRIMARY KEY,
  token_hash varchar(64) NOT NULL,
  username varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_idx ON admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id varchar(36) PRIMARY KEY,
  identifier varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_login_attempts_identifier_idx
  ON admin_login_attempts (identifier, created_at);
CREATE INDEX IF NOT EXISTS appointments_dentist_date_status_idx
  ON appointments (dentist_id, date, status);
