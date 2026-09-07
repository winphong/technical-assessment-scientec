import { useRef, useState } from "react";
import { useUploadCsv } from "../api/useUpload";
import { useActiveUpload } from "../api/useActiveUpload";

export function UploadDropzone() {
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useUploadCsv();
  const { data: activeUpload } = useActiveUpload();

  // Only one upload can be in flight system-wide at a time (useActiveUpload is a single
  // cache slot, not one per upload) — block starting another one, whether it's this
  // tab's own submission or one broadcast from another connected tab, so the progress
  // bar below never ends up mixing two uploads' row counts.
  //
  // mutation.isPending is scoped to this tab's own useMutation instance — true only
  // while *this* tab's own POST /uploads request is in flight (the backend doesn't
  // respond until processing finishes). activeUpload, by contrast, is populated by SSE
  // broadcasts that every connected tab receives regardless of who started the upload.
  // Comparing the two lets the UI tell "my upload" apart from one merely observed via
  // another tab's broadcast, without needing any server-side client identity.
  const ownUpload = mutation.isPending;
  const foreignUpload = !ownUpload && activeUpload?.status === "processing";
  const uploading = ownUpload || foreignUpload;
  const liveProgress =
    activeUpload?.status === "processing" ? activeUpload : null;
  const rowsDone = liveProgress
    ? liveProgress.rowsProcessed + liveProgress.rowsRejected
    : 0;

  function stageFile(files: FileList | null): void {
    if (uploading) return;
    const file = files?.[0];
    if (!file) return;
    // Staging a new file starts a fresh attempt — clear whatever the previous one left
    // behind (success/error text) instead of leaving it visible underneath.
    mutation.reset();
    setStagedFile(file);
  }

  function submit(): void {
    if (!stagedFile) return;
    mutation.mutate(
      { file: stagedFile },
      { onSuccess: () => setStagedFile(null) },
    );
  }

  return (
    <div className="upload-area">
      <div
        className={`upload-dropzone${isDragging ? " is-dragging" : ""}${uploading ? " is-disabled" : ""}`}
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        onClick={() => !uploading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (uploading) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (uploading) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          stageFile(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => stageFile(e.target.files)}
          aria-label="Upload CSV"
          disabled={uploading}
          className="visually-hidden"
          tabIndex={-1}
        />
        <p className="upload-title">Upload CSV</p>
        <p className="upload-subtitle">or drag and drop a CSV file here</p>
        {stagedFile && <p className="upload-filename">{stagedFile.name}</p>}
      </div>

      {stagedFile && !uploading && (
        <div className="upload-staged">
          <button type="button" onClick={submit}>
            Submit
          </button>
        </div>
      )}

      {uploading && (
        <div className="upload-progress">
          {foreignUpload ? (
            <span className="upload-foreign-warning">
              Another upload is in progress in a different session — please wait
              until it finishes.{" "}
            </span>
          ) : (
            <>
              <progress
                value={liveProgress?.rowsTotal ? rowsDone : undefined}
                max={liveProgress?.rowsTotal ?? undefined}
                aria-label="Upload processing progress"
              />
              <span>
                {liveProgress
                  ? `${rowsDone} row(s) processed${liveProgress.rowsRejected > 0 ? `, ${liveProgress.rowsRejected} rejected` : ""}`
                  : "Processing on the server…"}
              </span>
            </>
          )}
        </div>
      )}

      {mutation.isSuccess && (
        <>
          <p role="status" className="upload-result">
            Uploaded "{mutation.data.filename}": {mutation.data.rowsProcessed}{" "}
            row(s) processed
            {mutation.data.rowsRejected > 0
              ? `, ${mutation.data.rowsRejected} rejected`
              : ""}
            .
          </p>
          {mutation.data.rejectedSamples.length > 0 && (
            <details className="upload-rejected">
              <summary>
                {mutation.data.rejectedSamples.length < mutation.data.rowsRejected
                  ? `Show rejected rows (first ${mutation.data.rejectedSamples.length} of ${mutation.data.rowsRejected})`
                  : "Show rejected rows"}
              </summary>
              <ul className="upload-rejected-list">
                {mutation.data.rejectedSamples.map((row) => (
                  <li key={row.line}>
                    <span className="upload-rejected-line">Line {row.line}:</span>{" "}
                    <span className="upload-rejected-reason">{row.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {mutation.isError && (
        <p role="alert" className="upload-result upload-error">
          Upload failed: {mutation.error.message}
        </p>
      )}
    </div>
  );
}
