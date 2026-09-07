import type { RecordRow } from "@scientec/shared";

interface RecordsTableProps {
  records: RecordRow[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function RecordsTable({ records, isLoading, isError, hasNextPage, isFetchingNextPage, onLoadMore }: RecordsTableProps) {
  if (isLoading) return <p>Loading records…</p>;
  if (isError) return <p role="alert">Failed to load records.</p>;

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Post ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Body</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.postId}</td>
              <td>{r.name}</td>
              <td>{r.email}</td>
              <td className="body-cell">{r.body}</td>
              <td>{new Date(r.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && <p>No records found.</p>}
      {hasNextPage && (
        <button onClick={onLoadMore} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
