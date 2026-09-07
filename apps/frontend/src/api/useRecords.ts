import { useInfiniteQuery } from "@tanstack/react-query";
import type { PageOf, RecordRow } from "@scientec/shared";
import { apiFetch } from "./client";

const PAGE_SIZE = 25;

/**
 * Keyset ("load more") pagination via TanStack Query's useInfiniteQuery, matching the
 * backend's cursor-based GET /records (see records.repository.ts) rather than page
 * numbers — stays correct even if rows are inserted by a concurrent upload mid-scroll.
 */
export function useRecords(search: string) {
  return useInfiniteQuery<PageOf<RecordRow>>({
    queryKey: ["records", search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (typeof pageParam === "number") {
        params.set("cursor", String(pageParam));
      }
      if (search) {
        params.set("q", search);
      }
      return apiFetch<PageOf<RecordRow>>(`/records?${params.toString()}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
