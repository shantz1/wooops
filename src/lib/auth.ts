import crypto from "node:crypto";
const cookieName="wooops_session";
function secret(){return process.env.WOOOPS_SESSION_SECRET||""}
export function authEnabled(){return Boolean(process.env.WOOOPS_ADMIN_PASSWORD&&secret())}
export function createSessionToken(){const issued=Date.now().toString();const sig=crypto.createHmac("sha256",secret()).update(issued).digest("hex");return issued+"."+sig}
export function verifySessionToken(token?:string|null){if(!token||!authEnabled())return false;const [issued,sig]=token.split(".");if(!issued||!sig||Date.now()-Number(issued)>7*24*60*60*1000)return false;const expected=crypto.createHmac("sha256",secret()).update(issued).digest("hex");return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))}
export {cookieName}
