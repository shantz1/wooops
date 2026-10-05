"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const sections = [["/products", "Catalogue"], ["/products/categories", "Categories"], ["/products/attributes", "Attributes"], ["/products/variations", "Variations"], ["/products/reviews", "Reviews"]];
export function ProductNavigation() {
  const path = usePathname();
  return <nav aria-label="Product workspace" className="flex flex-wrap gap-2 border-b pb-3">{sections.map(([href, name]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={`rounded-lg border-b-2 px-3 py-2 text-sm font-medium ${path === href ? "border-b-primary text-primary" : "border-b-transparent text-muted-foreground hover:bg-accent"}`}>{name}</Link>)}</nav>;
}
