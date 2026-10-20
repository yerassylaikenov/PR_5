// Tiny "tee" logger: prints to the console (with colors) and writes an
// ANSI-stripped copy to a transcript file, so demo runs produce a saved log.
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ANSI = /\x1b\[[0-9;]*m/g;

export function createTee(file: string) {
  mkdirSync(dirname(file), { recursive: true });
  const stream = createWriteStream(file, { flags: "w" });
  const log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    console.log(line);
    stream.write(line.replace(ANSI, "") + "\n");
  };
  const close = () => new Promise<void>((r) => stream.end(() => r()));
  return { log, close };
}

export const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
export const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
export const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const check = green("✔");
export const cross = red("✘");
