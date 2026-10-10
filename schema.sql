-- GOODIE-MEDHUB local server: Phase 0 spike schema (small on purpose).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hospitals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  mrn_prefix  text NOT NULL            -- unique per SERVER, e.g. 'PH1' (see MRN note in README)
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES hospitals(id),
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','doctor','nurse','front_desk','pharmacist','lab','billing','staff')),
  password_hash text NOT NULL,         -- Argon2id hash, never the password
  active        boolean NOT NULL DEFAULT true
);

-- One counter row per hospital: guarantees no two patients get the same number.
CREATE TABLE IF NOT EXISTS mrn_counters (
  hospital_id uuid PRIMARY KEY REFERENCES hospitals(id),
  next_value  integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS patients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES hospitals(id),
  mrn         text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only history of who did what.
CREATE TABLE IF NOT EXISTS audit_events (
  id          bigserial PRIMARY KEY,
  hospital_id uuid NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  summary     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- "Outbox": every change is queued here so a later sync worker can send it to the cloud.
CREATE TABLE IF NOT EXISTS sync_outbox (
  id          bigserial PRIMARY KEY,
  hospital_id uuid NOT NULL,
  table_name  text NOT NULL,
  record_id   uuid NOT NULL,
  op          text NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  synced_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox (id) WHERE synced_at IS NULL;
