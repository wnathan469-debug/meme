import type { Origin } from "../connectors/x/contracts";
export const CHAINS = [
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "solana",
] as const;
export type Chain = (typeof CHAINS)[number];
const mask = (1n << 64n) - 1n;
const rotations = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];
const constants = [
  0x1n,
  0x8082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x808bn,
  0x80000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x8an,
  0x88n,
  0x80008009n,
  0x8000000an,
  0x8000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x80000001n,
  0x8000000080008008n,
];
const rol = (v: bigint, n: number) =>
  n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & mask;
/** Keccak-256, legacy Ethereum padding (not FIPS SHA3-256). Bounded ASCII EIP-55 input. */
export function addressHash(lowerHex: string): string {
  if (!/^[a-f0-9]{40}$/.test(lowerHex))
    throw new Error("Expected 40 lowercase hex characters");
  const bytes = new TextEncoder().encode(lowerHex),
    block = new Uint8Array(136);
  block.set(bytes);
  block[bytes.length] = 1;
  block[135] |= 128;
  const state = Array<bigint>(25).fill(0n);
  for (let i = 0; i < block.length; i++)
    state[Math.floor(i / 8)] ^= BigInt(block[i]) << BigInt((i % 8) * 8);
  for (const rc of constants) {
    const c = Array.from(
      { length: 5 },
      (_, x) =>
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20],
    );
    const d = c.map((_, x) => c[(x + 4) % 5] ^ rol(c[(x + 1) % 5], 1));
    const b = Array<bigint>(25).fill(0n);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rol(
          state[x + 5 * y] ^ d[x],
          rotations[x + 5 * y],
        );
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        state[x + 5 * y] =
          b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & b[((x + 2) % 5) + 5 * y]);
    state[0] ^= rc;
  }
  return Array.from({ length: 32 }, (_, i) =>
    Number((state[Math.floor(i / 8)] >> BigInt((i % 8) * 8)) & 255n)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
}
export function normalizeAddress(
  chain: Chain,
  address: string,
  origin: Origin,
): string | null {
  if (origin === "DEMO") {
    return chain === "solana"
      ? /^DEMo[1-9A-HJ-NP-Za-km-z]{28,40}$/.test(address)
        ? address
        : null
      : /^0xDEMO[0-9]{36}$/.test(address)
        ? address
        : null;
  }
  if (chain !== "solana") {
    if (!/^0x[\da-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address))
      return null;
    const body = address.slice(2),
      lower = body.toLowerCase();
    if (body !== lower && body !== body.toUpperCase()) {
      const hash = addressHash(lower);
      if (
        [...body].some(
          (c, i) =>
            /[a-fA-F]/.test(c) &&
            c !==
              (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c.toLowerCase()),
        )
      )
        return null;
    }
    return "0x" + lower;
  }
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  let value = 0n;
  for (const c of address) value = value * 58n + BigInt(alphabet.indexOf(c));
  let length = 0;
  while (value > 0n) {
    length++;
    value >>= 8n;
  }
  length += address.match(/^1*/)?.[0].length ?? 0;
  if (
    length !== 32 ||
    [
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "ComputeBudget111111111111111111111111111111",
      "SysvarRent111111111111111111111111111111111",
    ].includes(address)
  )
    return null;
  return address;
}
