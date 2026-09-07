import { useEffect, useRef } from "react";
import type { RecordRow } from "@scientec/shared";

const MAX_RECORDS = 100;
// Trigger the next fetch this far before the sentinel actually enters the viewport,
// so scrolling feels continuous instead of pausing at the bottom edge.
const LOAD_MORE_ROOT_MARGIN = "300px";

interface RecordsTableProps {
  records: RecordRow[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function RecordsTable({
  records,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: RecordsTableProps) {
  const cappedHasNextPage = Boolean(hasNextPage) && records.length < MAX_RECORDS;
  const hitCap = Boolean(hasNextPage) && records.length >= MAX_RECORDS;

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cappedHasNextPage) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { rootMargin: LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cappedHasNextPage, isFetchingNextPage, onLoadMore]);

  if (isLoading) return <p>Loading records…</p>;
  if (isError) return <p role="alert">Failed to load records.</p>;

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th className="post-id-cell">Post ID</th>
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
              <td className="post-id-cell">{r.postId}</td>
              <td>{r.name}</td>
              <td>{r.email}</td>
              <td className="body-cell">
                <span className="body-cell-truncated">{r.body}</span>
                <span className="body-cell-popover">{r.body}</span>
              </td>
              <td>{new Date(r.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {records.length === 0 && <p>No records found.</p>}
      {cappedHasNextPage && <div ref={sentinelRef} aria-hidden="true" />}
      {isFetchingNextPage && <p>Loading more…</p>}
      {hitCap && (
        <p role="status" className="records-cap-message">
          Showing the first {MAX_RECORDS} results. Use search to narrow the list and find more.
        </p>
      )}
    </div>
  );
}
