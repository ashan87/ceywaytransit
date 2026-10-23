-- Run ONCE after 0003_traveller_counts.sql.
-- Only NEW trip enquiries will enter the customer acknowledgement queue.
CREATE TABLE IF NOT EXISTS enquiry_customer_ack_outbox (
  enquiry_id TEXT PRIMARY KEY REFERENCES enquiries(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  locked_until TEXT,
  sent_at TEXT,
  provider_id TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_ack_outbox_due ON enquiry_customer_ack_outbox(state, next_attempt_at);
CREATE TRIGGER IF NOT EXISTS enqueue_customer_trip_ack
AFTER INSERT ON enquiries WHEN NEW.type='trip'
BEGIN
  INSERT OR IGNORE INTO enquiry_customer_ack_outbox
    (enquiry_id,created_at,state,attempts,next_attempt_at,updated_at)
  VALUES(NEW.id,NEW.created_at,'pending',0,NEW.created_at,NEW.created_at);
END;
