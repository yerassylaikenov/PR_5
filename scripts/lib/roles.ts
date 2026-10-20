// OpenZeppelin AccessControl role identifiers.
// DEFAULT_ADMIN_ROLE = 0x00..00; named roles = keccak256(role name bytes).
import { keccak256, toHex, type Hex } from "viem";

export const DEFAULT_ADMIN_ROLE: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const OPERATOR_ROLE: Hex = keccak256(toHex("OPERATOR_ROLE"));
export const SETTLEMENT_ROLE: Hex = keccak256(toHex("SETTLEMENT_ROLE"));

export const ROLE_LABELS: Record<string, string> = {
  [DEFAULT_ADMIN_ROLE]: "Администратор (DEFAULT_ADMIN_ROLE)",
  [OPERATOR_ROLE]: "Оператор (OPERATOR_ROLE)",
  [SETTLEMENT_ROLE]: "Расчётный центр (SETTLEMENT_ROLE)",
};
