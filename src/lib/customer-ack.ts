/**
 * CEYWAY TRANSIT — customer trip acknowledgements through Google Apps Script.
 *
 * New trip enquiries enter enquiry_customer_ack_outbox via the existing D1
 * trigger. The five-minute Cron processes this queue separately from the
 * existing Resend email notification sent to the CEYWAY TRANSIT team.
 *
 * Required Cloudflare production secrets:
 * - GMAIL_ACK_WEBAPP_URL: Google Apps Script /exec deployment address
 * - GMAIL_ACK_SHARED_SECRET: matches CEYWAY_SHARED_SECRET in Script Properties
 *
 * Does not require CUSTOMER_ACK_ENABLED or a Resend-verified domain.
 */
interface DBQuery {
  bind(...values: unknown[]): DBQuery;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
}
interface DB { prepare(sql: string): DBQuery; }
interface Env {
  DB: DB;
  GMAIL_ACK_WEBAPP_URL?: string;
  GMAIL_ACK_SHARED_SECRET?: string;
}
interface AckRow {
  enquiry_id: string;
  attempts: number;
  type: 'trip';
  name: string;
  email: string;
  phone: string | null;
  travel_date: string | null;
  travellers: number | null;
  adults: number | null;
  children: number | null;
  interests_json: string;
  message: string;
  created_at: string;
}
interface ScriptResult {
  ok?: boolean;
  alreadySent?: boolean;
  error?: string;
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GOOGLE_SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

function gmailReady(env: Env): boolean {
  return !!env.DB &&
    typeof env.GMAIL_ACK_WEBAPP_URL === 'string' &&
    GOOGLE_SCRIPT_URL.test(env.GMAIL_ACK_WEBAPP_URL.trim()) &&
    typeof env.GMAIL_ACK_SHARED_SECRET === 'string' &&
    env.GMAIL_ACK_SHARED_SECRET.length >= 32;
}
function delayMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.min(attempts, 6));
}
function getInterests(json: string): string[] {
  try {
    const items: unknown = JSON.parse(json || '[]');
    if (Array.isArray(items)) return items.filter((item): item is string => typeof item === 'string').slice(0, 12);
  } catch { /* Older entries may contain invalid optional interests */ }
  return [];
}

/**
 * Claim a queued trip acknowledgement atomically and deliver it once.
 * Google Apps Script also keeps an idempotency record using the enquiry ID,
 * so retrying after a lost network response should not email twice.
 */
export async function deliverCustomerTripAcknowledgement(env: Env, enquiryId: string): Promise<void> {
  if (!gmailReady(env)) return;
  const now = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + 120000).toISOString();
  const claimed = await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox
    SET state='sending', attempts=attempts+1, locked_until=?, updated_at=?
    WHERE enquiry_id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND locked_until<=?))
    RETURNING enquiry_id,attempts`)
    .bind(lockedUntil, now, enquiryId, now, now)
    .first<{enquiry_id: string; attempts: number}>();
  if (!claimed) return;

  const row = await env.DB.prepare(`SELECT q.enquiry_id,q.attempts,e.type,e.name,e.email,e.phone,
    e.travel_date,e.travellers,e.adults,e.children,e.interests_json,e.message,e.created_at
    FROM enquiry_customer_ack_outbox q JOIN enquiries e ON e.id=q.enquiry_id
    WHERE q.enquiry_id=? AND e.type='trip'`)
    .bind(enquiryId).first<AckRow>();

  if (!row) {
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state='failed',locked_until=NULL,
      last_error='Trip enquiry record not found',updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(new Date().toISOString(), enquiryId).run();
    return;
  }

  // Never unexpectedly email somebody about an old test or stale enquiry.
  const age = Date.now() - Date.parse(row.created_at);
  if (!Number.isFinite(age) || age > MAX_AGE_MS || age < -60_000) {
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state='failed',locked_until=NULL,
      last_error='Acknowledgement expired before delivery',updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(new Date().toISOString(), enquiryId).run();
    return;
  }

  try {
    const payload = {
      // Shared key travels server-to-server in the POST body, never via the browser.
      secret: env.GMAIL_ACK_SHARED_SECRET,
      enquiryId: row.enquiry_id,
      email: row.email,
      name: row.name,
      phone: row.phone || '',
      travelDate: row.travel_date || '',
      adults: row.adults ?? row.travellers ?? 1,
      children: row.children ?? 0,
      interests: getInterests(row.interests_json),
      message: row.message
    };

    // Google's ContentService responds through a one-time redirect to
    // script.googleusercontent.com; follow that redirect to read JSON.
    const response = await fetch(env.GMAIL_ACK_WEBAPP_URL!, {
      method: 'POST',
      headers: {'Content-Type': 'application/json; charset=utf-8'},
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: AbortSignal.timeout(35000)
    });
    if (!response.ok) throw new Error(`Google Apps Script HTTP ${response.status}`);

    let result: ScriptResult;
    try {
      result = await response.json() as ScriptResult;
    } catch {
      throw new Error('Google Apps Script did not return JSON (check deployment access)');
    }
    if (result.ok !== true) {
      // Do not store echoed customer details, authentication tokens, or HTML.
      const providerError = typeof result.error === 'string' ? result.error.slice(0, 70) : 'Unspecified rejection';
      throw new Error(`Google Apps Script: ${providerError}`);
    }

    const sentAt = new Date().toISOString();
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state='sent',sent_at=?,provider_id=?,
      locked_until=NULL,last_error=NULL,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(sentAt, 'gmail-apps-script', sentAt, enquiryId).run();
  } catch (error) {
    // The enquiry is already safe in D1; retry email separately.
    const message = error instanceof Error ? error.message.slice(0, 100) : 'Gmail acknowledgement failed';
    console.error('Gmail customer acknowledgement failed:', message, 'enquiry:', enquiryId);
    const permanent = claimed.attempts >= 12;
    const nextAttempt = new Date(Date.now() + delayMinutes(claimed.attempts) * 60000).toISOString();
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state=?,next_attempt_at=?,
      locked_until=NULL,last_error=?,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(permanent ? 'failed' : 'pending', nextAttempt, message, new Date().toISOString(), enquiryId).run();
  }
}

/** Runs from the existing five-minute Cron Trigger in worker.ts. */
export async function retryCustomerTripAcknowledgements(env: Env): Promise<void> {
  if (!gmailReady(env)) return;
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`SELECT enquiry_id FROM enquiry_customer_ack_outbox
    WHERE (state='pending' AND next_attempt_at<=?) OR (state='sending' AND locked_until<=?)
    ORDER BY created_at ASC LIMIT 5`).bind(now, now).all<{enquiry_id: string}>();
  for (const item of rows.results) {
    await deliverCustomerTripAcknowledgement(env, item.enquiry_id);
  }
}
