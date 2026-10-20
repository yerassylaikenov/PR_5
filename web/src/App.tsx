import { useCallback, useEffect, useRef, useState } from "react";
import { type Abi, type Hex } from "viem";
import {
  publicClient, loadDeployment, type Deployment, CHAIN_ID,
  OPERATOR_ROLE, SETTLEMENT_ROLE, DEFAULT_ADMIN_ROLE, STATUS_LABELS,
} from "./lib/contract";
import {
  connectWallet, getChainId, switchNetwork, makeWalletClient, getProvider,
} from "./lib/wallet";
import { decodeError } from "./lib/errors";
import { newCorrelationId, sendLog } from "./lib/telemetry";
import { toPaymentId, validateAmount, reasonToBytes32, fileKeccak, short } from "./lib/ids";

const ACCESS_ERRORS = new Set([
  "AccessControlUnauthorizedAccount", "NotPaymentInitiator", "SelfSettlementForbidden",
]);

type Stage = "idle" | "simulating" | "signing" | "sending" | "confirming" | "success" | "error";
const STAGE_FLOW: Stage[] = ["simulating", "signing", "sending", "confirming", "success"];
const STAGE_LABEL: Record<Stage, string> = {
  idle: "—",
  simulating: "Simulating (catch error early)",
  signing: "Awaiting signature",
  sending: "Sending",
  confirming: "Awaiting confirmation",
  success: "Success",
  error: "Error",
};

interface TxState {
  stage: Stage; op: string;
  txHash?: Hex; blockNumber?: string; gasUsed?: string;
  errorName?: string; message?: string; reverted?: boolean;
}
interface EventRow {
  key: string; eventName: string; blockNumber: bigint; logIndex: number;
  txHash: Hex; paymentId?: string; summary: string;
}

