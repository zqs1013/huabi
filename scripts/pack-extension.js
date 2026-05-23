/**
 * 打包 Chrome 扩展发布 zip（不含 content/fonts 下的字体二进制文件）
 * 用法: node scripts/pack-extension.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cursor",
  "dist",
  "scripts",
]);

const SKIP_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "package.json",
  "package-lock.json",
  ".gitignore",
  ".editorconfig",
]);

function shouldSkip(relPath) {
  const parts = relPath.split(/[/\\]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const base = parts[parts.length - 1];
  if (SKIP_FILES.has(base)) return true;
  if (parts[0] === "content" && parts[1] === "fonts") {
    const ext = path.extname(base).toLowerCase();
    if (FONT_EXT.has(ext)) return true;
  }
  return false;
}

function copyTree(srcDir, destDir, relBase = "") {
  for (const name of fs.readdirSync(srcDir)) {
    const rel = relBase ? `${relBase}/${name}` : name;
    if (shouldSkip(rel)) continue;
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyTree(src, dest, rel);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

/** 发布包内使用空字体索引（用户可自行添加字体文件） */
function writeEmptyFontArtifacts(stageDir) {
  const fontsDir = path.join(stageDir, "content", "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(
    path.join(fontsDir, "manifest.json"),
    "[]\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(fontsDir, "bundle-index.json"),
    JSON.stringify(
      {
        files: [],
        updatedAt: Date.now(),
        note: "发布包不含字体文件，可将 .ttf 放入本目录后重新加载扩展",
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(stageDir, "content", "fonts.registry.generated.js"),
    `/* 发布包不含自定义字体。将字体放入 content/fonts 后重新加载扩展 */
window.__HUABI_BUNDLED_FONTS = [];
`,
    "utf8"
  );
}

function main() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8")
  );
  const version = manifest.version || "0.0.0";
  const outName = `huabi-${version}`;
  const distDir = path.join(ROOT, "dist");
  const stageDir = path.join(distDir, outName);
  const zipPath = path.join(distDir, `${outName}.zip`);

  if (fs.existsSync(stageDir)) {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stageDir, { recursive: true });

  copyTree(ROOT, stageDir);
  writeEmptyFontArtifacts(stageDir);

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${stageDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit", cwd: ROOT }
  );

  const zipStat = fs.statSync(zipPath);
  console.log(`[pack] ${zipPath} (${(zipStat.size / 1024).toFixed(1)} KB)`);
  console.log(`[pack] 解压目录: ${stageDir}`);
}

main();
