(function () {
  const FALLBACK = {
    modePointer: "",
    pen: "",
    highlighter: "",
    line: "",
    arrowLine: "",
    circle: "",
    rect: "",
    table: "",
    axes: "",
    eraser: "",
    undo: "",
    redo: "",
    clear: "",
    eye: "",
    eyeOff: "",
    save: "",
    settings: "",
    close: "",
    drag: "",
  };

  const ICONS = { ...FALLBACK, ...(window.HuabiIconsGenerated || {}) };

  function get(name) {
    return ICONS[name] || "";
  }

  function setIcon(el, name) {
    if (!el) return;
    el.innerHTML = get(name);
  }

  window.HuabiIcons = { get, setIcon, ICONS };
})();
