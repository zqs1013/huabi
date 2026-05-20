# 工具栏图标

当前图标由 `scripts/build-icons.js` 从 [IconPark](https://iconpark.oceanengine.com/) 线型图标生成（与 [iconfont.cn](https://www.iconfont.cn) 上「IconPark / 编辑工具」类图标同源，可搜同名替换）。

## 使用 iconfont 集合 cid=12647

1. 打开你的图标集：<https://www.iconfont.cn/collections/detail?cid=12647>
2. 为每个工具下载 **SVG**，命名为下表左侧文件名，覆盖本目录对应文件。
3. 在项目根目录执行：`node scripts/build-icons.js`（若仅改 SVG、不改 JS 源，可直接编辑 `content/icons.generated.js` 中对应项）
4. 重新加载扩展

| 文件名 | 工具 |
|--------|------|
| `modePointer.svg` | 鼠标/模式切换 |
| `pen.svg` | 画笔 |
| `highlighter.svg` | 荧光笔 |
| `line.svg` | 直线 |
| `rect.svg` | 矩形 |
| `table.svg` | 表格 |
| `axes.svg` | 坐标系 |
| `text.svg` | 文字 |
| `eraser.svg` | 橡皮 |
| `undo.svg` / `redo.svg` | 撤销 / 恢复 |
| `clear.svg` | 清空 |
| `eye.svg` / `eyeOff.svg` | 显示/隐藏笔记 |
| `save.svg` | 导出 |
| `settings.svg` | 设置 |
| `close.svg` | 关闭 |
| `drag.svg` | 拖动工具栏 |

SVG 建议使用 `stroke="currentColor"`、`fill="none"`，以便随工具栏主题变色。

## 授权

请遵守 iconfont 上各图标作者及 IconPark 的开源协议（多为可免费商用，以页面标注为准）。
