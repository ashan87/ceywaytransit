/**
 * CEYWAY TRANSIT — customer trip acknowledgement.
 * The D1 trigger enqueues a row for every new trip enquiry. This module sends
 * only when CUSTOMER_ACK_ENABLED=true and EMAIL_FROM uses a verified domain.
 * Business-owner notifications are handled separately by worker.ts.
 */
interface DBQuery {
  bind(...values:unknown[]):DBQuery;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<{results:T[]}>;
  run():Promise<unknown>;
}
interface DB {prepare(sql:string):DBQuery;}
interface Env {
  DB: DB;
  RESEND_API_KEY?:string;
  EMAIL_FROM?:string;
  CUSTOMER_ACK_ENABLED?:string;
}
interface AckRow {
  enquiry_id:string;
  attempts:number;
  type:'trip';
  name:string;
  email:string;
  phone:string|null;
  travel_date:string|null;
  travellers:number|null;
  adults:number|null;
  children:number|null;
  interests_json:string;
  message:string;
  created_at:string;
}
const OWNER_EMAIL='ceywaytransit@gmail.com';
const MAX_AGE_MS=24*60*60*1000;
function ackReady(env:Env):boolean{
  if(env.CUSTOMER_ACK_ENABLED!=='true'||!env.DB||!env.RESEND_API_KEY||!env.EMAIL_FROM)return false;
  const sender=env.EMAIL_FROM.match(/<([^<>]+)>/)?.[1]||env.EMAIL_FROM;
  // Resend's shared test sender cannot deliver to arbitrary tourist inboxes.
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender) && !/@resend\.dev$/i.test(sender);
}
function details(row:AckRow):string{
  let interests:string[]=[];
  try{
    const v:unknown=JSON.parse(row.interests_json||'[]');
    if(Array.isArray(v))interests=v.filter(x=>typeof x==='string').slice(0,12);
  }catch{/* Preserve delivery even if an older record has malformed interests */}
  return [
    `Hello ${row.name},`,
    '',
    'Thank you for contacting CEYWAY TRANSIT! We have received your Sri Lanka trip-planning request.',
    '',
    'YOUR REQUEST',
    `Reference: ${row.enquiry_id}`,
    `Name: ${row.name}`,
    `Email: ${row.email}`,
    `WhatsApp / phone: ${row.phone||'Not provided'}`,
    `Approximate travel date: ${row.travel_date||'Flexible / not selected'}`,
    `Adults (18+): ${row.adults??row.travellers??'Not specified'}`,
    `Children (under 18): ${row.children??0}`,
    `Total travellers: ${row.travellers??'Not specified'}`,
    `Travel interests: ${interests.length?interests.join(', '):'Not selected'}`,
    '',
    'YOUR MESSAGE',
    row.message,
    '',
    'WHAT HAPPENS NEXT?',
    'Our team will review your request and contact you to discuss a suitable itinerary and quotation.',
    'This email confirms receipt of your enquiry only. It is not a booking confirmation, reservation or payment request.',
    '',
    'If you need to amend your details, simply reply to this email.',
    '',
    'Warm regards,',
    'CEYWAY TRANSIT — Journeys Beyond Borders',
    `Email: ${OWNER_EMAIL}`,
    'WhatsApp: +94 71 332 929'
  ].join('\n');
}
function delayMinutes(attempts:number):number{return Math.min(60,2**Math.min(attempts,6));}
export async function deliverCustomerTripAcknowledgement(env:Env,enquiryId:string):Promise<void>{
  if(!ackReady(env))return;
  const now=new Date().toISOString();
  const lockUntil=new Date(Date.now()+120000).toISOString();
  const claimed=await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox
    SET state='sending', attempts=attempts+1, locked_until=?, updated_at=?
    WHERE enquiry_id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND locked_until<=?))
    RETURNING enquiry_id,attempts`)
    .bind(lockUntil,now,enquiryId,now,now).first<{enquiry_id:string;attempts:number}>();
  if(!claimed)return;
  const row=await env.DB.prepare(`SELECT q.enquiry_id,q.attempts,e.type,e.name,e.email,e.phone,
    e.travel_date,e.travellers,e.adults,e.children,e.interests_json,e.message,e.created_at
    FROM enquiry_customer_ack_outbox q JOIN enquiries e ON e.id=q.enquiry_id
    WHERE q.enquiry_id=? AND e.type='trip'`)
    .bind(enquiryId).first<AckRow>();
  if(!row)return;
  // Don't unexpectedly email old test customers when the sender domain is enabled later.
  if(!Number.isFinite(Date.parse(row.created_at))||Date.now()-Date.parse(row.created_at)>MAX_AGE_MS){
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state='failed',locked_until=NULL,
      last_error='Acknowledgement expired before delivery was enabled',updated_at=? WHERE enquiry_id=?`)
      .bind(new Date().toISOString(),enquiryId).run();
    return;
  }
  try{
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json',
        'Idempotency-Key':`ceyway-customer-trip/${enquiryId}`},
      body:JSON.stringify({
        from:env.EMAIL_FROM,
        to:[row.email],
        reply_to:OWNER_EMAIL,
        subject:'We received your Sri Lanka trip request | CEYWAY TRANSIT',
        text:details(row)
      }),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw new Error(`Resend HTTP ${response.status}`);
    const result=await response.json() as {id?:string};
    if(!result.id)throw new Error('Resend returned no email ID');
    const sentAt=new Date().toISOString();
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state='sent',sent_at=?,provider_id=?,
      locked_until=NULL,last_error=NULL,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(sentAt,result.id,sentAt,enquiryId).run();
  }catch(e){
    const lastError=e instanceof Error?e.message.slice(0,100):'Email sending failed';
    console.error('Customer acknowledgement failed',lastError,'reference',enquiryId);
    const permanent=claimed.attempts>=12||lastError==='Resend HTTP 401'||lastError==='Resend HTTP 403';
    const next=new Date(Date.now()+delayMinutes(claimed.attempts)*60000).toISOString();
    await env.DB.prepare(`UPDATE enquiry_customer_ack_outbox SET state=?,next_attempt_at=?,
      locked_until=NULL,last_error=?,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(permanent?'failed':'pending',next,lastError,new Date().toISOString(),enquiryId).run();
  }
}
export async function retryCustomerTripAcknowledgements(env:Env):Promise<void>{
  if(!ackReady(env))return;
  const now=new Date().toISOString();
  const results=await env.DB.prepare(`SELECT enquiry_id FROM enquiry_customer_ack_outbox
    WHERE (state='pending' AND next_attempt_at<=?) OR (state='sending' AND locked_until<=?)
    ORDER BY created_at ASC LIMIT 10`).bind(now,now).all<{enquiry_id:string}>();
  for(const item of results.results)await deliverCustomerTripAcknowledgement(env,item.enquiry_id);
}
