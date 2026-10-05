"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";

export function AddProductAction() {
  const { can } = usePanelPreferences();
  if (!can("products.edit")) return null;
  return <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="size-4" /> Add product</Link>;
}
