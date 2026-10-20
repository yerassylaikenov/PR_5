// Decodes a viem error into the contract's custom-error name and a human
// message. Handles EIP-1193 user rejection (4001) explicitly (requirement 4.2.6).
import { BaseError, ContractFunctionRevertedError } from "viem";

const RU: Record<string, string> = {
  AccessControlUnauthorizedAccount: "The connected account does not have the required role",
  SelfSettlementForbidden: "Four-eyes principle violated: the settler cannot be the initiator",
  NotPaymentInitiator: "Only the initiator can cancel this payment order",
  InvalidStatusTransition: "Invalid status transition (the order is already in a final status)",
  PaymentAlreadyExists: "A payment order with this paymentId already exists",
  PaymentNotFound: "Payment order not found",
  InvalidPaymentId: "Empty paymentId",
  InvalidDocHash: "Empty document hash",
  InvalidAmount: "Amount must be greater than 0",
  InvalidReasonCode: "Reason code must not be empty",
  EnforcedPause: "Contract is paused (emergency mode)",
  UserRejectedRequest: "You rejected the signature request in the wallet",
};

export interface Decoded {
  errorName: string;
  message: string;
  isUserRejection: boolean;
}

export function decodeError(err: unknown): Decoded {
  // EIP-1193: user rejected the request.
  const code = (err as { code?: number })?.code;
  if (code === 4001) {
    return { errorName: "UserRejectedRequest", message: RU.UserRejectedRequest, isUserRejection: true };
  }
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as
      | ContractFunctionRevertedError
      | null;
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "UnknownRevert";
      return { errorName: name, message: RU[name] ?? revert.shortMessage, isUserRejection: false };
    }
    const nested = err.walk((e) => (e as { code?: number })?.code === 4001);
    if (nested) return { errorName: "UserRejectedRequest", message: RU.UserRejectedRequest, isUserRejection: true };
    return { errorName: "Error", message: err.shortMessage, isUserRejection: false };
  }
  return { errorName: "Error", message: err instanceof Error ? err.message : String(err), isUserRejection: false };
}
