import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Conflict, Upload } from "@scientec/shared";
import { createSseEventHandler } from "./useSse";

function makeUpload(overrides: Partial<Upload> = {}): Upload {
  return {
    id: "upload-1",
    filename: "test.csv",
    status: "processing",
    bytesTotal: 100,
    bytesProcessed: 50,
    rowsTotal: 10,
    rowsProcessed: 5,
    rowsRejected: 0,
    rejectedSamples: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: "conflict-1",
    recordId: 1,
    uploadId: "upload-1",
    oldData: { id: 1, postId: 1, name: "A", email: "a@example.com", body: "x" },
    newData: { id: 1, postId: 1, name: "B", email: "b@example.com", body: "y" },
    diffFields: ["name", "email"],
    status: "pending",
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("createSseEventHandler", () => {
  it("patches the upload and activeUpload cache entries directly on upload:progress", () => {
    const queryClient = new QueryClient();
    const handle = createSseEventHandler(queryClient);
    const upload = makeUpload();

    handle({ type: "upload:progress", payload: upload });

    expect(queryClient.getQueryData(["upload", upload.id])).toEqual(upload);
    expect(queryClient.getQueryData(["activeUpload"])).toEqual(upload);
  });

  it("debounces conflicts+records invalidation on conflict:new", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const handle = createSseEventHandler(queryClient, { debounceMs: 10 });

    handle({ type: "conflict:new", payload: makeConflict() });
    handle({ type: "conflict:new", payload: makeConflict({ id: "conflict-2" }) });

    // Two events in quick succession should collapse into one invalidation per key,
    // not fire twice — that's the point of debouncing a burst of row-level events.
    expect(invalidateSpy).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conflicts"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["records"] });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidates conflicts+records on conflict:resolved", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const handle = createSseEventHandler(queryClient, { debounceMs: 5 });

    handle({ type: "conflict:resolved", payload: makeConflict({ status: "resolved_keep_new" }) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conflicts"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["records"] });
  });

  it("invalidates only conflicts on conflict:outdated", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const handle = createSseEventHandler(queryClient, { debounceMs: 5 });

    handle({ type: "conflict:outdated", payload: makeConflict({ status: "outdated" }) });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conflicts"] });
  });

  it("invalidates only records on record:updated", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const handle = createSseEventHandler(queryClient, { debounceMs: 5 });

    handle({ type: "record:updated", payload: { id: 42 } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["records"] });
  });
});
