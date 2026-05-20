/**
 * 生成 content/icons.generated.js（IconPark 线型，与 iconfont 常见「设计/编辑」类图标同源）
 * 若你从 iconfont 集合 cid=12647 下载了 SVG，可覆盖 content/iconfont/*.svg 后重新运行本脚本
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

const MAP = {
  modePointer: "MoveOne",
  pen: "Pencil",
  highlighter: "HighLight",
  line: "Minus",
  rect: "Rectangle",
  table: "Table",
  axes: "ChartLine",
  text: "Text",
  eraser: "Erase",
  undo: "Undo",
  redo: "Redo",
  clear: "Delete",
  eye: "PreviewOpen",
  eyeOff: "PreviewCloseOne",
  save: "Save",
  settings: "Setting",
  close: "Close",
  drag: "Drag",
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchText(res.headers.location).then(resolve, reject);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function extractSvg(js) {
  const m = js.match(/function \(props\) \{\s*return ([\s\S]+?);\s*\}\);/);
  if (!m) return null;
  const props = {
    size: 48,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    colors: ["currentColor", "none", "none"],
    id: "hb",
  };
  let svg = eval(m[1]);
  if (typeof svg !== "string") return null;
  svg = svg
    .replace(/stroke-width="[^"]*"/g, 'stroke-width="2"')
    .replace(/fill="none" stroke="currentColor"/g, 'fill="none" stroke="currentColor"')
    .replace(/fill="currentColor"/g, 'fill="none"');
  return svg;
}

function normalizeLocalSvg(svg) {
  return svg
    .replace(/\s(width|height)="[^"]*"/gi, "")
    .replace(/stroke="(?!currentColor)[^"]*"/gi, 'stroke="currentColor"')
    .replace(/fill="(#[0-9a-fA-F]{3,8}|black)"/gi, 'fill="none"');
}

async function main() {
  const dir = path.join(__dirname, "../content/iconfont");
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [key, name] of Object.entries(MAP)) {
    const localPath = path.join(dir, `${key}.svg`);
    if (fs.existsSync(localPath)) {
      const local = fs.readFileSync(localPath, "utf8");
      if (local.includes("<svg") && !local.includes("props.size")) {
        out[key] = normalizeLocalSvg(local);
        console.log("ok", key, "(local)");
        continue;
      }
    }
    const url = `https://unpkg.com/@icon-park/svg@1.4.2/es/icons/${name}.js`;
    const js = await fetchText(url);
    const svg = extractSvg(js);
    if (!svg || !svg.includes("<svg")) {
      console.error("fail", key, name);
      process.exit(1);
    }
    out[key] = svg;
    console.log("ok", key, name);
  }
  fs.mkdirSync(dir, { recursive: true });
  const lines = ["(function () {"];
  lines.push("  /** 由 scripts/build-icons.js 生成；图源 IconPark 线型（iconfont 可搜同名替换） */");
  lines.push("  window.HuabiIconsGenerated = {");
  for (const [key, svg] of Object.entries(out)) {
    const esc = svg.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
    lines.push(`    ${key}: \`${esc}\`,`);
  }
  lines.push("  };");
  lines.push("})();");
  fs.writeFileSync(path.join(__dirname, "../content/icons.generated.js"), lines.join("\n"), "utf8");
  console.log("wrote", Object.keys(out).length, "icons");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
