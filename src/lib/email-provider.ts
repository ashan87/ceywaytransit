/** CEYWAY TRANSIT - email syntax and common provider typo detection.
 * Recognised consumer providers are not a whitelist: customers may use business domains.
 * This does NOT prove an inbox exists or belongs to the customer.
 */
export type EmailCheck = {valid:boolean; recognisedProvider:boolean; suggestion?:string; message?:string};

const knownProviders = new Set([
  'gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.co.uk',
  'live.com','live.co.uk','msn.com','yahoo.com','yahoo.co.uk','yahoo.co.in',
  'yahoo.com.au','ymail.com','icloud.com','me.com','mac.com','aol.com',
  'proton.me','protonmail.com','pm.me','zoho.com','zohomail.com',
  'gmx.com','gmx.de','mail.com','yandex.com'
]);

const commonTypos:Record<string,string> = {
  'gmai.com':'gmail.com','gmial.com':'gmail.com','gamil.com':'gmail.com',
  'gmaill.com':'gmail.com','gnail.com':'gmail.com','gmail.con':'gmail.com',
  'gmail.cmo':'gmail.com','gmail.comm':'gmail.com','gmail.co':'gmail.com',
  'hotmai.com':'hotmail.com','hotmial.com':'hotmail.com',
  'hotmail.con':'hotmail.com','hotmial.co.uk':'hotmail.co.uk',
  'outlok.com':'outlook.com','outllook.com':'outlook.com',
  'outlook.con':'outlook.com','outlook.co':'outlook.com',
  'yaho.com':'yahoo.com','yahooo.com':'yahoo.com',
  'yahoo.con':'yahoo.com','yahho.com':'yahoo.com',
  'icloud.con':'icloud.com','icloud.co':'icloud.com',
  'icoud.com':'icloud.com','protonmai.com':'protonmail.com'
};

export function checkEmailProvider(address:string):EmailCheck {
  const email=address.trim();
  if(!email || email.length>180 || email.includes('..') || /\s/.test(email))
    return {valid:false,recognisedProvider:false,message:'Please enter a valid email address.'};
  const at=email.indexOf('@');
  if(at<1 || at!==email.lastIndexOf('@') || at>64)
    return {valid:false,recognisedProvider:false,message:'Please enter a valid email address.'};
  const local=email.slice(0,at),domain=email.slice(at+1).toLowerCase();
  if(local.startsWith('.') || local.endsWith('.') || domain.length>253 ||
    !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email))
    return {valid:false,recognisedProvider:false,message:'Please enter a valid email, such as name@gmail.com.'};
  const suggestionDomain=commonTypos[domain];
  if(suggestionDomain){
    const suggestion=local+'@'+suggestionDomain;
    return {valid:false,recognisedProvider:false,suggestion,message:`Check the email domain. Did you mean ${suggestion}?`};
  }
  return {valid:true,recognisedProvider:knownProviders.has(domain)};
}
