import { describe, it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({ request: vi.fn(), destroy: vi.fn() }));
vi.mock("undici", () => ({
  request: mock.request,
  Agent: class {
    destroy = mock.destroy;
  },
}));
import { pinnedWire } from "../../packages/shared/http";
import {
  failure,
  safeFailure,
  ProviderError,
} from "../../packages/shared/errors";
const args = () => ({
  url: new URL("https://api.x.com/2/tweets"),
  headers: {},
  addresses: ["8.8.8.8"],
  signal: new AbortController().signal,
  maxBytes: 4,
});
function response(
  chunks: Uint8Array[],
  headers: Record<string, string | string[] | undefined> = {},
) {
  const destroy = vi.fn();
  return {
    statusCode: 200,
    headers,
    body: {
      destroy,
      async *[Symbol.asyncIterator]() {
        yield* chunks;
      },
    },
  };
}
beforeEach(() => {
  mock.request.mockReset();
  mock.destroy.mockReset();
});
describe("pinned TLS wire response handling (mock socket, no X traffic)", () => {
  it("normalizes headers, bounds decoded response and destroys its agent", async () => {
    mock.request.mockResolvedValue(
      response([Buffer.from("{}")], { "X-Test": ["a", "b"], empty: undefined }),
    );
    expect(await pinnedWire(args())).toEqual({
      status: 200,
      headers: { "x-test": "a,b" },
      body: "{}",
    });
    expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it("refuses compression and oversized streamed bodies", async () => {
    for (const value of [
      response([], { "content-encoding": "gzip" }),
      response([Buffer.from("12345")]),
    ]) {
      mock.request.mockResolvedValue(value);
      await expect(pinnedWire(args())).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        sent: true,
      });
      expect(value.body.destroy).toHaveBeenCalledOnce();
    }
  });
  it("sanitizes malformed UTF8 and connection failures", async () => {
    mock.request.mockResolvedValue(response([new Uint8Array([255])]));
    await expect(pinnedWire(args())).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      sent: true,
    });
    mock.request.mockRejectedValue(new Error("credential must never escape"));
    await expect(pinnedWire(args())).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      sent: true,
    });
    const abort = new AbortController();
    abort.abort();
    await expect(
      pinnedWire({ ...args(), signal: abort.signal }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("serializes only safe errors", () => {
    expect(() => failure("INVALID_INPUT")).toThrow(ProviderError);
    const error = safeFailure(new Error("secret"));
    expect(error.toJSON()).toMatchObject({ code: "NETWORK_ERROR" });
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(safeFailure(error)).toBe(error);
  });
});
