import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Conflict } from "@scientec/shared";
import { ConflictDiffModal } from "./ConflictDiffModal";

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: "conflict-1",
    recordId: 7,
    uploadId: "upload-1",
    oldData: { id: 7, postId: 1, name: "Ada Lovelace", email: "ada@example.com", body: "same body" },
    newData: { id: 7, postId: 1, name: "Ada L.", email: "ada@newdomain.com", body: "same body" },
    diffFields: ["name", "email"],
    status: "pending",
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ConflictDiffModal", () => {
  it("highlights exactly the fields listed in diffFields, and only those", () => {
    render(<ConflictDiffModal conflict={makeConflict()} onResolve={() => {}} onClose={() => {}} />);

    const nameRow = screen.getByText("Name").closest("tr")!;
    const emailRow = screen.getByText("Email").closest("tr")!;
    const bodyRow = screen.getByText("Body").closest("tr")!;
    const postIdRow = screen.getByText("Post ID").closest("tr")!;

    expect(nameRow).toHaveClass("diff-changed");
    expect(emailRow).toHaveClass("diff-changed");
    expect(bodyRow).not.toHaveClass("diff-changed");
    expect(postIdRow).not.toHaveClass("diff-changed");
  });

  it("shows both the old and new values for a changed field", () => {
    render(<ConflictDiffModal conflict={makeConflict()} onResolve={() => {}} onClose={() => {}} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("ada@newdomain.com")).toBeInTheDocument();
  });

  it("falls back to an em dash when there's no old snapshot", () => {
    render(<ConflictDiffModal conflict={makeConflict({ oldData: null })} onResolve={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("calls onResolve with keep_new / keep_old for the respective buttons", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(<ConflictDiffModal conflict={makeConflict()} onResolve={onResolve} onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Keep incoming" }));
    expect(onResolve).toHaveBeenCalledWith("keep_new");

    await user.click(screen.getByRole("button", { name: "Keep current" }));
    expect(onResolve).toHaveBeenCalledWith("keep_old");
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConflictDiffModal conflict={makeConflict()} onResolve={() => {}} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
