import {NextRequest,NextResponse} from "next/server";
import {wooFetch} from "@/lib/woocommerce/client";
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await wooFetch(`orders/${(await params).id}`));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502});}}
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const id=(await params).id;return NextResponse.json(await wooFetch(`orders/${id}`,{method:"PUT",body:JSON.stringify(await request.json())}));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502});}}
export async function DELETE(_:NextRequest,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await wooFetch(`orders/${(await params).id}`,{method:"DELETE"}));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502});}}
