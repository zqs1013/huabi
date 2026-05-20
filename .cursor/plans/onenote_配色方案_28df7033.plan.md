---
name: OneNote 配色方案
overview: 参考 OneNote 画笔/荧光笔的视觉与透明度，将默认色改为褐/红与黄/绿荧光笔；每支笔仅保留 3 个可保存色块 + 1 个自定义取色器，并写入 toolProfiles 持久化。
todos:
  - id: onenote-defaults
    content: settings.js：褐/红/黄/绿默认色、highlightAlpha、savedColors 结构与迁移
    status: completed
  - id: palette-3-plus-1
    content: overlay.js：移除 8 色预设，工具栏 3 保存色 + 取色器，荧光笔按 alpha 绘制
    status: completed
  - id: options-colors
    content: options 页：每工具 3 保存色编辑并持久化、RELOAD_SETTINGS
    status: completed
isProject: false
---

# OneNote 风格配色与色板精简

## 目标

在已实现的双笔/双荧光笔架构上（[`content/settings.js`](d:\zqs1013\zqs1013_work\huabi\content\settings.js)、[`content/overlay.js`](d:\zqs1013\zqs1013_work\huabi\content\overlay.js)），调整：

- 默认颜色对齐 OneNote 常见预设
- 荧光笔透明度/混合方式贴近 OneNote（半透明叠色，非实心笔）
- 工具栏色板从 **8 个全局预设** 改为 **每工具 3 个保存色 + 1 个自定义取色器**

---

## OneNote 参考参数（实现取值）

| 类型 | 槽位 | 默认色（Hex） | 渲染 |
|------|------|---------------|------|
| 画笔 1 | pen1 主色 + 保存色[0] | `#936757` 褐色 | 不透明 `source-over`，`alpha = 1` |
| 画笔 2 | pen2 主色 + 保存色[0] | `#E74856` 红（近 OneNote 红笔） | 同上 |
| 荧光笔 1 | hl1 | `#FFF100` 黄 | `globalCompositeOperation = multiply`，`highlightAlpha = 0.5` |
| 荧光笔 2 | hl2 | `#63BE7B` 绿 | 同上，`highlightAlpha = 0.45`（绿略浅，接近 OneNote 观感） |

说明：OneNote 荧光笔为宽笔触 + 半透明叠底；当前代码已用 `multiply` + rgba，只需把固定 `0.4` 改为按工具读取 `highlightAlpha`（见 [`overlay.js` L169](d:\zqs1013\zqs1013_work\huabi\content\overlay.js)）。

画笔线宽默认可保持 pen `3`、荧光笔 `12`（OneNote 荧光笔更粗，与现有 `lineWidth * 1.5` 逻辑兼容）。

---

## 数据结构变更

在 `toolProfiles` 每项增加 `savedColors`（长度固定 3）：

```javascript
pen1: {
  color: "#936757",
  lineWidth: 3,
  savedColors: ["#936757", "#E74856", "#252423"]  // 褐、红、深灰（第三色可作黑笔替代）
},
pen2: {
  color: "#E74856",
  lineWidth: 3,
  savedColors: ["#E74856", "#936757", "#252423"]
},
highlighter1: {
  color: "#FFF100",
  lineWidth: 12,
  highlightAlpha: 0.5,
  savedColors: ["#FFF100", "#FF8C00", "#FFF9C4"]
},
highlighter2: {
  color: "#63BE7B",
  lineWidth: 12,
  highlightAlpha: 0.45,
  savedColors: ["#63BE7B", "#00B050", "#C6EFCE"]
},
eraser: { lineWidth: 12 }
```

- `color`：当前正在使用的颜色（来自某保存槽或自定义取色器）
- `savedColors[0..2]`：工具栏上 3 个色块；**点击色块**切换 `color` 并高亮
- **第 4 个控件**：现有 `<input type="color">`，改色只更新 `color`，不自动覆盖 `savedColors`（用户可在选项页编辑 3 个保存色）

迁移：加载 settings 时若缺少 `savedColors`，用该工具默认表填充；旧用户 `pen1` 的 `color` 可保留，仅补全 `savedColors` 缺项。

---

## 工具栏 UI（[`overlay.js` `_buildToolbar`](d:\zqs1013\zqs1013_work\huabi\content\overlay.js)）

```text
[ …工具按钮… ] | [色1][色2][色3] [🎨取色] | 粗细 | …
```

- 删除全局常量 `PRESET_COLORS`（8 色）
- `syncToolbarFromTool()`：
  - 渲染 3 个 `.huabi-swatch`，背景为 `savedColors[i]`
  - 高亮与当前 `color` 匹配的槽位
  - 取色器 `value = color`
- 形状工具（line/rect/table）仍写入 `lastPenTool` 的 profile（含 `savedColors`）
- 橡皮擦工具栏：隐藏色板与取色器（仅线宽）

可选增强（非必须）：色块 **右键**「将当前色保存到此槽」——首版可只在 [`options/options.html`](d:\zqs1013\zqs1013_work\huabi\options\options.html) 提供每工具 3 色编辑，减少工具栏复杂度。

---

## 绘制逻辑（[`DrawingEngine.applyStrokeStyle`](d:\zqs1013\zqs1013_work\huabi\content\overlay.js)）

```javascript
if (S.isHighlighterTool(this.tool)) {
  const style = this.getActiveStyle();
  const alpha = this.getProfile(this.tool).highlightAlpha ?? 0.5;
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = this._hexToRgba(style.color, alpha);
  ctx.lineWidth = Math.max(style.lineWidth * 1.5, 12);
}
```

画笔/形状：`strokeStyle = style.color`，无透明度。

---

## 选项页扩展（[`options/options.js`](d:\zqs1013\zqs1013_work\huabi\options\options.js)）

在快捷键表格上方或下方增加 **「工具颜色」** 折叠区：

- pen1 / pen2 / hl1 / hl2 各一行：3 个 `<input type="color">` 编辑 `savedColors`
- 保存后 `chrome.storage.sync` + 向各 tab 广播 `RELOAD_SETTINGS`

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| [`content/settings.js`](d:\zqs1013\zqs1013_work\huabi\content\settings.js) | 默认色、`savedColors`、`highlightAlpha`、迁移合并 |
| [`content/overlay.js`](d:\zqs1013\zqs1013_work\huabi\content\overlay.js) | 色板 3+1、荧光笔 alpha、移除 PRESET_COLORS |
| [`content/toolbar.css`](d:\zqs1013\zqs1013_work\huabi\content\toolbar.css) | 3 色块间距；橡皮擦时 `.huabi-colors` 隐藏 |
| [`options/options.html`](d:\zqs1013\zqs1013_work\huabi\options\options.html) + `options.js` | 编辑每工具 3 保存色 |

---

## 验证

- [ ] 默认 pen1 褐、pen2 红；hl1 黄、hl2 绿，笔触观感接近 OneNote
- [ ] 荧光笔在浅色/深色网页背景上均为半透明叠色，非实心蜡笔感
- [ ] 每工具仅显示 3 色块 + 1 取色器；切换工具时色块对应该工具 `savedColors`
- [ ] 取色器改色后切换工具再回来，自定义色仍在 `color` 字段；保存色槽不被误改
- [ ] 升级旧配置不丢数据
