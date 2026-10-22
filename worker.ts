  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return null;
  if(Number(request.headers.get('content-length')||'0')>10000)return null;
  const body=await request.text();
  if(body.length>10000)return null;
  try {const data=JSON.parse(body);return data && typeof data==='object'&&!Array.isArray(data)?data:null;}catch{return null;}
}
async function verifyTurnstile(request:Request,env:Env,token:string):Promise<boolean>{
  if(!env.TURNSTILE_SECRET_KEY || !token || token.length>2048)return false;
  const form=new FormData();
  form.set('secret',env.TURNSTILE_SECRET_KEY);
  form.set('response',token);
  const ip=request.headers.get('CF-Connecting-IP');if(ip)form.set('remoteip',ip);
  try {
    const resp=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});
    if(!resp.ok)return false;
    const outcome=await resp.json() as {success?:boolean,hostname?:string};
    // Reject a token obtained for a different hostname, even if its secret was reused.
    return outcome.success===true && !!outcome.hostname && outcome.hostname===new URL(request.url).hostname;
  }catch{return false;}
}
async function submit(request:Request,env:Env,ctx:{waitUntil(promise:Promise<unknown>):void}):Promise<Response>{
  if(!fromSameOrigin(request))return failure('Cross-site form submissions are not accepted.',403);
  if(!env.DB)return failure('Enquiry service has not been configured.',503);
  if(!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)return failure('Online enquiries are not yet enabled. Please use WhatsApp.',503);
  const data=await parseJson(request);
  if(!data)return failure('Invalid form data.');
  if(value(data.website,200))return reply({ok:true,message:'Thank you.'},202); // honeypot
  const type=data.type==='contact'?'contact':data.type==='trip'?'trip':null;
  const name=requireString(data.name,100),email=requireString(data.email,180),message=requireString(data.message,1500);
  const phone=value(data.phone,40),travelDate=value(data.travelDate,10);
  const travellers=data.travellers==null||data.travellers===''?null:Number(data.travellers);
  const interests=Array.isArray(data.interests)?data.interests:null;
  const interestValues=interests?.map(v=>value(v,60)) ?? [];
  if(!type||!name||!email||!isValidEmail(email)||!message||phone.length>40)return failure('Please complete the required fields correctly.');
  if(data.consent!==true)return failure('Please confirm that we may contact you about your enquiry.');
  if(travelDate&&!/^\d{4}-\d{2}-\d{2}$/.test(travelDate))return failure('Invalid travel date.');
  if(type==='trip'&&(travellers===null||!Number.isInteger(travellers)||travellers<1||travellers>40))return failure('Travellers must be between 1 and 40.');
  if(interestValues.length>12||interestValues.some(v=>!v||v.length>60))return failure('Invalid interests.');
  if(!await verifyTurnstile(request,env,value(data.turnstileToken,2048)))return failure('Security check failed. Please try again.',403);
  const id=crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO enquiries (id, type, name, email, phone, message, travel_date, travellers, interests_json, consented_at, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id,type,name,email.toLowerCase(),phone||null,message,travelDate||null,travellers,
        JSON.stringify(interestValues),new Date().toISOString(),new Date().toISOString(),new Date().toISOString(),'new').run();
    // The D1 AFTER INSERT trigger has already queued the notification durably.
    ctx.waitUntil(deliverQueuedEmail(env,id).catch(err=>console.error('Email queue failure',err instanceof Error?err.name:'Unknown')));
    return reply({ok:true,id,message:'Your enquiry has been received. We will contact you soon.'},201);
  }catch(err){console.error('D1 enquiry insert failed',err instanceof Error?err.name:'Unknown error');return failure('Unable to save your enquiry right now. Please use WhatsApp.',503);}
}

/**
 * Enquiry alerts: an AFTER INSERT trigger in D1 queues each new enquiry.
 * Send once immediately where possible; a Cron Trigger retries failed emails.
 * This function is intentionally server-side only and does not email customers.
 */
