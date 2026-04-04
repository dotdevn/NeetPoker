import { createHash, randomUUID } from "node:crypto";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { appConfig, AGENT_IDS, getWalletPrivateKey, type AgentId } from "./config.js";
import { getAddress, getPotAddress, getSigners } from "./wallet-manager.js";
import { BASESCAN_TX_URL, type TransactionInfo } from "./types.js";

const fetches = new Map<string, typeof fetch>();
let bypassPayments = false;
const USDC_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function initX402Clients(): void {
  fetches.clear();
  if (appConfig.mockPayments || bypassPayments) return;

  const ids = [...AGENT_IDS, "pot"] as const;
  for (const id of ids) {
    const key = getWalletPrivateKey(id);
    const account = privateKeyToAccount(key);
    const client = new x402Client();
    registerExactEvmScheme(client, {
      signer: account,
      networks: [appConfig.network],
    });
    const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);
    fetches.set(id, paidFetch as typeof fetch);
  }
}

export function setPaymentBypassMode(enabled: boolean): void {
  bypassPayments = enabled;
  if (enabled) fetches.clear();
}

export function isPaymentBypassMode(): boolean {
  return bypassPayments;
}

function shouldUseMockPayments(): boolean {
  return appConfig.mockPayments || bypassPayments;
}

export function getPaidFetch(agentId: AgentId | "pot"): typeof fetch {
  if (shouldUseMockPayments()) {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await globalThis.fetch(input, init);
      const txHash = `0xMOCK${Date.now().toString(16).padStart(56, "0")}`;
      try {
        const body = (await res.clone().json()) as Record<string, unknown>;
        return new Response(JSON.stringify({ ...body, txHash }), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      } catch {
        return new Response(await res.text(), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    };
  }
  return fetches.get(agentId) ?? globalThis.fetch;
}

export async function extractTxHash(res: Response): Promise<string | undefined> {
  const h =
    res.headers.get("payment-response") ??
    res.headers.get("PAYMENT-RESPONSE") ??
    res.headers.get("x-payment-response");
  if (h) {
    try {
      const j = JSON.parse(h) as { txHash?: string; transaction?: string };
      return j.txHash ?? j.transaction;
    } catch {
      return undefined;
    }
  }
  try {
    const body = (await res.clone().json()) as { txHash?: string };
    return body.txHash;
  } catch {
    return undefined;
  }
}

function syntheticTxHash(params: {
  from: string;
  to: string;
  amount: number;
  status: TransactionInfo["status"];
  action: string;
  handNumber: number;
}): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        ...params,
        synthetic: true,
      }),
    )
    .digest("hex");
  return `0x${digest}`;
}

function isRealTxHash(txHash?: string): boolean {
  return typeof txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(txHash);
}

export function buildTransactionInfo(params: {
  from: string;
  to: string;
  amount: number;
  txHash?: string;
  status: TransactionInfo["status"];
  action: string;
  handNumber: number;
}): TransactionInfo {
  const hasRealHash = isRealTxHash(params.txHash);
  const txHash =
    params.txHash ??
    syntheticTxHash({
      from: params.from,
      to: params.to,
      amount: params.amount,
      status: params.status,
      action: params.action,
      handNumber: params.handNumber,
    });
  const status =
    params.status === "settled" && !hasRealHash ? "pending" : params.status;
  const explorerUrl = hasRealHash ? `${BASESCAN_TX_URL}${txHash}` : undefined;
  return {
    id: `${params.handNumber}-${params.action}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    from: params.from,
    to: params.to,
    amount: params.amount,
    txHash,
    explorerUrl,
    status,
    timestamp: Date.now(),
    action: params.action,
    handNumber: params.handNumber,
  };
}

export async function transferUsdc(
  from: PrivateKeyAccount,
  toAddress: string,
  amount: number,
): Promise<string> {
  const walletClient = createWalletClient({
    account: from,
    chain: baseSepolia,
    transport: http(appConfig.baseSepoliaRpc()),
  });

  return walletClient.writeContract({
    account: from,
    chain: baseSepolia,
    address: appConfig.usdcContract,
    abi: USDC_TRANSFER_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, parseUnits(amount.toFixed(6), 6)],
  });
}

export async function potPayToWinner(
  winnerId: string,
  amount: number,
  handNumber: number,
): Promise<TransactionInfo> {
  const from = "pot";
  const to = winnerId;

  if (shouldUseMockPayments()) {
    const txHash = `0xMOCK${Date.now().toString(16).padStart(56, "0")}`;
    return buildTransactionInfo({
      from,
      to,
      amount,
      txHash,
      status: "mock",
      action: "win",
      handNumber,
    });
  }

  try {
    const potSigner = getSigners().get("pot");
    if (!potSigner) {
      throw new Error("Missing pot signer");
    }
    const txHash = await transferUsdc(potSigner, getAddress(winnerId), amount);
    return buildTransactionInfo({
      from,
      to,
      amount,
      txHash,
      status: "settled",
      action: "win",
      handNumber,
    });
  } catch {
    return buildTransactionInfo({
      from,
      to,
      amount,
      status: "failed",
      action: "win",
      handNumber,
    });
  }
}

export async function agentPayToPot(
  agentId: AgentId,
  amount: number,
  handNumber: number,
  action: "blind" | "call" | "raise",
): Promise<TransactionInfo> {
  const from = agentId;
  const to = "pot";

  if (shouldUseMockPayments()) {
    const txHash = `0xMOCK${Date.now().toString(16).padStart(56, "0")}`;
    return buildTransactionInfo({
      from,
      to,
      amount,
      txHash,
      status: "mock",
      action,
      handNumber,
    });
  }

  try {
    const signer = getSigners().get(agentId);
    if (!signer) {
      throw new Error(`Missing signer for ${agentId}`);
    }
    const txHash = await transferUsdc(signer, getPotAddress(), amount);
    return buildTransactionInfo({
      from,
      to,
      amount,
      txHash,
      status: "settled",
      action,
      handNumber,
    });
  } catch {
    return buildTransactionInfo({
      from,
      to,
      amount,
      status: "failed",
      action,
      handNumber,
    });
  }
}
