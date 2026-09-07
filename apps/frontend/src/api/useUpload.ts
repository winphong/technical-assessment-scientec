import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Upload } from "@scientec/shared";
import { API_BASE_URL, ApiError } from "./client";

interface UploadCsvArgs {
  file: File;
  onProgress?: (fractionComplete: number) => void;
}

/**
 * Raw XHR rather than fetch: fetch has no upload-progress event, and byte-transfer
 * progress is exactly what a native progress bar needs while the file is still
 * streaming to the server (see upload.service.ts on the backend, which starts parsing
 * as bytes arrive rather than waiting for the full body).
 */
function uploadCsv({ file, onProgress }: UploadCsvArgs): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/uploads`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = xhr.responseText;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as Upload);
        return;
      }
      const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : xhr.statusText;
      reject(new ApiError(message, xhr.status, body));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading"));

    const formData = new FormData();
    formData.append("file", file, file.name);
    xhr.send(formData);
  });
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
