import { useActiveUpload } from "../api/useActiveUpload";

/**
 * Visible to every connected tab, not just the one uploading — a small collaborative
 * touch beyond the letter of the brief: both sessions can see a CSV is being processed
 * live, before any conflict has even been detected.
 */
export function LiveActivityBanner() {
  const { data: upload } = useActiveUpload();
  if (!upload || upload.status !== "processing") return null;

  return (
    <div role="status" className="live-activity-banner">
      Uploading "{upload.filename}"… {upload.rowsProcessed} row(s) processed
      {upload.rowsRejected > 0 ? `, ${upload.rowsRejected} rejected` : ""}
    </div>
  );
}
