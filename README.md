# 晨曦画笔（huabi）

在任意网页上叠加透明画布，支持画笔、荧光笔、直线、矩形、表格、坐标系、文字等标注工具。

详细说明见 [docs/用户指南.md](docs/用户指南.md)。

## 安装（开发者）

1. 克隆或解压本项目，在项目根目录执行 `npm install`（会扫描 `content/fonts` 生成索引）。
2. 打开 `chrome://extensions`，开启「开发者模式」，加载已解压的扩展（选择含 `manifest.json` 的目录）。
3. 若增删 `content/fonts` 内字体文件，执行 `npm run fonts` 后 **重新加载扩展**。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run fonts` | 扫描字体目录，更新 `manifest.json` / `fonts.registry.generated.js` |
| `npm run fonts:watch` | 监听字体目录自动更新索引 |
| `npm run icons` | 从 SVG 生成扩展图标 PNG |
| `npm run icons:toolbar` | 从 `content/iconfont` 生成工具栏内联图标 JS |
| `npm run pack` | 打包发布 zip 到 `dist/`（**不含**自定义字体文件） |

## 目录结构

```
background/     Service Worker（快捷键、字体读取备用）
content/        内容脚本、画布、设置、字体
options/        扩展选项页（完整设置）
popup/          可选弹窗 UI（未挂到 manifest 时，点击图标由后台直接开关标注）
icons/          扩展图标
scripts/        构建脚本
docs/           用户文档
```

## 自定义字体

将 `.ttf` / `.otf` / `.woff` / `.woff2` 放入 `content/fonts/`，运行 `npm run fonts` 并在扩展管理页重新加载。详见 `content/fonts/README.md`。
