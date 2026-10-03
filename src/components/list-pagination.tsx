import { ChevronLeft, ChevronRight } from "lucide-react";

export function ListPagination({ page, pages, total, busy, onPage }: { page: number; pages: number; total: number; busy: boolean; onPage: (page: number) => void }) {
  return <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-sm">
    <span className="text-muted-foreground">Page {page} of {Math.max(1, pages)} · {total} records</span>
    <div className="flex gap-2">
      <button type="button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
      <button type="button" disabled={busy || page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" className="rounded-md border p-2 disabled:opacity-40"><ChevronRight className="size-4" /></button>
    </div>
  </div>;
}
