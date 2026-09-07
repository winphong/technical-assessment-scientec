import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// We run with test.globals: false (explicit imports everywhere), so
// @testing-library/react's usual auto-cleanup-via-global-afterEach never registers —
// without this, DOM from one test leaks into the next render() call.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement <dialog>'s imperative methods (logs a noisy "not implemented"
// error otherwise); ConflictDiffModal only needs the element to actually be in the DOM
// and marked open for testing-library queries to find its content.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

