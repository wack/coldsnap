import { getAppConfig } from "@/lib/config";
import { memoryObjects } from "@/lib/storage/memory-store";

/**
 * Serves the in-memory object store (preview images) in
 * `COLDSNAP_DRIVERS=memory` mode. Absent otherwise; real objects live in Blob.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (getAppConfig().drivers !== "memory") return new Response(null, { status: 404 });
  const object = memoryObjects().get((await params).path.join("/"));
  if (!object) return new Response(null, { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: { "content-type": object.contentType, "cache-control": "private, max-age=60" },
  });
}
