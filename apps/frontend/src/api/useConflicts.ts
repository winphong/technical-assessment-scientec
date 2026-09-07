import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Conflict, RecordRow } from "@scientec/shared";
import { apiFetch } from "./client";

export function useConflicts() {
  return useQuery<Conflict[]>({
    queryKey: ["conflicts"],
    queryFn: () => apiFetch<Conflict[]>("/conflicts"),
  });
}

interface ResolveConflictArgs {
  id: string;
  resolution: "keep_old" | "keep_new";
}

export function useResolveConflict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolution }: ResolveConflictArgs) =>
      apiFetch<{ conflict: Conflict; record: RecordRow }>(`/conflicts/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      }),
    onSuccess: () => {
      // The SSE broadcast will also trigger this invalidation in every OTHER connected
      // tab; doing it here too means the tab that actually clicked doesn't wait on its
      // own round trip through the event bus to see the result.
      queryClient.invalidateQueries({ queryKey: ["conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["records"] });
    },
  });
}
