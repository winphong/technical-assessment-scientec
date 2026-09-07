import { useState } from "react";
import { useConflicts, useResolveConflict } from "../api/useConflicts";
import { ConflictDiffModal } from "./ConflictDiffModal";

export function ConflictBanner() {
  const { data: conflicts = [] } = useConflicts();
  const [openConflictId, setOpenConflictId] = useState<string | null>(null);
  const resolve = useResolveConflict();

  if (conflicts.length === 0) return null;

  const openConflict = conflicts.find((c) => c.id === openConflictId) ?? null;

  return (
    <div role="alert" className="conflict-banner">
      <strong>
        {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} need review
      </strong>
      <ul>
        {conflicts.map((c) => (
          <li key={c.id}>
            Record #{c.recordId} — {c.diffFields.join(", ")} changed{" "}
            <button onClick={() => setOpenConflictId(c.id)}>Review</button>
          </li>
        ))}
      </ul>

      {openConflict && (
        <ConflictDiffModal
          conflict={openConflict}
          onClose={() => setOpenConflictId(null)}
          onResolve={(resolution) => {
            resolve.mutate({ id: openConflict.id, resolution });
            setOpenConflictId(null);
          }}
        />
      )}
    </div>
  );
}
