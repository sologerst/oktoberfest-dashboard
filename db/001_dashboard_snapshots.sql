-- Snapshot store for this dashboard only. Do not run this on the festival database.
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id integer PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  square_state jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
