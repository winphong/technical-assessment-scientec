import { useEffect, useRef } from "react";
import type { Conflict, CsvRowInput } from "@scientec/shared";

const FIELD_LABELS: Record<keyof Omit<CsvRowInput, "id">, string> = {
  postId: "Post ID",
  name: "Name",
  email: "Email",
  body: "Body",
};

const FIELDS = Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[];

interface ConflictDiffModalProps {
  conflict: Conflict;
  onResolve: (resolution: "keep_old" | "keep_new") => void;
  onClose: () => void;
}

/**
 * The "diff UI" from the assessment brief: for one conflicting record, show old vs new
 * side by side, highlighting only the fields that actually changed (`diffFields`,
 * computed server-side in conflict-engine.ts — never re-derived here, so the frontend
 * can't drift out of sync with what the backend considers "different").
 */
export function ConflictDiffModal({ conflict, onResolve, onClose }: ConflictDiffModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-label="Conflict diff" className="conflict-diff-modal">
      <h2>Conflicting update to record #{conflict.recordId}</h2>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Current</th>
            <th>Incoming</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((field) => {
            const changed = conflict.diffFields.includes(field);
            return (
              <tr key={field} data-changed={changed} className={changed ? "diff-changed" : undefined}>
                <td>{FIELD_LABELS[field]}</td>
                <td>{conflict.oldData ? String(conflict.oldData[field]) : "—"}</td>
                <td>{String(conflict.newData[field])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="conflict-diff-actions">
        <button onClick={() => onResolve("keep_old")}>Keep current</button>
        <button onClick={() => onResolve("keep_new")}>Keep incoming</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
}
