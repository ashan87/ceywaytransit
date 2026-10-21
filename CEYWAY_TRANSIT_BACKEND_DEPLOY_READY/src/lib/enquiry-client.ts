/* Browser-only helper shared by contact and trip forms. The secret is never exposed. */
type TurnstileApi = {
  render: (container:HTMLElement,options:{sitekey:string;theme:'auto'})=>string;
  getResponse: (widgetId:string)=>string;
  reset: (widgetId:string)=>void;
};
declare global {interface Window {turnstile?:TurnstileApi;}}
let loader:Promise<void>|null=null;
function loadWidget():Promise<void>{
  if(window.turnstile)return Promise.resolve();
  if(loader)return loader;
  loader=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true;
    script.onload=()=>window.turnstile?resolve():reject(new Error('Turnstile unavailable'));
    script.onerror=()=>reject(new Error('Turnstile did not load'));
    document.head.appendChild(script);
  });
  return loader;
}
export type Verification = {enabled:boolean;getToken:()=>string;reset:()=>void};
export async function prepareVerification(container:HTMLElement):Promise<Verification>{
  const disabled:Verification={enabled:false,getToken:()=>'',reset:()=>{}};
  try{
    const configResponse=await fetch('/api/config',{cache:'no-store'});
    if(!configResponse.ok)return disabled;
    const config=await configResponse.json() as {formsEnabled?:boolean;turnstileSiteKey?:string};
    if(!config.formsEnabled||!config.turnstileSiteKey)return disabled;
    await loadWidget();
    const id=window.turnstile!.render(container,{sitekey:config.turnstileSiteKey,theme:'auto'});
    return {enabled:true,getToken:()=>window.turnstile?.getResponse(id)||'',reset:()=>window.turnstile?.reset(id)};
  }catch{return disabled;}
}
export function messageIn(el:HTMLElement,text:string,isError=false){
  el.textContent=text;el.hidden=false;el.classList.toggle('form-feedback-error',isError);
}
export async function postEnquiry(data:Record<string,unknown>):Promise<{ok:boolean;error?:string;id?:string}>{
  const response=await fetch('/api/enquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'});
  const json=await response.json().catch(()=>({ok:false,error:'Unexpected server response.'}));
  return {ok:response.ok && json.ok===true,error:json.error,id:json.id};
}
