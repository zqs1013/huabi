(function () {
  function svgUrl(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function cssFromMeta(meta) {
    return `${svgUrl(meta.svg)} ${meta.hotX} ${meta.hotY}, auto`;
  }

  /** 与 content/iconfont/pen.svg、icons.generated.js 一致 */
  const PEN_PATHS = {
    body:
      "M7.99953 31.999L35.9994 4L43.9995 11.999L15.9995 39.999L5.99951 41.999L7.99953 31.999Z",
    stroke1: "M30.9995 8.99902L38.9995 16.999",
    stroke2: "M8.99951 31.999L15.9995 38.999",
    stroke3: "M12.9995 34.999L34.9995 12.999",
  };

  /** 与 content/iconfont/highlighter.svg、icons.generated.js 一致 */
  const HIGHLIGHTER_PATHS = {
    body: "M6 44L6 25H12V17H36V25H42V44H6Z",
    cap: "M17 17V8L31 4V17",
  };

  function penMeta(color, { simple = false } = {}) {
    const fill = color || "#252423";
    const stroke = "#000000";
    const deco = simple
      ? ""
      : `<path d="${PEN_PATHS.stroke1}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${PEN_PATHS.stroke2}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${PEN_PATHS.stroke3}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <g transform="rotate(90 24 24)">
        <path d="${PEN_PATHS.body}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${deco}
      </g>
    </svg>`;
    return { svg, width: 48, height: 48, hotX: 6, hotY: 6 };
  }

  function parseHexRgb(hex) {
    const h = (hex || "#F1F900").replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const n = parseInt(full, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** 荧光笔跟随光标：圆点，颜色与透明度对齐当前笔划设置 */
  function highlighterDotMeta(color, alpha, lineWidth) {
    const diameter = Math.min(Math.max(Math.round(lineWidth || 12), 10), 64);
    const c = diameter / 2;
    const r = Math.max(c - 1, 4);
    const [R, G, B] = parseHexRgb(color);
    const a = Math.min(Math.max(Number(alpha ?? 0.4), 0), 1);
    const fill = `rgba(${R},${G},${B},${a})`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
    </svg>`;
    const hot = Math.round(c);
    return { svg, width: diameter, height: diameter, hotX: hot, hotY: hot };
  }

  function highlighterMeta(color) {
    const fill = color || "#F1F900";
    const stroke = "#000000";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
      <g transform="rotate(-90 24 24)">
        <path d="${HIGHLIGHTER_PATHS.body}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
        <path d="${HIGHLIGHTER_PATHS.cap}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`;
    return { svg, width: 48, height: 48, hotX: 6, hotY: 24 };
  }

  function brushMeta(color) {
    const fill = color || "#252423";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path fill="${fill}" stroke="#ffffff" stroke-width="1.25" stroke-linejoin="round"
        d="M5 3 L5 17.5 L9.5 13 L12.5 20.5 L14.5 19 L11.5 11.5 L18 11.5 Z"/>
    </svg>`;
    return { svg, width: 24, height: 24, hotX: 5, hotY: 3 };
  }

  function eraserMeta(diameter) {
    const size = Math.min(Math.max(Math.round(diameter), 16), 64);
    const c = size / 2;
    const r = Math.max(c - 2, 6);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
    </svg>`;
    const hot = Math.round(c);
    return { svg, width: size, height: size, hotX: hot, hotY: hot };
  }

  function pen(color) {
    return cssFromMeta(penMeta(color));
  }

  function eraser(diameter) {
    return cssFromMeta(eraserMeta(diameter));
  }

  function highlighter(color, alpha, lineWidth) {
    return cssFromMeta(highlighterDotMeta(color, alpha, lineWidth));
  }

  function brush(color) {
    return cssFromMeta(brushMeta(color));
  }

  /**
   * 软件光标层用（手写板/触控笔在 Chrome 中常不显示 CSS cursor）
   * @param {"pen"|"highlighter"|"brush"|"eraser"} kind
   */
  function getFollowerMeta(kind, options = {}) {
    const color = options.color;
    if (kind === "eraser") return eraserMeta(options.eraserSize ?? 16);
    if (kind === "pen") {
      return penMeta(color, { simple: !!options.pressureEnabled });
    }
    if (kind === "highlighter") {
      return highlighterDotMeta(
        color,
        options.highlightAlpha,
        options.lineWidth
      );
    }
    return brushMeta(color);
  }

  function dataUrlFromSvg(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  window.HuabiCursors = {
    brush,
    pen,
    eraser,
    highlighter,
    getFollowerMeta,
    dataUrlFromSvg,
  };
})();
