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

  const TEXT_FONT_FAMILY = "HuabiHandwriting";
  const TEXT_FONT_CSS = `"${TEXT_FONT_FAMILY}", "寒蝉手拙体", "HCSZT", cursive`;
  const TEXT_FONT_FILE = "content/fonts/寒蝉手拙体.ttf";

  function getTextFontCss() {
    return TEXT_FONT_CSS;
  }

  function injectTextFontFace() {
    if (injectTextFontFace._done) return;
    const id = "huabi-text-font-face";
    if (document.getElementById(id)) {
      injectTextFontFace._done = true;
      return;
    }
    const url = chrome.runtime.getURL(TEXT_FONT_FILE);
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@font-face{font-family:"${TEXT_FONT_FAMILY}";font-style:normal;font-weight:400;font-display:swap;src:url("${url}") format("truetype");}`;
    (document.head || document.documentElement).appendChild(style);
    injectTextFontFace._done = true;
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

  let _textFontReady = null;
  function ensureTextFont() {
    injectTextFontFace();
    if (_textFontReady) return _textFontReady;
    _textFontReady = document.fonts
      .load(`48px ${TEXT_FONT_FAMILY}`)
      .then(() => document.fonts.ready)
      .catch(() => {});
    return _textFontReady;
  }

  async function saveSettings(settings) {
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
    getTextFontCss,
    injectTextFontFace,
    TEXT_FONT_FAMILY,
    getPageDefaultFontSize,
    getDefaultTextFontSize,
    resolveTextFontSize,
    ensureTextFont,
  };

  try {
    if (typeof document !== "undefined" && chrome?.runtime?.getURL) {
      injectTextFontFace();
    }
  } catch {
    /* ignore */
  }
})();
