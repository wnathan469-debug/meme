import { it, expect, vi, beforeEach } from "vitest";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  destroy: vi.fn(async () => {}),
}));
vi.mock("undici", () => ({
  request: mock.request,
  Agent: class {
    destroy = mock.destroy;
  },
}));
import { SafeStreamTransport } from "../../packages/shared/stream-http";
const url = new URL("https://api.x.com/2/tweets/search/stream");
const transport = () =>
  new SafeStreamTransport({
    mode: "live",
    allowedHosts: ["api.x.com"],
    resolve: async () => ["8.8.8.8"],
    connectTimeoutMs: 20,
  });
beforeEach(() => {
  mock.request.mockReset();
  mock.destroy.mockClear();
});
it("pins a public lookup, normalizes headers and releases the streaming agent", async () => {
  mock.request.mockResolvedValue({
    statusCode: 200,
    headers: { "X-Test": ["a", "b"], none: undefined },
    body: (async function* () {
      yield Buffer.from("\n");
    })(),
  });
  const response = await transport().open(
    url,
    { authorization: "Bearer fixture" },
    new AbortController().signal,
  );
  expect(response.headers).toEqual({ "x-test": "a,b" });
  expect(mock.request.mock.calls[0][1].bodyTimeout).toBe(0);
  await response.close();
  expect(mock.destroy).toHaveBeenCalledOnce();
});
it.each([
  { statusCode: 302, headers: { location: "https://evil.invalid" } },
  { statusCode: 200, headers: { "content-encoding": "gzip" } },
])("rejects unsafe stream handshake %j", async (value) => {
  mock.request.mockResolvedValue({ ...value, body: (async function* () {})() });
  await expect(
    transport().open(url, {}, new AbortController().signal),
  ).rejects.toMatchObject({
    code: value.statusCode === 302 ? "UNSAFE_URL" : "INVALID_RESPONSE",
  });
  expect(mock.destroy).toHaveBeenCalledOnce();
});
it("sanitizes socket failures and times out unresolved DNS without starting a request", async () => {
  mock.request.mockRejectedValue(new Error("secret credential fixture"));
  await expect(
    transport().open(url, {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  const waiting = new SafeStreamTransport({
    mode: "live",
    allowedHosts: ["api.x.com"],
    resolve: () => new Promise(() => {}),
    connectTimeoutMs: 5,
  });
  const before = mock.request.mock.calls.length;
  await expect(
    waiting.open(url, {}, new AbortController().signal),
  ).rejects.toMatchObject({ code: "TIMEOUT" });
  expect(mock.request).toHaveBeenCalledTimes(before);
});
