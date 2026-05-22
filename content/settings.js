(function () {
  const SETTINGS_KEY = "huabi_settings";
  const LEGACY_KEY = "huabi_defaults";

  const DEFAULT_PEN_TOOL = "pen2";

  const COLOR_EDIT_TOOLS = ["pen1", "pen2", "highlighter1", "highlighter2"];

  const DEFAULT_TOOL_PROFILES = {
    pen1: {
      color: "#252423",
      lineWidth: 3,
      savedColors: ["#252423", "#E74856", "#936757"],
    },
    pen2: {
      color: "#E74856",
      lineWidth: 3,
      savedColors: ["#E74856", "#936757", "#252423"],
    },
    highlighter1: {
      color: "#F1F900",
      lineWidth: 12,
      highlightAlpha: 0.4,
      savedColors: ["#F1F900", "#F5FB33", "#E8F000"],
    },
    highlighter2: {
      color: "#00F900",
      lineWidth: 12,
      highlightAlpha: 0.4,
      savedColors: ["#00F900", "#33FF33", "#00CC00"],
    },
    eraser: { lineWidth: 16 },
  };

  const COLOR_TOOL_LABELS = {
    pen1: "画笔 1（黑）",
    pen2: "画笔 2（红）",
    highlighter1: "荧光笔 1（黄）",
    highlighter2: "荧光笔 2（绿）",
  };

  /** 工具栏小三角可调的样式（线宽/透明度等） */
  const TOOL_STYLE_LABELS = {
    pen1: "画笔 1",
    pen2: "画笔 2",
    highlighter1: "荧光笔 1",
    highlighter2: "荧光笔 2",
    line: "直线",
    rect: "矩形",
    arrowLine: "箭头直线",
    circle: "圆形",
    table: "表格",
    axes: "坐标系",
    text: "文字",
    eraser: "橡皮擦",
  };

  /** 可在设置中勾选是否在工具栏显示的形状类工具 */
  const TOOLBAR_SHAPE_TOOLS = [
    { id: "line", label: "直线", defaultVisible: true },
    { id: "rect", label: "矩形", defaultVisible: true },
    { id: "arrowLine", label: "箭头直线", defaultVisible: false },
    { id: "circle", label: "圆形", defaultVisible: false },
    { id: "table", label: "表格", defaultVisible: true },
    { id: "axes", label: "坐标系", defaultVisible: true },
    { id: "text", label: "文字", defaultVisible: true },
  ];

  function getDefaultToolbarVisible() {
    const out = {};
    for (const t of TOOLBAR_SHAPE_TOOLS) {
      out[t.id] = t.defaultVisible;
    }
    return out;
  }

  const DEFAULT_TEXT_FONT_FAMILY = "system";
  const LEGACY_TEXT_FONT_ALIASES = {
    handwriting: "font-寒蝉手拙体",
    "font-JasonHandwriting1": "font-QingSongShouXieTi1",
    "font-QingSongShouXieTi1-2": "font-QingSongShouXieTi1",
  };

  /** 内置字体（非 content/fonts 目录） */
  const BUILTIN_TEXT_FONT_OPTIONS = [
    {
      id: "system",
      label: "系统默认",
      css: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      needBundle: false,
    },
    {
      id: "yahei",
      label: "微软雅黑",
      css: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
      needBundle: false,
    },
    {
      id: "song",
      label: "宋体",
      css: '"SimSun", "Songti SC", "Noto Serif SC", serif',
      needBundle: false,
    },
    {
      id: "kai",
      label: "楷体",
      css: '"KaiTi", "STKaiti", "楷体", serif',
      needBundle: false,
    },
    {
      id: "mono",
      label: "等宽",
      css: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      needBundle: false,
    },
  ];

  let TEXT_FONT_OPTIONS = [...BUILTIN_TEXT_FONT_OPTIONS];
  let _textFontsInitPromise = null;
  const _fontFaceCache = new Map();

  function getTextFontOptions() {
    return TEXT_FONT_OPTIONS;
  }

  function normalizeBundledEntry(entry) {
    if (!entry?.file) return null;
    const base = String(entry.file).replace(/\.[^.]+$/, "");
    const family = entry.family || slugFamilyFromBase(base);
    const id = entry.id || fontIdFromBase(base);
    return {
      id,
      label: entry.label || base,
      css: entry.css || `"${family}"`,
      needBundle: true,
      file: entry.file,
      family,
    };
  }

  function slugFamilyFromBase(base) {
    const safe = base.replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_|_$/g, "");
    return `HuabiFont_${safe || "Custom"}`;
  }

  function fontIdFromBase(base) {
    const safe = base.replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_|_$/g, "");
    return `font-${safe || "custom"}`;
  }

  function mergeBundledEntries(...lists) {
    const map = new Map();
    for (const list of lists) {
      for (const raw of list || []) {
        const entry = normalizeBundledEntry(raw);
        if (entry) map.set(entry.id, entry);
      }
    }
    return [...map.values()];
  }

  function rebuildTextFontOptions(bundledEntries) {
    const bundled = (bundledEntries || []).map((entry) =>
      normalizeBundledEntry(entry)
    ).filter(Boolean);
    TEXT_FONT_OPTIONS = [...BUILTIN_TEXT_FONT_OPTIONS, ...bundled];
  }

  function invalidateTextFontsCache() {
    _textFontsInitPromise = null;
    _fontFaceCache.clear();
  }

  function bundledFontUrl(file) {
    return chrome.runtime.getURL(`content/fonts/${file}`);
  }

  function bundledFontUrlEncoded(file) {
    const encoded = String(file)
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return chrome.runtime.getURL(`content/fonts/${encoded}`);
  }

  async function fetchBundledFontBufferViaPage(file) {
    const urls = [bundledFontUrl(file), bundledFontUrlEncoded(file)];
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return res.arrayBuffer();
        lastErr = new Error(`fetch ${res.status} ${url}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("page fetch failed");
  }

  async function fetchBundledFontBufferViaBackground(file) {
    const res = await chrome.runtime.sendMessage({
      type: "FETCH_FONT_BUFFER",
      file,
    });
    if (res?.ok && res.buffer) return res.buffer;
    throw new Error(res?.error || "background fetch failed");
  }

  async function fetchBundledFontBuffer(entry) {
    if (!entry?.file) return null;
    try {
      return await fetchBundledFontBufferViaPage(entry.file);
    } catch (pageErr) {
      try {
        return await fetchBundledFontBufferViaBackground(entry.file);
      } catch (bgErr) {
        throw new Error(
          `page: ${pageErr?.message || pageErr}; background: ${bgErr?.message || bgErr}`
        );
      }
    }
  }

  async function registerBundledFontFace(entry) {
    if (!entry?.family || !entry?.file) return null;
    if (_fontFaceCache.has(entry.id)) return _fontFaceCache.get(entry.id);
    let buf;
    try {
      buf = await fetchBundledFontBuffer(entry);
    } catch (err) {
      console.warn("[huabi] 读取字体文件失败:", entry.file, err?.message || err);
      return null;
    }
    try {
      const face = new FontFace(entry.family, buf);
      const loaded = await face.load();
      document.fonts.add(loaded);
      _fontFaceCache.set(entry.id, loaded);
      return loaded;
    } catch (err) {
      console.warn("[huabi] 字体加载失败:", entry.file, err);
      return null;
    }
  }

  function injectBundledFontFaces(bundledEntries) {
    const styleId = "huabi-bundled-font-faces";
    let el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      (document.head || document.documentElement).appendChild(el);
    }
    if (!bundledEntries?.length) {
      el.textContent = "";
      return;
    }
    el.textContent = "";
  }

  async function fetchBundledFontManifest() {
    const bust = `?t=${Date.now()}`;
    const sources = await Promise.all([
      fetch(chrome.runtime.getURL("content/fonts/manifest.json" + bust))
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(chrome.runtime.getURL("content/fonts/bundle-index.json" + bust))
        .then(async (r) => {
          if (!r.ok) return [];
          const data = await r.json();
          const files = data?.files || [];
          return files.map((file) => {
            const base = file.replace(/\.[^.]+$/, "");
            const family = slugFamilyFromBase(base);
            return {
              id: fontIdFromBase(base),
              file,
              label: base,
              family,
              css: `"${family}"`,
            };
          });
        })
        .catch(() => []),
    ]);
    return mergeBundledEntries(window.__HUABI_BUNDLED_FONTS, ...sources);
  }

  function ensureTextFontsReady() {
    if (!_textFontsInitPromise) {
      _textFontsInitPromise = (async () => {
        const bundled = await fetchBundledFontManifest();
        rebuildTextFontOptions(bundled);
        injectBundledFontFaces(bundled);
      })();
    }
    return _textFontsInitPromise;
  }

  /** 重新拉取 content/fonts 索引（扩展重新加载后会读到最新列表） */
  function rescanBundledFonts() {
    invalidateTextFontsCache();
    return ensureTextFontsReady();
  }

  function migrateTextFontFamilyId(raw) {
    if (typeof raw !== "string" || !raw) return DEFAULT_TEXT_FONT_FAMILY;
    return LEGACY_TEXT_FONT_ALIASES[raw] || raw;
  }

  function isKnownTextFontId(id) {
    if (!id || typeof id !== "string") return false;
    if (BUILTIN_TEXT_FONT_OPTIONS.some((o) => o.id === id)) return true;
    if (TEXT_FONT_OPTIONS.some((o) => o.id === id)) return true;
    if (window.__HUABI_BUNDLED_FONTS?.some((f) => f.id === id)) return true;
    return id.startsWith("font-");
  }

  function normalizeTextFontFamily(raw) {
    const id = migrateTextFontFamilyId(raw);
    return isKnownTextFontId(id) ? id : DEFAULT_TEXT_FONT_FAMILY;
  }

  function inferBundledEntryFromFontId(fid) {
    const fromRegistry = window.__HUABI_BUNDLED_FONTS?.find((f) => f.id === fid);
    if (fromRegistry) return normalizeBundledEntry(fromRegistry);
    const fromOpts = TEXT_FONT_OPTIONS.find((o) => o.id === fid && o.file);
    if (fromOpts) return fromOpts;
    return null;
  }

  function getTextFontOption(id) {
    const fid = migrateTextFontFamilyId(id);
    const hit = TEXT_FONT_OPTIONS.find((o) => o.id === fid);
    if (hit) return hit;
    const bundled = window.__HUABI_BUNDLED_FONTS?.find((f) => f.id === fid);
    if (bundled) return normalizeBundledEntry(bundled);
    const inferred = inferBundledEntryFromFontId(fid);
    if (inferred) return inferred;
    return BUILTIN_TEXT_FONT_OPTIONS[0];
  }

  function getTextFontCss(settingsOrId) {
    const id =
      typeof settingsOrId === "string"
        ? settingsOrId
        : settingsOrId?.textFontFamily;
    return getTextFontOption(id).css;
  }

  /** DOM 元素 style.fontFamily（自定义字体须先 ensureTextFont） */
  function getDomFontFamily(settingsOrId) {
    const opt = getTextFontOption(
      typeof settingsOrId === "string"
        ? settingsOrId
        : settingsOrId?.textFontFamily
    );
    if (!opt.needBundle) return opt.css;
    return `"${opt.family}"`;
  }

  function syncOverlayTextFont(overlay) {
    if (!overlay?.engine) return DEFAULT_TEXT_FONT_FAMILY;
    const fid = normalizeTextFontFamily(
      overlay.settings?.textFontFamily ?? overlay.engine.textFontFamily
    );
    if (overlay.settings) overlay.settings.textFontFamily = fid;
    overlay.engine.textFontFamily = fid;
    return fid;
  }

  /** Canvas / measureText 用，确保 family 名与 @font-face 一致 */
  function getCanvasFont(fontSize, settingsOrId) {
    const opt = getTextFontOption(
      typeof settingsOrId === "string"
        ? settingsOrId
        : settingsOrId?.textFontFamily
    );
    const size = Math.max(8, Math.round(fontSize || 16));
    if (!opt.needBundle) return `${size}px ${opt.css}`;
    return `${size}px "${opt.family}"`;
  }

  /** @deprecated 使用 ensureTextFontsReady */
  function injectTextFontFace() {
    return ensureTextFontsReady();
  }

  const DEFAULT_SHORTCUTS = {
    toggleDrawMode: "Space",
    pen1: "Digit1",
    pen2: "Digit2",
    highlighter1: "Digit3",
    highlighter2: "Digit4",
    line: "KeyL",
    rect: "KeyR",
    table: "KeyT",
    axes: "KeyG",
    text: "KeyI",
    eraser: "KeyE",
    arrowLine: "",
    circle: "",
    toggleVisibility: "KeyV",
    undo: "Control+KeyZ",
    redo: "Control+Shift+KeyZ",
    clear: "",
    export: "Control+KeyS",
  };

  const TOOL_IDS = [
    "pen1",
    "pen2",
    "highlighter1",
    "highlighter2",
    "line",
    "rect",
    "arrowLine",
    "circle",
    "table",
    "axes",
    "text",
    "eraser",
  ];

  const SHORTCUT_ACTIONS = [
    { id: "toggleDrawMode", label: "切换鼠标/画笔" },
    { id: "pen1", label: "画笔 1" },
    { id: "pen2", label: "画笔 2" },
    { id: "highlighter1", label: "荧光笔 1" },
    { id: "highlighter2", label: "荧光笔 2" },
    { id: "line", label: "直线" },
    { id: "rect", label: "矩形" },
    { id: "arrowLine", label: "箭头直线" },
    { id: "circle", label: "圆形" },
    { id: "table", label: "表格" },
    { id: "axes", label: "坐标系" },
    { id: "text", label: "文字" },
    { id: "eraser", label: "橡皮擦" },
    { id: "toggleVisibility", label: "隐藏/显示笔记" },
    { id: "undo", label: "撤销" },
    { id: "redo", label: "重做" },
    { id: "clear", label: "清空" },
    { id: "export", label: "导出 PNG" },
  ];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeProfiles(base, patch) {
    const out = deepClone(base);
    if (!patch) return out;
    for (const key of Object.keys(patch)) {
      out[key] = { ...(out[key] || {}), ...(patch[key] || {}) };
    }
    return out;
  }

  function normalizeToolProfiles(profiles) {
    const out = mergeProfiles(DEFAULT_TOOL_PROFILES, profiles);
    for (const id of COLOR_EDIT_TOOLS) {
      const def = DEFAULT_TOOL_PROFILES[id];
      const p = out[id];
      if (!Array.isArray(p.savedColors) || p.savedColors.length !== 3) {
        const fallback = def.savedColors || [def.color, def.color, def.color];
        p.savedColors =
          Array.isArray(p.savedColors) && p.savedColors.length
            ? [...p.savedColors.slice(0, 3), ...fallback].slice(0, 3)
            : [...fallback];
      }
      if (!p.color) p.color = p.savedColors[0];
      if (id === "highlighter1" && p.color === "#FFF100") {
        p.color = def.color;
        if (p.savedColors[0] === "#FFF100") p.savedColors[0] = def.color;
      }
      if (id === "highlighter2" && (p.color === "#63BE7B" || p.color === "#00B050")) {
        p.color = def.color;
        if (p.savedColors[0] === "#63BE7B" || p.savedColors[0] === "#00B050") {
          p.savedColors[0] = def.color;
        }
      }
      if (def.highlightAlpha != null && p.highlightAlpha == null) {
        p.highlightAlpha = def.highlightAlpha;
      }
      if (p.lineWidth == null) p.lineWidth = def.lineWidth;
    }
    return out;
  }

  function mergeShortcuts(base, patch) {
    return { ...base, ...(patch || {}) };
  }

  const LEGACY_TOOL_SHORTCUTS = {
    pen1: "KeyP",
    pen2: "Shift+KeyP",
    highlighter1: "KeyH",
    highlighter2: "Shift+KeyH",
  };

  function migrateToolShortcuts(shortcuts) {
    if (!shortcuts) return;
    for (const [id, legacy] of Object.entries(LEGACY_TOOL_SHORTCUTS)) {
      if (shortcuts[id] === legacy) shortcuts[id] = DEFAULT_SHORTCUTS[id];
    }
  }

  function getDefaultSettings() {
    return {
      toolProfiles: deepClone(DEFAULT_TOOL_PROFILES),
      lastPenTool: DEFAULT_PEN_TOOL,
      tableRows: 3,
      tableCols: 3,
      coordTicks: 5,
      coordStart: 0,
      coordStep: 1,
      coordShowY: false,
      textFontSize: 0,
      textFontFamily: DEFAULT_TEXT_FONT_FAMILY,
      toolbarPosition: null,
      toolbarVisible: getDefaultToolbarVisible(),
      arrowEnds: "end",
      shortcuts: deepClone(DEFAULT_SHORTCUTS),
    };
  }

  function normalizeToolbarVisible(raw) {
    const def = getDefaultToolbarVisible();
    const out = { ...def };
    if (raw && typeof raw === "object") {
      for (const t of TOOLBAR_SHAPE_TOOLS) {
        if (typeof raw[t.id] === "boolean") out[t.id] = raw[t.id];
      }
    }
    return out;
  }

  function normalizeLoadedSettings(raw) {
    const settings = {
      ...getDefaultSettings(),
      ...raw,
      toolProfiles: normalizeToolProfiles(raw?.toolProfiles),
      shortcuts: (() => {
        const sc = mergeShortcuts(DEFAULT_SHORTCUTS, raw?.shortcuts);
        migrateToolShortcuts(sc);
        return window.HuabiShortcuts.sanitizeShortcuts(sc, DEFAULT_SHORTCUTS);
      })(),
      tableRows: raw?.tableRows ?? 3,
      tableCols: raw?.tableCols ?? 3,
      coordTicks: raw?.coordTicks ?? 5,
      coordShowY: raw?.coordShowY === true,
      textFontSize: raw?.textFontSize ?? 0,
      textFontFamily: normalizeTextFontFamily(raw?.textFontFamily),
    };
    const pos = raw?.toolbarPosition;
    if (
      pos &&
      Number.isFinite(pos.left) &&
      Number.isFinite(pos.top)
    ) {
      settings.toolbarPosition = {
        left: Math.round(pos.left),
        top: Math.round(pos.top),
      };
    } else {
      settings.toolbarPosition = null;
    }
    settings.toolbarVisible = normalizeToolbarVisible(raw?.toolbarVisible);
    settings.arrowEnds = raw?.arrowEnds === "both" ? "both" : "end";
    settings.lastPenTool =
      raw?.lastPenTool === "pen1" || raw?.lastPenTool === "pen2"
        ? raw.lastPenTool
        : DEFAULT_PEN_TOOL;
    const def = getDefaultSettings();
    const start = Number(raw?.coordStart);
    settings.coordStart = Number.isFinite(start) ? start : def.coordStart;
    const step = Number(raw?.coordStep);
    settings.coordStep =
      Number.isFinite(step) && step > 0 && step <= 10000 ? step : def.coordStep;
    return settings;
  }

  function isToolbarToolVisible(settings, toolId) {
    if (!TOOLBAR_SHAPE_TOOLS.some((t) => t.id === toolId)) return true;
    const vis = settings?.toolbarVisible;
    if (!vis) return true;
    return vis[toolId] !== false;
  }

  function getAllToolIds() {
    return [
      "pen1",
      "pen2",
      "highlighter1",
      "highlighter2",
      ...TOOLBAR_SHAPE_TOOLS.map((t) => t.id),
      "eraser",
    ];
  }

  function getVisibleToolbarShapeTools(settings) {
    return TOOLBAR_SHAPE_TOOLS.filter((t) => isToolbarToolVisible(settings, t.id));
  }

  async function writeSettingsToStorage(settings) {
    const payload = { [SETTINGS_KEY]: settings };
    await chrome.storage.local.set(payload);
    try {
      await chrome.storage.sync.set(payload);
    } catch {
      /* 未登录或超出 sync 配额时仍保留 local */
    }
  }

  async function loadSettings() {
    await ensureTextFontsReady();
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get([SETTINGS_KEY, LEGACY_KEY]),
      chrome.storage.local.get([SETTINGS_KEY]),
    ]);
    let settings = syncData[SETTINGS_KEY] || localData[SETTINGS_KEY];

    if (!settings) {
      settings = getDefaultSettings();
      if (syncData[LEGACY_KEY]) {
        const leg = syncData[LEGACY_KEY];
        if (leg.color) settings.toolProfiles.pen1.color = leg.color;
        if (leg.lineWidth) settings.toolProfiles.pen1.lineWidth = leg.lineWidth;
        await chrome.storage.sync.remove(LEGACY_KEY);
      }
      settings = normalizeLoadedSettings(settings);
      await writeSettingsToStorage(settings);
      return settings;
    }

    settings = normalizeLoadedSettings(settings);
    if (!syncData[SETTINGS_KEY] && localData[SETTINGS_KEY]) {
      try {
        await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
      } catch {
        /* ignore */
      }
    }
    return settings;
  }

  function getPageDefaultFontSize() {
    const fs = getComputedStyle(document.documentElement).fontSize;
    const n = parseFloat(fs);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 16;
  }

  function getDefaultTextFontSize() {
    return Math.max(8, Math.min(120, getPageDefaultFontSize() + 8));
  }

  function resolveTextFontSize(settings, engine) {
    const raw = settings?.textFontSize ?? engine?.textFontSize ?? 0;
    if (!raw || raw <= 0) return getDefaultTextFontSize();
    return Math.max(8, Math.min(120, Math.round(raw)));
  }

  async function ensureTextFont(settingsOrId) {
    const opt = getTextFontOption(
      typeof settingsOrId === "string"
        ? settingsOrId
        : settingsOrId?.textFontFamily
    );
    if (!opt.needBundle) return true;
    await ensureTextFontsReady();
    if (!_fontFaceCache.has(opt.id)) {
      const loaded = await registerBundledFontFace(opt);
      if (!loaded) return false;
    }
    try {
      await document.fonts.load(getCanvasFont(16, opt.id));
      await document.fonts.ready;
    } catch (err) {
      console.warn("[huabi] document.fonts.load 失败:", opt.file, err);
      return false;
    }
    return true;
  }

  async function ensureTextFonts(fontIds) {
    const ids = [...new Set((fontIds || []).map((id) => normalizeTextFontFamily(id)))];
    let ok = true;
    for (const id of ids) {
      if (!(await ensureTextFont(id))) ok = false;
    }
    return ok;
  }

  /** 将当前文字字体应用到画布并立即重绘 */
  async function applyTextFontToOverlay(overlay, fontId) {
    if (!overlay?.engine) return false;
    const fid = normalizeTextFontFamily(
      fontId ?? overlay.settings?.textFontFamily ?? overlay.engine.textFontFamily
    );
    if (overlay.settings) overlay.settings.textFontFamily = fid;
    overlay.engine.textFontFamily = fid;
    const ok = await ensureTextFont(fid);
    await overlay.engine.renderTexts();
    return ok;
  }

  async function saveSettings(settings) {
    await ensureTextFontsReady();
    const normalized = normalizeLoadedSettings(settings);
    await writeSettingsToStorage(normalized);
    return normalized;
  }

  function isPenTool(id) {
    return id === "pen1" || id === "pen2";
  }

  function isHighlighterTool(id) {
    return id === "highlighter1" || id === "highlighter2";
  }

  function isShapeTool(id) {
    return (
      id === "line" ||
      id === "rect" ||
      id === "arrowLine" ||
      id === "circle" ||
      id === "table" ||
      id === "axes"
    );
  }

  function isFreehandTool(id) {
    return isPenTool(id) || isHighlighterTool(id);
  }

  function isEraserTool(id) {
    return id === "eraser";
  }

  function isTextTool(id) {
    return id === "text";
  }

  function profileTargetTool(engine, tool) {
    if (isShapeTool(tool) || isTextTool(tool)) return engine.lastPenTool;
    if (tool === "eraser") return "eraser";
    return tool;
  }

  function getSavedColors(profile, toolId) {
    if (!COLOR_EDIT_TOOLS.includes(toolId)) return [];
    const def = DEFAULT_TOOL_PROFILES[toolId];
    if (profile?.savedColors && profile.savedColors.length === 3) {
      return profile.savedColors;
    }
    if (def?.savedColors && Array.isArray(def.savedColors)) {
      return [...def.savedColors];
    }
    const c = def?.color || "#000000";
    return [c, c, c];
  }

  window.HuabiSettings = {
    SETTINGS_KEY,
    DEFAULT_PEN_TOOL,
    DEFAULT_TOOL_PROFILES,
    DEFAULT_SHORTCUTS,
    COLOR_EDIT_TOOLS,
    COLOR_TOOL_LABELS,
    TOOL_STYLE_LABELS,
    TOOL_IDS,
    TOOLBAR_SHAPE_TOOLS,
    SHORTCUT_ACTIONS,
    getDefaultToolbarVisible,
    getAllToolIds,
    getVisibleToolbarShapeTools,
    isToolbarToolVisible,
    loadSettings,
    saveSettings,
    getDefaultSettings,
    normalizeToolProfiles,
    getSavedColors,
    isPenTool,
    isHighlighterTool,
    isShapeTool,
    isFreehandTool,
    isEraserTool,
    isTextTool,
    profileTargetTool,
    BUILTIN_TEXT_FONT_OPTIONS,
    getTextFontOptions,
    ensureTextFontsReady,
    rescanBundledFonts,
    invalidateTextFontsCache,
    DEFAULT_TEXT_FONT_FAMILY,
    normalizeTextFontFamily,
    migrateTextFontFamilyId,
    getTextFontOption,
    getTextFontCss,
    getDomFontFamily,
    syncOverlayTextFont,
    getCanvasFont,
    registerBundledFontFace,
    injectTextFontFace,
    injectBundledFontFaces,
    rebuildTextFontOptions,
    getPageDefaultFontSize,
    getDefaultTextFontSize,
    resolveTextFontSize,
    ensureTextFont,
    ensureTextFonts,
    applyTextFontToOverlay,
  };

  if (window.__HUABI_BUNDLED_FONTS?.length) {
    rebuildTextFontOptions(mergeBundledEntries(window.__HUABI_BUNDLED_FONTS));
  }

  try {
    if (typeof document !== "undefined" && chrome?.runtime?.getURL) {
      void ensureTextFontsReady();
    }
  } catch {
    /* ignore */
  }
})();
