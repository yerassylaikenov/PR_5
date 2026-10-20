// Client-side input validation and id/hash helpers. This DUPLICATES the
// contract's checks for better UX — it does NOT replace them (requirement 4.3).
import { keccak256, toHex, isHex, type Hex } from "viem";

export const UINT128_MAX = (1n << 128n) - 1n;

/** 0x + 64 hex is used as-is; any other string is hashed to a 32-byte id. */
export function toPaymentId(input: string): Hex {
  const s = input.trim();
  if (isHex(s) && s.length === 66) return s as Hex;
  return keccak256(toHex(s));
}

export function validateAmount(input: string): { ok: boolean; value?: bigint; error?: string } {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return { ok: false, error: "Сумма — целое число в тиынах" };
  const v = BigInt(s);
  if (v <= 0n) return { ok: false, error: "Сумма должна быть больше 0" };
  if (v > UINT128_MAX) return { ok: false, error: "Сумма превышает uint128" };
  return { ok: true, value: v };
}

export function reasonToBytes32(code: string): { ok: boolean; value?: Hex; error?: string } {
  const s = code.trim();
  if (!s) return { ok: false, error: "Код причины не должен быть пустым" };
  if (s.length > 32) return { ok: false, error: "Код причины до 32 символов" };
  return { ok: true, value: toHex(s, { size: 32 }) };
}

/** keccak256 of the raw file bytes — matches the hash computed off-chain. */
export async function fileKeccak(file: File): Promise<Hex> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return keccak256(buf);
}

export function short(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
