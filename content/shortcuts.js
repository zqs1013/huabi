(function () {
  const MOD_ORDER = ["Control", "Alt", "Shift", "Meta"];

  function normalizeFromEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Control");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    const code = e.code;
    if (
      code &&
      !code.startsWith("Control") &&
      !code.startsWith("Alt") &&
      !code.startsWith("Shift") &&
      !code.startsWith("Meta")
    ) {
      parts.push(code);
    }
    return parts.join("+");
  }

  function parseShortcut(str) {
    if (!str) return [];
    return str.split("+").filter(Boolean);
  }

  function matchShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    return normalizeFromEvent(e) === shortcutStr;
  }

  function formatShortcutDisplay(str) {
    if (!str) return "未设置";
    return str
      .replace(/Control/g, "Ctrl")
      .replace(/Digit/g, "")
      .replace(/Key/g, "")
      .replace(/Space/g, "空格")
      .replace(/Shift\+/g, "Shift+");
  }

  function findConflict(shortcuts, actionId, shortcutStr) {
    if (!shortcutStr) return null;
    for (const [id, combo] of Object.entries(shortcuts)) {
      if (id !== actionId && combo && combo === shortcutStr) return id;
    }
    return null;
  }

  /** 浏览器在页面收到 keydown 之前就会处理的组合，content script 无法拦截 */
  const BROWSER_RESERVED_EXACT = new Set([
    "Control+KeyT",
    "Control+KeyN",
    "Control+KeyW",
    "Control+Shift+KeyT",
    "Control+KeyL",
    "Control+KeyR",
    "Control+Shift+KeyR",
    "Control+KeyP",
    "Control+KeyH",
    "Control+KeyD",
    "Control+KeyJ",
    "Control+KeyG",
    "Control+KeyU",
    "Control+KeyB",
    "Control+KeyO",
    "Control+Shift+KeyN",
    "Control+Shift+KeyW",
    "Control+Shift+KeyI",
    "Control+Shift+KeyJ",
    "Control+Shift+KeyDelete",
    "Meta+KeyT",
    "Meta+KeyN",
    "Meta+KeyW",
    "Meta+Shift+KeyT",
    "Meta+KeyL",
    "Meta+KeyR",
    "Meta+Shift+KeyR",
    "Meta+KeyP",
    "Meta+KeyH",
    "Meta+KeyD",
    "Meta+KeyQ",
    "Meta+KeyS",
    "Alt+KeyLeft",
    "Alt+KeyRight",
    "Alt+Home",
    "Alt+F4",
    "F5",
    "F11",
    "F12",
  ]);

  function getBrowserReservedMessage(shortcutStr) {
    if (!shortcutStr) return null;
    if (BROWSER_RESERVED_EXACT.has(shortcutStr)) {
      return "该组合由浏览器占用，无法在网页标注中使用";
    }
    const parts = shortcutStr.split("+");
    const key = parts[parts.length - 1];
    const hasCtrl = parts.includes("Control");
    const hasMeta = parts.includes("Meta");
    const hasAlt = parts.includes("Alt");

    if ((hasCtrl || hasMeta) && /^Digit[1-9]$/.test(key)) {
      return "Ctrl+数字键用于切换浏览器标签页，无法在网页中使用（可改用 Alt+数字，如 Alt+1）";
    }
    if ((hasCtrl || hasMeta) && key === "Digit0") {
      return "Ctrl+0 由浏览器占用，无法在网页中使用";
    }
    if ((hasCtrl || hasMeta) && /^Numpad[0-9]$/.test(key)) {
      return "Ctrl+小键盘数字由浏览器占用，无法在网页中使用";
    }
    if (hasAlt && /^Digit[0-9]$/.test(key)) {
      return "Alt+数字键可能被浏览器菜单占用，建议改用 Alt+字母（如 Alt+M）";
    }
    if ((hasCtrl || hasMeta) && key === "Tab") {
      return "Ctrl+Tab 用于切换标签页，无法在网页中使用";
    }
    return null;
  }

  function isBrowserReserved(shortcutStr) {
    return getBrowserReservedMessage(shortcutStr) != null;
  }

  function sanitizeShortcuts(shortcuts, defaults) {
    const out = { ...defaults, ...shortcuts };
    for (const id of Object.keys(out)) {
      if (out[id] && isBrowserReserved(out[id])) {
        out[id] = defaults[id] != null ? defaults[id] : "";
      }
    }
    return out;
  }

  window.HuabiShortcuts = {
    normalizeFromEvent,
    parseShortcut,
    matchShortcut,
    formatShortcutDisplay,
    findConflict,
    isBrowserReserved,
    getBrowserReservedMessage,
    sanitizeShortcuts,
    MOD_ORDER,
  };
})();