type EmailQueueRow = {
  enquiry_id:string;
  attempts:number;
  type:'contact'|'trip';
  name:string;
  email:string;
  phone:string|null;
  travel_date:string|null;
  travellers:number|null;
  message:string;
  interests_json:string;
  created_at:string;
};
const NOTIFY_EMAIL='ceywaytransit@gmail.com';
function emailReady(env:Env):boolean {
  return !!env.DB && !!env.RESEND_API_KEY && !!env.EMAIL_FROM &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM.match(/<([^<>]+)>/)?.[1] || env.EMAIL_FROM);
}
function emailMessage(row:EmailQueueRow):string {
  let interests:string[]=[];
  try { const parsed:unknown=JSON.parse(row.interests_json || '[]');if(Array.isArray(parsed))interests=parsed.filter(x=>typeof x==='string').slice(0,12); } catch { /* Do not fail notification because of old data */ }
  return [
    'New CEYWAY TRANSIT ' + (row.type==='trip'?'Trip Planning':'Contact') + ' enquiry',
    '',
    'Received (UTC): '+row.created_at,
    'Enquiry ID: '+row.enquiry_id,
    'Customer: '+row.name,
    'Email: '+row.email,
    'Phone/WhatsApp: '+(row.phone || 'Not provided'),
    'Travel date: '+(row.travel_date || 'Not provided'),
    'Travellers: '+(row.travellers ?? 'Not provided'),
    'Interests: '+(interests.length ? interests.join(', ') : 'Not provided'),
    '',
    'Customer message:',
    row.message,
    '',
    'Reply to this email to answer the customer.',
    'Customer data is also available in the secure D1 enquiries database.'
  ].join('\n');
}
function retryDelayMinutes(attempts:number):number { return Math.min(60,Math.pow(2,Math.min(attempts,6))); }
async function deliverQueuedEmail(env:Env,enquiryId:string):Promise<void>{
  if(!emailReady(env))return;
  const now=new Date().toISOString();
  const lockExpiry=new Date(Date.now()+120000).toISOString();
  // Claim atomically to avoid concurrent Cron + request delivery of the same email.
  const claim=await env.DB.prepare(`UPDATE enquiry_email_outbox
    SET state='sending', attempts=attempts+1, locked_until=?, updated_at=?
    WHERE enquiry_id=? AND (state='pending' AND next_attempt_at<=? OR state='sending' AND locked_until<=?)
    RETURNING enquiry_id,attempts`).bind(lockExpiry,now,enquiryId,now,now).first<{enquiry_id:string;attempts:number}>();
  if(!claim)return;
  const row=await env.DB.prepare(`SELECT q.enquiry_id,q.attempts,e.type,e.name,e.email,e.phone,e.travel_date,e.travellers,
    e.message,e.interests_json,e.created_at FROM enquiry_email_outbox q
    JOIN enquiries e ON e.id=q.enquiry_id WHERE q.enquiry_id=?`).bind(enquiryId).first<EmailQueueRow>();
  if(!row)return;
  try {
    const resp=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':'application/json',
        'Idempotency-Key':`ceyway-enquiry/${enquiryId}`
      },
      body:JSON.stringify({
        from:env.EMAIL_FROM,
        to:[NOTIFY_EMAIL],
        reply_to:row.email,
        subject:`[CEYWAY TRANSIT] New ${row.type==='trip'?'trip':'contact'} enquiry — ${row.name}`,
        text:emailMessage(row)
      }),
      signal:AbortSignal.timeout(15000)
    });
    if(!resp.ok)throw new Error('Resend HTTP '+resp.status);
    const sent=await resp.json() as {id?:string};
    if(!sent.id)throw new Error('Resend response had no email ID');
    await env.DB.prepare(`UPDATE enquiry_email_outbox SET state='sent',sent_at=?,provider_id=?,locked_until=NULL,
      last_error=NULL,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(new Date().toISOString(),sent.id,new Date().toISOString(),enquiryId).run();
  } catch(err) {
    // A transient email-provider error must NOT undo a customer's saved enquiry.
    const errCode=err instanceof Error ? err.message.slice(0,80) : 'Email send failed';
    console.error('Enquiry email delivery failed',errCode,'enquiry ID',enquiryId);
    const permanent=row.attempts>=12;
    const due=new Date(Date.now()+retryDelayMinutes(row.attempts)*60000).toISOString();
    await env.DB.prepare(`UPDATE enquiry_email_outbox SET state=?,next_attempt_at=?,locked_until=NULL,
      last_error=?,updated_at=? WHERE enquiry_id=? AND state='sending'`)
      .bind(permanent?'failed':'pending',due,errCode,new Date().toISOString(),enquiryId).run();
  }
}
async function retryQueuedEmails(env:Env):Promise<void>{
  if(!emailReady(env))return;
  const now=new Date().toISOString();
  const batch=await env.DB.prepare(`SELECT enquiry_id FROM enquiry_email_outbox
    WHERE (state='pending' AND next_attempt_at<=?) OR (state='sending' AND locked_until<=?)
    ORDER BY created_at ASC LIMIT 10`).bind(now,now).all<{enquiry_id:string}>();
  for(const item of batch.results)await deliverQueuedEmail(env,item.enquiry_id);
}

function fromBase64url(value:string):Uint8Array{
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function decodePart(value:string):Record<string,unknown>{return JSON.parse(new TextDecoder().decode(fromBase64url(value)));}
async function adminIdentity(request:Request,env:Env):Promise<string|null>{
  const domain=(env.CF_ACCESS_TEAM_DOMAIN||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
