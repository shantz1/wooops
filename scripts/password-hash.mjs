import { hashPassword } from "../src/lib/password.ts";

// No command-line password arguments: they can leak through shell history/process listings.
async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 1026) throw new Error("Password is too long.");
    }
    return input.replace(/\r?\n$/, "");
  }
  process.stderr.write("Password (hidden): ");
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let input = "";
    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stderr.write("\n");
      if (error) reject(error); else resolve(input);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === "\u0003") { finish(new Error("Cancelled.")); return; }
        if (char === "\r" || char === "\n") { finish(); return; }
        if (char === "\u007f" || char === "\b") input = input.slice(0, -1);
        else if (char >= " " && Buffer.byteLength(input) < 1024) input += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
try { console.log(await hashPassword(await readPassword())); }
catch (error) { console.error(error.message); process.exitCode = 1; }
