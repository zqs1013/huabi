/**
 * 扫描 content/fonts 下的字体，生成索引供扩展加载。
 * 用法:
 *   node scripts/generate-fonts-manifest.js        # 扫描一次
 *   node scripts/generate-fonts-manifest.js --watch # 监听目录自动更新
 */
const fs = require("fs");
const path = require("path");

const FONTS_DIR = path.join(__dirname, "..", "content", "fonts");
const MANIFEST_FILE = path.join(FONTS_DIR, "manifest.json");
const INDEX_FILE = path.join(FONTS_DIR, "bundle-index.json");
const REGISTRY_JS = path.join(__dirname, "..", "content", "fonts.registry.generated.js");
const EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

/** 文件名 → 设置里显示的中文名（未列出的用文件名） */
const FONT_LABEL_ALIASES = {
  QingSongShouXieTi1: "清松手写体",
};

function labelForBase(base) {
  return FONT_LABEL_ALIASES[base] || base;
}

function slugFamily(base) {
  const safe = base.replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_|_$/g, "");
  return `HuabiFont_${safe || "Custom"}`;
}

function fontId(base) {
  const safe = base.replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_|_$/g, "");
  return `font-${safe || "custom"}`;
}

function scanFonts() {
  if (!fs.existsSync(FONTS_DIR)) return [];
  return fs
    .readdirSync(FONTS_DIR)
    .filter((f) => EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function buildManifest(files) {
  return files.map((file) => {
    const base = path.basename(file, path.extname(file));
    const family = slugFamily(base);
    return {
      id: fontId(base),
      file,
      label: labelForBase(base),
      family,
      css: `"${family}"`,
    };
  });
}

function writeOutputs(manifest) {
  const files = manifest.map((m) => m.file);
  const jsonOpts = { encoding: "utf8" };
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), jsonOpts);
  fs.writeFileSync(
    INDEX_FILE,
    JSON.stringify({ files, updatedAt: Date.now() }, null, 2),
    jsonOpts
  );
  const registryBody = `/* 自动生成，请勿手改。运行 npm run fonts 或 npm run fonts:watch */
window.__HUABI_BUNDLED_FONTS = ${JSON.stringify(manifest, null, 2)};
`;
  fs.writeFileSync(REGISTRY_JS, registryBody, jsonOpts);
}

function run() {
  const files = scanFonts();
  const manifest = buildManifest(files);
  writeOutputs(manifest);
  console.log(`[fonts] ${manifest.length} 个字体 → manifest.json / bundle-index.json / fonts.registry.generated.js`);
  return manifest.length;
}

const watch = process.argv.includes("--watch");
if (watch) {
  run();
  console.log("[fonts] 正在监听 content/fonts …（添加/删除字体后会自动更新索引）");
  let timer = null;
  fs.watch(FONTS_DIR, { persistent: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(run, 300);
  });
} else {
  run();
}
