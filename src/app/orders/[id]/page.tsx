import { AppShell } from "@/components/app-shell";
import { OrderDetail } from "@/components/order-detail";
export default async function OrderPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AppShell><OrderDetail key={id} id={id}/></AppShell>}
