import { useState } from "react";
import { useUploadCsv } from "../api/useUpload";

export function UploadDropzone() {
  const [progress, setProgress] = useState<number | null>(null);
  const mutation = useUploadCsv();

  function handleFiles(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;
    setProgress(0);
    mutation.mutate({ file, onProgress: setProgress }, { onSettled: () => setProgress(null) });
  }

  return (
    <div className="upload-dropzone">
      <label>
        Upload CSV
        <input type="file" accept=".csv,text/csv" onChange={(e) => handleFiles(e.target.files)} aria-label="Upload CSV" />
      </label>

      {progress !== null && (
        <div className="upload-progress">
          <progress value={progress} max={1} aria-label="Upload transfer progress" />
          <span>{Math.round(progress * 100)}%</span>
        </div>
      )}

      {mutation.isPending && progress === null && <p>Processing on the server…</p>}

      {mutation.isSuccess && (
        <p role="status">
          Uploaded "{mutation.data.filename}": {mutation.data.rowsProcessed} row(s) processed
          {mutation.data.rowsRejected > 0 ? `, ${mutation.data.rowsRejected} rejected` : ""}.
        </p>
      )}

      {mutation.isError && <p role="alert">Upload failed: {mutation.error.message}</p>}
    </div>
  );
}
