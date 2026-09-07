// Single source of truth for the max accepted CSV upload size — enforced by the server
// (rejecting oversized multipart uploads) and checked by the client (failing fast
// instead of spending the network round-trip on a file that the server will reject).
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
