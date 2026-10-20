// Alert sink with de-duplication and a persistent cooldown.
//
// De-dup key = `${rule}:${actor}`. After an alert fires, further matches for the
// same key within COOLDOWN_MS are SUPPRESSED (counted, not re-notified). The
// cooldown state is persisted to monitor/state.json so a monitor restart does
// not lose it (requirement 6.2). An alert carries the number of suppressed hits.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_STATE_PATH = resolve(process.cwd(), "monitor/state.json");
const DEFAULT_ALERTS_LOG = resolve(process.cwd(), "reports/monitoring/alerts.log");

export interface Alert {
  rule: string;
  severity: "High" | "Medium";
  actor: string;
  ts: string;
  windowSeconds: number;
  count: number;
  txHashes: string[];
  lastError: string;
  message: string;
}

interface CooldownEntry {
  until: number; // epoch ms
  suppressed: number;
  firstFiredTs: string;
}
interface State {
  cooldowns: Record<string, CooldownEntry>;
}

export interface AlertSinkOptions {
  emit?: (line: string) => void;
  statePath?: string;
  alertsLogPath?: string;
}

export class AlertSink {
  private state: State;
  private readonly emit: (line: string) => void;
  private readonly statePath: string;
  private readonly alertsLogPath: string;

  constructor(opts: AlertSinkOptions = {}) {
    this.emit = opts.emit ?? ((l) => console.log(l));
    this.statePath = opts.statePath ?? DEFAULT_STATE_PATH;
    this.alertsLogPath = opts.alertsLogPath ?? DEFAULT_ALERTS_LOG;
    this.state = this.loadState();
    mkdirSync(dirname(this.alertsLogPath), { recursive: true });
  }

  private loadState(): State {
    if (existsSync(this.statePath)) {
      try {
        return JSON.parse(readFileSync(this.statePath, "utf8")) as State;
      } catch {
        /* corrupt -> reset */
      }
    }
    return { cooldowns: {} };
  }
  private saveState() {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  /** Returns true if the alert was emitted, false if suppressed by cooldown. */
  fire(alert: Alert): boolean {
    const key = `${alert.rule}:${alert.actor}`;
    const now = Date.now();
    const cd = this.state.cooldowns[key];

    if (cd && now < cd.until) {
      cd.suppressed += 1;
      this.saveState();
      return false;
    }

    const suppressed = cd ? cd.suppressed : 0;
    this.state.cooldowns[key] = {
      until: now + COOLDOWN_MS,
      suppressed: 0,
      firstFiredTs: alert.ts,
    };
    this.saveState();

    const header =
      alert.severity === "High"
        ? `\x1b[41m\x1b[1m ALERT ${alert.rule} [HIGH] \x1b[0m`
        : `\x1b[43m\x1b[30m\x1b[1m ALERT ${alert.rule} [MEDIUM] \x1b[0m`;
    const colored =
      `${header} \x1b[31mactor=${alert.actor}\x1b[0m count=${alert.count} ` +
      `in ${alert.windowSeconds}s lastError=${alert.lastError}` +
      (suppressed ? ` (suppressed since previous: ${suppressed})` : "");
    this.emit(colored);

    const record = { ...alert, suppressedSincePrevious: suppressed };
    appendFileSync(this.alertsLogPath, JSON.stringify(record) + "\n");
    return true;
  }
}
