/**
 * 从 icons/icon.svg 生成 manifest 所需的 PNG（矢量栅格，小尺寸清晰）
 * 用法: node scripts/generate-icons.js
 */
const fs = require("fs");
const path = require("path");

async function main() {
  let Resvg;
  try {
    ({ Resvg } = require("@resvg/resvg-js"));
  } catch {
    console.error("请先安装: npm install --save-dev @resvg/resvg-js");
    process.exit(1);
  }

  const iconsDir = path.join(__dirname, "../icons");
  const outDir = iconsDir;

  const jobs = [
    { size: 16, file: "icon-16.svg" },
    { size: 48, file: "icon-48.svg" },
    { size: 128, file: "icon.svg" },
  ];

  for (const { size, file } of jobs) {
    const svg = fs.readFileSync(path.join(iconsDir, file), "utf8");
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
    });
    const png = resvg.render().asPng();
    const out = path.join(outDir, `icon${size}.png`);
    fs.writeFileSync(out, png);
    console.log("wrote", out, png.length, "bytes");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