export function App() {
  const [dep, setDep] = useState<Deployment | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [bytecodeOk, setBytecodeOk] = useState<boolean | null>(null);

  const [account, setAccount] = useState<Hex | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [role, setRole] = useState<string>("—");
  const [total, setTotal] = useState<bigint | null>(null);

  const [tx, setTx] = useState<TxState>({ stage: "idle", op: "" });
  const eventsRef = useRef<Map<string, EventRow>>(new Map());
  const [, setEventsVersion] = useState(0);

  const wrongNetwork = chainId !== null && chainId !== CHAIN_ID;
  const abi = dep?.abi as Abi | undefined;

  // ---------- bootstrap ----------
  useEffect(() => {
    loadDeployment()
      .then(async (d) => {
        setDep(d);
        const code = await publicClient.getBytecode({ address: d.address });
        setBytecodeOk(!!code && code !== "0x");
      })
      .catch((e) => setDepError(String(e.message ?? e)));
  }, []);

  // ---------- wallet events ----------
  useEffect(() => {
    const p = getProvider();
    if (!p) return;
    const onAccounts = (accs: string[]) => {
      setAccount((accs[0] as Hex) ?? null);
    };
    const onChain = (hex: string) => setChainId(parseInt(hex, 16));
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => {
      p.removeListener("accountsChanged", onAccounts);
      p.removeListener("chainChanged", onChain);
    };
  }, []);

  // ---------- role + total on account/dep change ----------
  const refreshAccountInfo = useCallback(async () => {
    if (!dep || !account) { setRole("—"); return; }
    try {
      const [isAdmin, isOp, isSet] = await Promise.all([
        publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "hasRole", args: [DEFAULT_ADMIN_ROLE, account] }),
        publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "hasRole", args: [OPERATOR_ROLE, account] }),
        publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "hasRole", args: [SETTLEMENT_ROLE, account] }),
      ]);
      const parts: string[] = [];
      if (isAdmin) parts.push("Administrator");
      if (isOp) parts.push("Operator");
      if (isSet) parts.push("Settlement");
      setRole(parts.length ? parts.join(" + ") : "No role");
    } catch { setRole("—"); }
  }, [dep, account]);

  const refreshTotal = useCallback(async () => {
    if (!dep) return;
    const t = await publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "totalRegistered" });
    setTotal(t as bigint);
  }, [dep]);

  useEffect(() => { refreshAccountInfo(); }, [refreshAccountInfo]);
  useEffect(() => { refreshTotal(); }, [refreshTotal]);

  // ---------- event feed (dedup by txHash-logIndex; StrictMode-safe) ----------
  const pushEvent = useCallback((row: EventRow) => {
    if (eventsRef.current.has(row.key)) return;
    eventsRef.current.set(row.key, row);
    setEventsVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!dep) return;
    let cancelled = false;
    const mkRow = (log: any): EventRow => {
      const name = log.eventName as string;
      const a = log.args as Record<string, any>;
      let summary = "";
      if (name === "PaymentRegistered") {
        summary = `Registered • amount ${a.amount} • operator ${short(a.operator)}`;
      } else {
        summary = `Status ${STATUS_LABELS[Number(a.from)]} → ${STATUS_LABELS[Number(a.to)]} • actor ${short(a.actor)}`;
      }
      return {
        key: `${log.transactionHash}-${log.logIndex}`,
        eventName: name,
        blockNumber: log.blockNumber as bigint,
        logIndex: Number(log.logIndex),
        txHash: log.transactionHash as Hex,
        paymentId: a.paymentId as string,
        summary,
      };
    };

    // initial load via getLogs
    (async () => {
      for (const eventName of ["PaymentRegistered", "PaymentStatusChanged"] as const) {
        const logs = await publicClient.getContractEvents({
          address: dep.address, abi: dep.abi, eventName, fromBlock: 0n, toBlock: "latest",
        });
        if (cancelled) return;
        logs.forEach((l) => pushEvent(mkRow(l)));
      }
    })();

    // live subscription
    const unwatchers = (["PaymentRegistered", "PaymentStatusChanged"] as const).map((eventName) =>
      publicClient.watchContractEvent({
        address: dep.address, abi: dep.abi, eventName,
        onLogs: (logs) => logs.forEach((l) => pushEvent(mkRow(l))),
      }),
    );
    return () => { cancelled = true; unwatchers.forEach((u) => u()); };
  }, [dep, pushEvent]);

  // ---------- connect / end session ----------
  async function onConnect() {
    const accs = await connectWallet();
    setAccount((accs[0] as Hex) ?? null);
    setChainId(await getChainId());
  }
  function onEndSession() {
    // Reset app state only — we do not try to "disconnect" MetaMask itself.
    setAccount(null); setRole("—"); setTx({ stage: "idle", op: "" });
  }

  // ---------- generic write with the 5-stage machine ----------
  async function runWrite(op: string, functionName: string, args: unknown[]) {
    if (!dep || !account) return;
    if (wrongNetwork) { setTx({ stage: "error", op, errorName: "WrongNetwork", message: "Wrong network — switch to chainId 31337" }); return; }
    const correlationId = newCorrelationId();
    setTx({ stage: "simulating", op });
    try {
      const { request } = await publicClient.simulateContract({
        address: dep.address, abi: dep.abi, functionName, args, account,
      });
      setTx({ stage: "signing", op });
      const wallet = makeWalletClient(account);
      const hash = await wallet.writeContract(request as any);
      setTx({ stage: "sending", op, txHash: hash });
      setTx({ stage: "confirming", op, txHash: hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const reverted = receipt.status === "reverted";
      setTx({
        stage: reverted ? "error" : "success", op, txHash: hash,
        blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(),
        reverted, message: reverted ? "Транзакция откатилась (receipt.status = reverted)" : undefined,
      });
      await sendLog({ correlationId, actor: account, txHash: hash, blockNumber: receipt.blockNumber.toString(), outcome: reverted ? "reverted" : "success" });
      await Promise.all([refreshTotal(), refreshAccountInfo()]);
    } catch (err) {
      const d = decodeError(err);
      setTx({ stage: "error", op, errorName: d.errorName, message: d.message });
      await sendLog({
        correlationId, actor: account, outcome: "reverted", errorName: d.errorName,
        severity: ACCESS_ERRORS.has(d.errorName) ? "high" : "info",
      });
    }
  }

  // ---------- negative scenario ----------
  const [negResult, setNegResult] = useState<{ before?: string; after?: string; errorName?: string; message?: string } | null>(null);
  async function runNegative() {
    if (!dep || !account) return;
    const correlationId = newCorrelationId();
    const before = (await publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "totalRegistered" })) as bigint;
    try {
      await publicClient.simulateContract({
        address: dep.address, abi: dep.abi, functionName: "registerPayment",
        args: [toPaymentId("neg-" + Date.now()), toPaymentId("neg-doc"), 1n], account,
      });
      setNegResult({ before: before.toString(), after: before.toString(), message: "Unexpected success — this account has the OPERATOR role" });
    } catch (err) {
      const d = decodeError(err);
      const after = (await publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "totalRegistered" })) as bigint;
      setNegResult({ before: before.toString(), after: after.toString(), errorName: d.errorName, message: d.message });
      await sendLog({ correlationId, actor: account, outcome: "reverted", errorName: d.errorName, severity: ACCESS_ERRORS.has(d.errorName) ? "high" : "info" });
    }
  }

  // ---------- reads ----------
  const [getId, setGetId] = useState("PR5-OP-2026-000001");
  const [getResult, setGetResult] = useState<string | null>(null);
  async function doGetPayment() {
    if (!dep) return;
    const p = await publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "getPayment", args: [toPaymentId(getId)] });
    const o = p as any;
    setGetResult(`status=${STATUS_LABELS[Number(o.status)]} • amount=${o.amount} • docHash=${o.docHash.slice(0, 14)}… • registeredBy=${short(o.registeredBy)} • settledBy=${short(o.settledBy)}`);
  }

  const [verifyId, setVerifyId] = useState("PR5-OP-2026-000001");
  const [verifyHash, setVerifyHash] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !dep) return;
    const h = await fileKeccak(f);
    setVerifyHash(h);
    const ok = await publicClient.readContract({ address: dep.address, abi: dep.abi, functionName: "verifyDocument", args: [toPaymentId(verifyId), h] });
    setVerifyResult(ok ? "match (document not tampered)" : "NO match");
  }

  // ---------- write forms ----------
  const [regId, setRegId] = useState("PR5-OP-2026-000010");
  const [regAmount, setRegAmount] = useState("1000000");
  const [regFileHash, setRegFileHash] = useState<Hex | null>(null);
  async function onRegFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setRegFileHash(await fileKeccak(f));
  }
  const [actId, setActId] = useState("PR5-OP-2026-000003");
  const [rejReason, setRejReason] = useState("AC04");

  const sortedEvents = [...eventsRef.current.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
  );

  // ---------- render ----------
  const stageIndex = STAGE_FLOW.indexOf(tx.stage);

  return (
    <div className="wrap">
      <header>
        <h1>PR5 — Interbank Payment Order Registry</h1>
        <p className="sub">dApp (Vite + React + viem v2) • local Hardhat network chainId {CHAIN_ID}</p>
      </header>

      {depError && <div className="banner err">Contract not found: {depError}. Run <code>npm run deploy:local</code>.</div>}
      {bytecodeOk === false && <div className="banner err">No bytecode at the contract address — check deployment and address.</div>}
      {wrongNetwork && (
        <div className="banner warn">
          Wrong network (chainId {chainId}). Write operations are blocked.
          <button onClick={switchNetwork}>Switch network</button>
        </div>
      )}

      <section className="card">
        <h2>Wallet session</h2>
        {!account ? (
          <button className="primary" onClick={onConnect}>Connect wallet</button>
        ) : (
          <div className="grid2">
            <div>
              <div className="kv"><span>Address</span><b title={account}>{short(account)}</b></div>
              <div className="kv"><span>Network</span><b>{chainId === CHAIN_ID ? "Hardhat Local" : "unknown"} ({chainId})</b></div>
              <div className="kv"><span>Role (per contract)</span><b>{role}</b></div>
              <div className="kv"><span>totalRegistered</span><b>{total?.toString() ?? "…"}</b></div>
            </div>
            <div className="col-right">
              <button onClick={onEndSession}>End session</button>
              <p className="note">The role shown in the UI is informational only; permissions are enforced by the smart contract (<code>onlyRole</code> by <code>msg.sender</code>).</p>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Transaction state machine {tx.op && <span className="op">· {tx.op}</span>}</h2>
        <div className="stepper">
          {STAGE_FLOW.map((s, i) => (
            <div key={s} className={"step " + (tx.stage === "error" && i >= stageIndex ? "" : i <= stageIndex && stageIndex >= 0 ? "done" : "") + (tx.stage === s ? " active" : "")}>
              {STAGE_LABEL[s]}
            </div>
          ))}
          {tx.stage === "error" && <div className="step err active">Error</div>}
        </div>
        {tx.txHash && <div className="kv"><span>txHash</span><b className="mono" title={tx.txHash}>{short(tx.txHash)}</b></div>}
        {tx.blockNumber && <div className="kv"><span>blockNumber</span><b>{tx.blockNumber}</b></div>}
        {tx.gasUsed && <div className="kv"><span>gasUsed</span><b>{tx.gasUsed}</b></div>}
        {tx.errorName && <div className="errline">⛔ {tx.errorName}: {tx.message}</div>}
        {tx.reverted && <div className="errline">⛔ Revert detected via receipt.status === "reverted", not by the presence of a hash.</div>}
      </section>

      <div className="columns">
        <section className="card">
          <h2>Read operations</h2>
          <label>paymentId (string or 0x…32 bytes)</label>
          <input value={getId} onChange={(e) => setGetId(e.target.value)} />
          <button onClick={doGetPayment}>getPayment</button>
          {getResult && <pre>{getResult}</pre>}
          <hr />
          <label>verifyDocument — paymentId</label>
          <input value={verifyId} onChange={(e) => setVerifyId(e.target.value)} />
          <label>XML document (hash is computed in the browser)</label>
          <input type="file" accept=".xml" onChange={onFile} />
          {verifyHash && <pre>keccak256(file) = {verifyHash.slice(0, 20)}…</pre>}
          {verifyResult && <div className={verifyResult.startsWith("match") ? "ok" : "errline"}>{verifyResult}</div>}
        </section>

        <section className="card">
          <h2>Write operations</h2>
          <fieldset disabled={!account || wrongNetwork}>
            <b>registerPayment (OPERATOR)</b>
            <input placeholder="paymentId" value={regId} onChange={(e) => setRegId(e.target.value)} />
            <input placeholder="amount (tiyn)" value={regAmount} onChange={(e) => setRegAmount(e.target.value)} />
            <input type="file" accept=".xml" onChange={onRegFile} />
            <button onClick={() => {
              const a = validateAmount(regAmount);
              if (!a.ok) { setTx({ stage: "error", op: "registerPayment", errorName: "Validation", message: a.error }); return; }
              if (!regFileHash) { setTx({ stage: "error", op: "registerPayment", errorName: "Validation", message: "Upload an XML file for docHash" }); return; }
              runWrite("registerPayment", "registerPayment", [toPaymentId(regId), regFileHash, a.value]);
            }}>Submit</button>
            <hr />
            <b>markExecuted / cancelPayment / markRejected</b>
            <input placeholder="paymentId" value={actId} onChange={(e) => setActId(e.target.value)} />
            <div className="row">
              <button onClick={() => runWrite("markExecuted", "markExecuted", [toPaymentId(actId)])}>markExecuted (SETTLEMENT)</button>
              <button onClick={() => runWrite("cancelPayment", "cancelPayment", [toPaymentId(actId)])}>cancelPayment (OPERATOR)</button>
            </div>
            <div className="row">
              <input placeholder="reasonCode" value={rejReason} onChange={(e) => setRejReason(e.target.value)} />
              <button onClick={() => {
                const r = reasonToBytes32(rejReason);
                if (!r.ok) { setTx({ stage: "error", op: "markRejected", errorName: "Validation", message: r.error }); return; }
                runWrite("markRejected", "markRejected", [toPaymentId(actId), r.value]);
              }}>markRejected (SETTLEMENT)</button>
            </div>
          </fieldset>
        </section>
      </div>

      <section className="card neg">
        <h2>Negative scenario — privileged operation without permission</h2>
        <p>The current account calls <code>registerPayment</code>. Without the OPERATOR role the simulation reverts with a decoded error and the registry state does not change.</p>
        <button className="danger" disabled={!account} onClick={runNegative}>Run the attempt</button>
        {negResult && (
          <div className="negbox">
            <div className="kv"><span>totalRegistered before</span><b>{negResult.before}</b></div>
            <div className="kv"><span>totalRegistered after</span><b>{negResult.after}</b></div>
            {negResult.errorName && <div className="errline">⛔ {negResult.errorName}: {negResult.message}</div>}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Event feed ({sortedEvents.length}) — de-duplicated, sorted by block descending</h2>
        <table>
          <thead><tr><th>Block</th><th>Event</th><th>Description</th><th>txHash</th></tr></thead>
          <tbody>
            {sortedEvents.map((e) => (
              <tr key={e.key}>
                <td>{e.blockNumber.toString()}</td>
                <td><span className={"tag " + (e.eventName === "PaymentRegistered" ? "t-reg" : "t-st")}>{e.eventName}</span></td>
                <td>{e.summary}</td>
                <td className="mono" title={e.txHash}>{short(e.txHash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer>Demo data only (synthetic XML with no real names/IIN/IBAN). No private keys in the client; only hashes and identifiers are written to the console/telemetry.</footer>
    </div>
  );
}
