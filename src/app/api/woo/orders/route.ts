import {NextRequest,NextResponse} from "next/server";
import {isWooCommerceConfigured,wooFetchWithHeaders} from "@/lib/woocommerce/client";
import type {WooOrder} from "@/types/woocommerce";
export async function GET(request:NextRequest){
 if(!isWooCommerceConfigured()) return NextResponse.json({configured:false,orders:[],total:0,pages:0});
 const p=request.nextUrl.searchParams; const page=p.get("page")||"1"; const perPage=p.get("per_page")||"20"; const search=p.get("search")||""; const status=p.get("status")||"";
 const query=new URLSearchParams({page,per_page:perPage,orderby:"date",order:"desc"}); if(search)query.set("search",search); if(status&&status!=="all")query.set("status",status);
 try{const r=await wooFetchWithHeaders<WooOrder[]>(`orders?${query}`);return NextResponse.json({configured:true,orders:r.data,total:r.total,pages:r.pages});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502});}
}
export async function POST(request:NextRequest){try{const body=await request.json();const order=await (await import("@/lib/woocommerce/client")).wooFetch<WooOrder>("orders",{method:"POST",body:JSON.stringify(body)});return NextResponse.json(order,{status:201});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502});}}
