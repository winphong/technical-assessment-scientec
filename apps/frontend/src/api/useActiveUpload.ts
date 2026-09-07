import { useQuery } from "@tanstack/react-query";
import type { Upload } from "@scientec/shared";

/**
 * Not a real fetch — this key is only ever populated by useSse's handler patching
 * ["activeUpload"] on every upload:progress broadcast (see useSse.ts). Repurposing the
 * Query cache as a tiny reactive store this way means any component can subscribe to
 * "what upload is currently happening, dataset-wide" (visible to every connected
 * session, not just the uploader) without a separate state library.
 */
export function useActiveUpload() {
  return useQuery<Upload | null>({
    queryKey: ["activeUpload"],
    queryFn: () => null,
    initialData: null,
    staleTime: Infinity,
  });
}
