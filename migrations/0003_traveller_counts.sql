-- Run ONCE in Cloudflare D1 Console before uploading the new Worker.
-- Preserves existing enquiries; existing records can keep adults=NULL.
ALTER TABLE enquiries ADD COLUMN adults INTEGER;
ALTER TABLE enquiries ADD COLUMN children INTEGER DEFAULT 0;
