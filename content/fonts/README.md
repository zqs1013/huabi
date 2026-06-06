# 文字工具字体（content/fonts）

将 **.ttf**、**.otf**、**.woff**、**.woff2** 放入本目录即可作为「自定义字体」使用。

## 自动扫描说明

Chrome 扩展**无法在运行时直接遍历安装目录**，因此采用「打包索引 + 重新加载」方式：

1. 把字体文件复制到本目录  
2. 在 `chrome://extensions` **重新加载**「晨曦画笔」扩展  
3. 打开 **设置 → 文字工具**，列表会自动更新（也可点 **刷新字体列表**）

安装项目依赖时会自动执行一次扫描（`npm run prepare`）。

## 开发时自动监听（推荐）

在项目根目录执行：

```bash
npm run fonts:watch
```

监听本目录变化并自动更新索引；**更新索引后仍需在 chrome://extensions 重新加载扩展**，新字体才会进入安装包。

## 生成的文件（勿手改）

| 文件 | 作用 |
|------|------|
| `fonts-manifest.json` | 字体元数据 |
| `bundle-index.json` | 文件名索引 |
| `../fonts.registry.generated.js` | 扩展启动时同步加载 |

由 `node scripts/generate-fonts-manifest.js` 自动生成。

## 显示名称

若希望下拉里显示中文名而非文件名，可在 `scripts/generate-fonts-manifest.js` 的 `FONT_LABEL_ALIASES` 中增加映射（例如 `QingSongShouXieTi1: "清松手写体"`），然后重新运行 `npm run fonts`。
