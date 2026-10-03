/** Bound actual bytes, including chunked bodies, before parsing untrusted JSON. */
export async function limitedText(request: Request, limit = 64 * 1024, timeoutMs = 10_000) {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request body timed out.")), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Request body is too large.");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { clearTimeout(timer!); reader.releaseLock(); }
}
export async function readRequestJson(request: Request): ReturnType<Request["json"]> {
  return JSON.parse(await limitedText(request));
}
