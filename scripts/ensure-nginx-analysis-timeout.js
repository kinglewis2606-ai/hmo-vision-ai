const fs = require("fs");
const { execFileSync } = require("child_process");

const configPath = "/etc/nginx/sites-enabled/hmo-vision-ai";
const upstream = "proxy_pass http://127.0.0.1:3000;";
const directives = [
  "    proxy_connect_timeout 10s;",
  "    proxy_send_timeout 300s;",
  "    proxy_read_timeout 300s;",
  "    proxy_buffering off;",
];

if (!fs.existsSync(configPath)) {
  console.log(`[nginx] ${configPath} not present; skipping VPS nginx tuning.`);
  process.exit(0);
}

const original = fs.readFileSync(configPath, "utf8");
if (!original.includes(upstream)) {
  console.log("[nginx] HMO site does not proxy to 127.0.0.1:3000; leaving it unchanged.");
  process.exit(0);
}

let updated = original;
const replacements = [
  [/^\s*proxy_connect_timeout\s+[^;]+;\s*$/gm, directives[0]],
  [/^\s*proxy_send_timeout\s+[^;]+;\s*$/gm, directives[1]],
  [/^\s*proxy_read_timeout\s+[^;]+;\s*$/gm, directives[2]],
  [/^\s*proxy_buffering\s+[^;]+;\s*$/gm, directives[3]],
];

for (const [pattern, replacement] of replacements) {
  updated = updated.replace(pattern, replacement);
}

if (!/^\s*proxy_read_timeout\s+300s;\s*$/m.test(updated)) {
  updated = updated.replace(upstream, `${upstream}\n${directives.join("\n")}`);
}

if (updated !== original) {
  fs.writeFileSync(configPath, updated, "utf8");
}

try {
  execFileSync("nginx", ["-t"], { stdio: "inherit" });
  execFileSync("systemctl", ["reload", "nginx"], { stdio: "inherit" });
  console.log("[nginx] Analysis proxy timeout is 300s and response buffering is disabled.");
} catch (error) {
  fs.writeFileSync(configPath, original, "utf8");
  console.error("[nginx] Validation/reload failed; original config restored.");
  process.exit(error.status || 1);
}
