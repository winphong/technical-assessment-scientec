import type { FastifyInstance } from "fastify";
import { UploadModel } from "../../db/models/upload";
import { serializeUpload } from "../../serializers";
import { processUploadStream } from "./upload.service";

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/uploads", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: "No file uploaded (expected a multipart 'file' field)" });
    }
    if (!file.filename.toLowerCase().endsWith(".csv")) {
      return reply.code(400).send({ error: "Only .csv files are accepted" });
    }

    const contentLength = Number(req.headers["content-length"]);
    const bytesTotalHint = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;

    const upload = await UploadModel.create({
      filename: file.filename,
      status: "processing",
      bytesTotal: bytesTotalHint,
    });

    // Deliberately awaited within this handler rather than fire-and-forget: with
    // @fastify/multipart, the file part's stream is tied to the request lifecycle, so it
    // must be fully drained here regardless. Live progress during that time is delivered
    // over SSE (see plugins/sse.ts + eventBus), not by delaying this HTTP response for a
    // faster feel — this response is the definitive "upload finished" result.
    try {
      await processUploadStream(upload.id, file.file, bytesTotalHint);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "Upload processing failed", uploadId: upload.id });
    }

    const finalUpload = await UploadModel.findByPk(upload.id, { rejectOnEmpty: true });
    return reply.code(200).send(serializeUpload(finalUpload));
  });

  app.get("/uploads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const upload = await UploadModel.findByPk(id);
    if (!upload) return reply.code(404).send({ error: "Upload not found" });
    return serializeUpload(upload);
  });
}
