import {checkEmailProvider} from './src/lib/email-provider';
/* CEYWAY TRANSIT Cloudflare Worker API. Public pages remain static Astro assets. */
interface D1Query {
  bind(...values:unknown[]): D1Query;
  first<T=Record<string,unknown>>(): Promise<T|null>;
  all<T=Record<string,unknown>>(): Promise<{results:T[]}>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(sql:string): D1Query; }
interface Env {
  DB: D1Database;
  ASSETS: {fetch(request:Request):Promise<Response>};
  TURNSTILE_SITE_KEY?:string;
  TURNSTILE_SECRET_KEY?:string;
  CF_ACCESS_TEAM_DOMAIN?:string;
  CF_ACCESS_AUD?:string;
  ADMIN_EMAILS?:string;
  RESEND_API_KEY?:string;
  EMAIL_FROM?:string;
}
type Status='new'|'contacted'|'quoted'|'confirmed'|'closed';
const validStatuses:Status[]=['new','contacted','quoted','confirmed','closed'];
const RESPONSE_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
function reply(data:unknown,status=200):Response {return new Response(JSON.stringify(data),{status,headers:RESPONSE_HEADERS});}
function failure(message:string,status=400):Response{return reply({ok:false,error:message},status);}
function value(v:unknown,max:number):string {return typeof v==='string'?v.trim().slice(0,max+1):'';}
function requireString(v:unknown,max:number):string|null {const s=value(v,max);return s && s.length<=max ? s : null;}
function fromSameOrigin(request:Request):boolean {
  const source=request.headers.get('origin');
  return !!source && source===new URL(request.url).origin;
}
async function parseJson(request:Request):Promise<Record<string,unknown>|null>{
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
  if(!type||!name||!message||phone.length>40)return failure('Please complete the required fields correctly.');
  if(!email)return failure('Email address is required.');
  const emailCheck=checkEmailProvider(email);
  if(!emailCheck.valid)return failure(emailCheck.message||'Please enter a valid email address.');
  if(data.consent!==true)return failure('Please confirm that we may contact you about your enquiry.');
  if(travelDate){
    // Strict ISO date validation rejects impossible days and past/today values.
    if(!/^\d{4}-\d{2}-\d{2}$/.test(travelDate))return failure('Invalid travel date.');
    const parsed=new Date(`${travelDate}T00:00:00.000Z`);
    if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==travelDate)return failure('Please enter a valid travel date.');
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=(kind:string)=>parts.find(item=>item.type===kind)?.value ?? '';
    const today=`${part('year')}-${part('month')}-${part('day')}`;
    if(travelDate<=today)return failure('Please select a future travel date (tomorrow or later).');
  }
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
  const auds=(env.CF_ACCESS_AUD||'').split(',').map(s=>s.trim()).filter(Boolean),allowed=(env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!domain||!auds.length||!allowed.length||!token||token.length>20000)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  try {
    const header=decodePart(parts[0]),claims=decodePart(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
    const issuer=`https://${domain}`;
    const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    const now=Math.floor(Date.now()/1000);
    if(claims.iss!==issuer||!auds.some(aud=>audiences.includes(aud))||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+60)return null;
    const email=typeof claims.email==='string'?claims.email.toLowerCase():'';
    if(!allowed.includes(email))return null;
    const keysResponse=await fetch(`${issuer}/cdn-cgi/access/certs`);
    if(!keysResponse.ok)return null;
    const jwks=await keysResponse.json() as {keys?:Array<JsonWebKey&{kid?:string}>};
    const jwk=jwks.keys?.find(k=>k.kid===header.kid && k.kty==='RSA');if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signed=new TextEncoder().encode(parts[0]+'.'+parts[1]);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,fromBase64url(parts[2]) as Uint8Array<ArrayBuffer>,signed)?email:null;
  }catch{return null;}
}
async function adminApi(request:Request,env:Env,url:URL,email:string):Promise<Response>{
  if(!env.DB)return failure('Database binding is not set.',503);
  const p=url.pathname;
  if(p==='/api/admin/whoami'&&request.method==='GET')return reply({ok:true,email});
  if(p==='/api/admin/enquiries'&&request.method==='GET'){
    const status=url.searchParams.get('status');
    if(status && !validStatuses.includes(status as Status))return failure('Invalid status.');
    const count=Math.min(Math.max(parseInt(url.searchParams.get('limit')||'100',10)||100,1),200);
    const query=status?'SELECT * FROM enquiries WHERE status=? ORDER BY created_at DESC LIMIT ?':'SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?';
    const results=await (status?env.DB.prepare(query).bind(status,count):env.DB.prepare(query).bind(count)).all();
    return reply({ok:true,items:results.results});
  }
  const match=p.match(/^\/api\/admin\/enquiries\/([a-f0-9-]{36})$/i);
  if(match && request.method==='PATCH'){
    if(!fromSameOrigin(request))return failure('Cross-site request blocked.',403);
    const data=await parseJson(request);if(!data)return failure('Invalid update.');
    const status=value(data.status,20);
    const note=typeof data.internalNotes==='string'?data.internalNotes.trim():'';
    if(!validStatuses.includes(status as Status)||note.length>2000)return failure('Invalid status or notes.');
    const result=await env.DB.prepare('UPDATE enquiries SET status=?, internal_notes=?, updated_at=? WHERE id=?')
      .bind(status,note,new Date().toISOString(),match[1]).run();
    return reply({ok:true,id:match[1],result});
  }
  if(match&&request.method==='DELETE'){
    if(!fromSameOrigin(request))return failure('Cross-site request blocked.',403);
    await env.DB.prepare('DELETE FROM enquiries WHERE id=?').bind(match[1]).run();
    return reply({ok:true});
  }
  return failure('Route not found.',404);
}
export default {
  async fetch(request:Request,env:Env,ctx:{waitUntil(promise:Promise<unknown>):void}):Promise<Response>{
    const url=new URL(request.url),path=url.pathname;
    if(path==='/api/health'&&request.method==='GET')return reply({ok:true,service:'CEYWAY TRANSIT backend',databaseConfigured:!!env.DB,formsEnabled:!!env.TURNSTILE_SECRET_KEY&&!!env.TURNSTILE_SITE_KEY});
    if(path==='/api/config'&&request.method==='GET')return reply({ok:true,turnstileSiteKey:env.TURNSTILE_SITE_KEY||null,formsEnabled:!!env.DB&&!!env.TURNSTILE_SECRET_KEY&&!!env.TURNSTILE_SITE_KEY});
    if(path==='/api/enquiries'&&request.method==='POST')return submit(request,env,ctx);
    if(path==='/admin'||path.startsWith('/admin/')||path.startsWith('/api/admin/')){
      const email=await adminIdentity(request,env);
      if(!email)return failure('Private administration: Cloudflare Access sign-in required.',401);
      if(path==='/admin'||path.startsWith('/admin/'))return env.ASSETS.fetch(request);
      try{return await adminApi(request,env,url,email);}catch(err){console.error('Admin endpoint failed',err instanceof Error?err.name:'Unknown error');return failure('Admin request failed.',503);}
    }
    if(path.startsWith('/api/'))return failure('Route not found.',404);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event:unknown,env:Env):Promise<void>{
    try {await retryQueuedEmails(env);}catch(err){
      console.error('Enquiry email retry job failed',err instanceof Error?err.name:'Unknown');
    }
  }
};
