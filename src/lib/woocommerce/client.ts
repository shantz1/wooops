const storeUrl = process.env.WOOCOMMERCE_URL?.replace(/\/$/, "");
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export function isWooCommerceConfigured(){return Boolean(storeUrl&&consumerKey&&consumerSecret);}
export async function wooFetch<T>(path:string, init:RequestInit={}):Promise<T>{
 if(!isWooCommerceConfigured()) throw new Error("WooCommerce is not configured.");
 const url=new URL(`wp-json/wc/v3/${path.replace(/^\//,"")}`,`${storeUrl}/`);
 url.searchParams.set("consumer_key",consumerKey!); url.searchParams.set("consumer_secret",consumerSecret!);
 const response=await fetch(url,{...init,headers:{"Content-Type":"application/json",Accept:"application/json",...init.headers},cache:"no-store"});
 if(!response.ok){const body=await response.text(); throw new Error(`WooCommerce API ${response.status}: ${body||response.statusText}`);}
 return response.json() as Promise<T>;
}
export async function wooFetchWithHeaders<T>(path:string,init:RequestInit={}){
 if(!isWooCommerceConfigured()) throw new Error("WooCommerce is not configured.");
 const url=new URL(`wp-json/wc/v3/${path.replace(/^\//,"")}`,`${storeUrl}/`);
 url.searchParams.set("consumer_key",consumerKey!); url.searchParams.set("consumer_secret",consumerSecret!);
 const response=await fetch(url,{...init,headers:{"Content-Type":"application/json",Accept:"application/json",...init.headers},cache:"no-store"});
 const data=await response.json();
 if(!response.ok) throw new Error(data?.message||`WooCommerce API ${response.status}`);
 return {data:data as T,total:Number(response.headers.get("X-WP-Total")||0),pages:Number(response.headers.get("X-WP-TotalPages")||1)};
}
