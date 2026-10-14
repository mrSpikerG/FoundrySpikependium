// Упаковка модуля для установки: dist/spikependium/ и dist/spikependium.zip (только файлы, нужные Foundry).
// Запуск: npm run package (после npm run build)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "spikependium");
const ZIP = path.join(DIST, "spikependium.zip");

const INCLUDE = ["module.json", "README.md", "docs/MODULE_GUIDE.md", "docs/AU_COVERAGE.md", "docs/CONTENT_STATUS.md", "scripts", "lang", "styles", "babele", "packs"];
const SKIP = new Set(["_source", "LOCK", "LOG", "LOG.old"]);

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(ZIP, { force: true });
fs.mkdirSync(OUT, { recursive: true });

function copy(src, dest) {
  const stat = fs.statSync(src);
  if ( stat.isDirectory() ) {
    fs.mkdirSync(dest, { recursive: true });
    for ( const entry of fs.readdirSync(src) ) {
      if ( SKIP.has(entry) ) continue;
      copy(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
for ( const item of INCLUDE ) copy(path.join(ROOT, item), path.join(OUT, item));

// Архив: на Windows — встроенным tar.exe (bsdtar пишет пути через «/», в отличие от Compress-Archive,
// чей zip неправильно распаковывается на Linux), иначе — через zip.
if ( process.platform === "win32" ) {
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tar, ["-a", "-c", "-f", ZIP, "spikependium"], { cwd: DIST, stdio: "inherit" });
} else {
  execFileSync("zip", ["-qr", ZIP, "spikependium"], { cwd: DIST, stdio: "inherit" });
}
console.log(`Готово:\n  ${OUT}\n  ${ZIP}`);
