import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SseEvent } from "@scientec/shared";
import { API_BASE_URL } from "./client";

const SSE_EVENT_TYPES: SseEvent["type"][] = [
  "upload:progress",
  "conflict:new",
  "conflict:resolved",
  "conflict:outdated",
  "record:updated",
];

/**
 * Turns one SSE event into TanStack Query cache operations, split by data shape (see
 * IMPLEMENTATION_PLAN.md's React Query section):
 *  - upload:progress is a direct cache patch (setQueryData) — it's a 1:1 pointer to a
 *    single Upload row, no server-side pagination/filtering to reconcile against.
 *  - conflict/record events invalidate instead of patching: surgically patching an
 *    arbitrary page of a server-paginated, server-searched list is error-prone (page
 *    membership shifts with sort/filter state the client doesn't fully own), whereas
 *    invalidation is simple, correct, and — at this scale — trivially inside the 3s SLA.
 * Invalidations are debounced per query key so a burst of row-level events during a
 * large upload triggers one refetch, not one per row.
 *
 * Exported standalone (not just used inside useSse) so it can be unit-tested against a
 * real QueryClient without needing a real EventSource/DOM.
 */
export function createSseEventHandler(queryClient: QueryClient, options: { debounceMs?: number } = {}) {
  const debounceMs = options.debounceMs ?? 250;
  const pendingKeys = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function scheduleInvalidate(key: string): void {
    pendingKeys.add(key);
    if (timer) return;
    timer = setTimeout(() => {
      for (const pendingKey of pendingKeys) {
        queryClient.invalidateQueries({ queryKey: [pendingKey] });
      }
      pendingKeys.clear();
      timer = null;
    }, debounceMs);
  }

  return function handleSseEvent(event: SseEvent): void {
    switch (event.type) {
      case "upload:progress":
        queryClient.setQueryData(["upload", event.payload.id], event.payload);
        queryClient.setQueryData(["activeUpload"], event.payload);
        break;
      case "conflict:new":
      case "conflict:resolved":
        // A conflict being created or resolved always implies the records list may
        // have changed too (resolved -> the record was just written).
        scheduleInvalidate("conflicts");
        scheduleInvalidate("records");
        break;
      case "conflict:outdated":
        // Superseded by a newer conflicting upload for the same record — the record
        // itself wasn't written (that's still gated behind resolving the surviving
        // conflict), so only the conflicts list needs to drop this one. If a client has
        // it open in a diff modal, the refetch removes it from the list and the modal
        // closes on its own (see ConflictBanner's lookup-by-id).
        scheduleInvalidate("conflicts");
        break;
      case "record:updated":
        scheduleInvalidate("records");
        break;
    }
  };
}

/** Owns the EventSource connection; all event -> cache-op logic lives in the handler above. */
export function useSse(queryClient: QueryClient): void {
  useEffect(() => {
    const handle = createSseEventHandler(queryClient);
    const source = new EventSource(`${API_BASE_URL}/events`);

    // Fires on the initial connect AND every auto-reconnect — cheap insurance against
    // events missed while a tab's connection was dropped.
    source.onopen = () => {
      queryClient.invalidateQueries({ queryKey: ["conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["records"] });
    };

    const listeners = SSE_EVENT_TYPES.map((type) => {
      const listener = (e: MessageEvent<string>) => {
        handle({ type, payload: JSON.parse(e.data) } as SseEvent);
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });

    return () => {
      for (const { type, listener } of listeners) source.removeEventListener(type, listener);
      source.close();
    };
  }, [queryClient]);
}
