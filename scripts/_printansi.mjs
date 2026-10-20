// Prints a previously captured ANSI transcript to the console (colors render via
// Node's VT support on Windows). Used only to display saved task output in a
// terminal window for screenshots.
import { readFileSync } from "node:fs";
process.stdout.write(readFileSync(process.argv[2]));
process.stdout.write("\n");
