(function () {
  function svgUrl(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /** 画笔模式（荧光笔/形状等）：实心箭头 */
  function brush(color) {
    const fill = color || "#252423";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path fill="${fill}" stroke="#ffffff" stroke-width="1.25" stroke-linejoin="round"
        d="M5 3 L5 17.5 L9.5 13 L12.5 20.5 L14.5 19 L11.5 11.5 L18 11.5 Z"/>
    </svg>`;
    return `${svgUrl(svg)} 5 3, auto`;
  }

  /** 选中画笔 1/2：笔尖朝左上（48px），热点在笔尖 */
  function pen(color) {
    const fill = color || "#252423";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
      <g transform="rotate(90 12 12)">
        <path fill="${fill}" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"
          d="M4 20l4-1 9-9-3-3-9 9-1 4z"/>
        <path fill="${fill}" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"
          d="M14 5l3 3"/>
      </g>
    </svg>`;
    return `${svgUrl(svg)} 8 8, auto`;
  }

  /** 选中橡皮擦：圆形白底光标（仅画布指针，不改工具栏图标） */
  function eraser(diameter) {
    const size = Math.min(Math.max(Math.round(diameter), 16), 48);
    const c = size / 2;
    const r = Math.max(c - 2, 6);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
    </svg>`;
    const hot = Math.round(c);
    return `${svgUrl(svg)} ${hot} ${hot}, auto`;
  }

  /** 选中荧光笔：笔尖朝左上（48px），热点在笔尖 */
  function highlighter(color) {
    const fill = color || "#F1F900";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
      <g transform="rotate(90 12 12)">
        <path fill="${fill}" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          d="m9 11-6 6v3h3l6-6"/>
        <path fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
          d="m18 4 3 3-9 9"/>
        <path fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round"
          d="M3 21h5"/>
      </g>
    </svg>`;
    return `${svgUrl(svg)} 6 6, auto`;
  }

  window.HuabiCursors = { brush, pen, eraser, highlighter };
})();
