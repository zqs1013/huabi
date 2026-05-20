(function () {
  const VB = "viewBox=\"-1 -1 26 26\"";
  const ST =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    modePointer: `<svg ${VB} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 3l14 9-6 1-2 7z"/></svg>`,
    pen: `<svg ${VB} ${ST}><path d="M4 20l4-1 9-9-3-3-9 9-1 4z"/><path d="M14 5l3 3"/></svg>`,
    highlighter: `<svg ${VB} ${ST}><path d="m9 11-6 6v3h3l6-6"/><path d="m18 4 3 3-9 9"/><path d="M3 21h5"/></svg>`,
    line: `<svg ${VB} ${ST}><path d="M5 19L19 5"/></svg>`,
    rect: `<svg ${VB} ${ST}><rect x="4" y="6" width="16" height="12" rx="1"/></svg>`,
    table: `<svg ${VB} ${ST}><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 11h18M9 5v14M15 5v14"/></svg>`,
    eraser: `<svg ${VB} ${ST}><path d="m7 21 10 0"/><path d="M12 21V11"/><path d="m5.5 11 9-9 5.5 5.5-9 9z"/></svg>`,
    undo: `<svg ${VB} ${ST}><path d="M9 14H4V9"/><path d="M4 9a8 8 0 0113.5 5"/></svg>`,
    redo: `<svg ${VB} ${ST}><path d="M15 14h5V9"/><path d="M20 9a8 8 0 00-13.5 5"/></svg>`,
    clear: `<svg ${VB} ${ST}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>`,
    eye: `<svg ${VB} ${ST}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg ${VB} ${ST}><path d="M3 3l18 18M10 10a3 3 0 004 4M6 6c-2 2-4 5-4 6s4 7 10 7c2 0 4-1 5-2M14 7a7 7 0 016 5"/></svg>`,
    save: `<svg ${VB} ${ST}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>`,
    settings: `<svg ${VB} ${ST}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>`,
    close: `<svg ${VB} ${ST}><path d="M18 6L6 18M6 6l12 12"/></svg>`,
    drag: `<svg ${VB} fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
  };

  function get(name) {
    return ICONS[name] || "";
  }

  function setIcon(el, name) {
    if (!el) return;
    el.innerHTML = get(name);
  }

  window.HuabiIcons = { get, setIcon, ICONS };
})();
