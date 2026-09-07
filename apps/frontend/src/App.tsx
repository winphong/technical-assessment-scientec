import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRecords } from "./api/useRecords";
import { useSse } from "./api/useSse";
import { SearchBox } from "./components/SearchBox";
import { RecordsTable } from "./components/RecordsTable";
import { UploadDropzone } from "./components/UploadDropzone";
import { ConflictBanner } from "./components/ConflictBanner";
import { LiveActivityBanner } from "./components/LiveActivityBanner";
import { ResetDbButton } from "./components/ResetDbButton";

export function App() {
  const queryClient = useQueryClient();
  useSse(queryClient);

  const [search, setSearch] = useState("");
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useRecords(search);
  const records = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  return (
    <main>
      <h1>CSV Collaboration</h1>

      <ResetDbButton />

      <LiveActivityBanner />
      <ConflictBanner />

      <section>
        <UploadDropzone />
      </section>

      <section>
        <SearchBox onSearch={setSearch} />
        <RecordsTable
          records={records}
          isLoading={isLoading}
          isError={isError}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
        />
      </section>
    </main>
  );
}
