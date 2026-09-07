import { useResetDb } from "../api/useResetDb";

export function ResetDbButton() {
  const mutation = useResetDb();

  function handleClick(): void {
    if (!window.confirm("Delete all uploads, records, and conflicts? This cannot be undone.")) return;
    mutation.mutate();
  }

  return (
    <div className="reset-db">
      <button type="button" onClick={handleClick} disabled={mutation.isPending}>
        {mutation.isPending ? "Clearing…" : "Clear all data"}
      </button>
      {mutation.isError && <p role="alert">Reset failed: {mutation.error.message}</p>}
    </div>
  );
}
