import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Upload } from "@scientec/shared";
import { apiFetch } from "./client";

interface UploadCsvArgs {
  file: File;
}

function uploadCsv({ file }: UploadCsvArgs): Promise<Upload> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return apiFetch<Upload>("/uploads", { method: "POST", body: formData });
}

export function useUploadCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadCsv,
    onSuccess: () => {
      // Belt-and-braces alongside the SSE-driven invalidation every tab (including this
      // one) receives once processing broadcasts its row-level events.
      queryClient.invalidateQueries({ queryKey: ["records"] });
      queryClient.invalidateQueries({ queryKey: ["conflicts"] });
    },
  });
}
