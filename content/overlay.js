(function () {
  if (window.__huabiInitialized) return;
  window.__huabiInitialized = true;

  const S = window.HuabiSettings;
  const K = window.HuabiShortcuts;
  const I = window.HuabiIcons;
  const C = window.HuabiCursors;

  const MAX_HISTORY = 25;

  class DrawingEngine {
    constructor(mainCanvas, highlightCanvas, previewCanvas, settings) {
      this.mainCanvas = mainCanvas;
      this.highlightCanvas = highlightCanvas;
      this.previewCanvas = previewCanvas;
      const ctxOpts = { willReadFrequently: true };
      this.mainCtx = mainCanvas.getContext("2d", ctxOpts);
      this.highlightCtx = highlightCanvas.getContext("2d", ctxOpts);
      this.previewCtx = previewCanvas.getContext("2d", ctxOpts);
      this.dpr = window.devicePixelRatio || 1;
      this.toolProfiles = settings.toolProfiles;
      this.lastPenTool = settings.lastPenTool || "pen1";
      this.tool = "pen1";
      this.isDrawing = false;
      this.startX = 0;
      this.startY = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.tableRows = settings.tableRows ?? 3;
      this.tableCols = settings.tableCols ?? 3;
      this.history = [];
      this.redoStack = [];
      this._erasing = false;
      this.strokeTool = null;
      this._hlStrokeCanvas = null;
      this._hlStrokeCtx = null;
      this._hlBBox = null;
      this._hlCommitSnap = null;
    }

    _activeTool() {
      return this.strokeTool || this.tool;
    }

    applySettings(settings) {
      this.toolProfiles = settings.toolProfiles;
      this.lastPenTool = settings.lastPenTool || "pen1";
      this.tableRows = settings.tableRows ?? 3;
      this.tableCols = settings.tableCols ?? 3;
    }

    getProfile(toolId) {
      const p = this.toolProfiles[toolId];
      const def = S.DEFAULT_TOOL_PROFILES[toolId];
      const base = p ? { ...p } : def ? { ...def } : { color: "#252423", lineWidth: 3 };
      if (S.COLOR_EDIT_TOOLS.includes(toolId)) {
        base.savedColors = S.getSavedColors(p || def || {}, toolId);
      }
      return base;
    }

    setProfile(toolId, partial) {
      if (!this.toolProfiles[toolId]) this.toolProfiles[toolId] = {};
      Object.assign(this.toolProfiles[toolId], partial);
    }

    getStyleTargetTool() {
      return S.profileTargetTool(this, this.tool);
    }

    getActiveStyle() {
      const target = S.isShapeTool(this.tool) ? this.lastPenTool : this.getStyleTargetTool();
      return this.getProfile(target);
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = this.dpr;

      const mainSnap = this._captureMain();
      const hlSnap = this._captureHighlight();
      [this.highlightCanvas, this.mainCanvas, this.previewCanvas].forEach((c) => {
        const snap =
          c === this.mainCanvas
            ? mainSnap
            : c === this.highlightCanvas
              ? hlSnap
              : null;
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = w + "px";
        c.style.height = h + "px";
        const ctx = c.getContext("2d");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        if (snap) ctx.putImageData(snap, 0, 0);
      });
      this._resizeHlStrokeCanvas();
    }

    _resizeHlStrokeCanvas() {
      if (!this._hlStrokeCanvas) {
        this._hlStrokeCanvas = document.createElement("canvas");
        this._hlStrokeCtx = this._hlStrokeCanvas.getContext("2d", {
          willReadFrequently: true,
        });
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = this.dpr;
      this._hlStrokeCanvas.width = w * dpr;
      this._hlStrokeCanvas.height = h * dpr;
      const ctx = this._hlStrokeCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    _clearHlStroke() {
      if (!this._hlStrokeCtx || !this._hlStrokeCanvas) return;
      const c = this._hlStrokeCanvas;
      const ctx = this._hlStrokeCtx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(this.dpr, this.dpr);
    }

    _captureMain() {
      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;
      if (!w || !h) return null;
      try {
        return this.mainCtx.getImageData(0, 0, w, h);
      } catch {
        return null;
      }
    }

    _captureHighlight() {
      const w = this.highlightCanvas.width;
      const h = this.highlightCanvas.height;
      if (!w || !h) return null;
      try {
        return this.highlightCtx.getImageData(0, 0, w, h);
      } catch {
        return null;
      }
    }

    _restoreHistorySnap(snap) {
      if (!snap) return;
      if (snap.main && snap.highlight) {
        this.mainCtx.putImageData(snap.main, 0, 0);
        this.highlightCtx.putImageData(snap.highlight, 0, 0);
        return;
      }
      if (snap.data) this.mainCtx.putImageData(snap, 0, 0);
    }

    _captureHistorySnap() {
      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;
      return {
        main: this.mainCtx.getImageData(0, 0, w, h),
        highlight: this.highlightCtx.getImageData(0, 0, w, h),
      };
    }

    getPos(e) {
      const rect = this.mainCanvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    pushHistory() {
      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;
      if (!w || !h) return;
      try {
        const snap = this._captureHistorySnap();
        this.history.push(snap);
        if (this.history.length > MAX_HISTORY) this.history.shift();
        this.redoStack = [];
      } catch {
        /* ignore */
      }
    }

    undo() {
      if (!this.history.length) return false;
      try {
        this.redoStack.push(this._captureHistorySnap());
        const prev = this.history.pop();
        this._restoreHistorySnap(prev);
        return true;
      } catch {
        return false;
      }
    }

    redo() {
      if (!this.redoStack.length) return false;
      try {
        this.history.push(this._captureHistorySnap());
        const next = this.redoStack.pop();
        this._restoreHistorySnap(next);
        return true;
      } catch {
        return false;
      }
    }

    clear() {
      this.pushHistory();
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.mainCtx.clearRect(0, 0, w, h);
      this.highlightCtx.clearRect(0, 0, w, h);
      this.clearPreview();
    }

    clearPreview() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.previewCtx.clearRect(0, 0, w, h);
      this.previewCanvas.classList.remove("huabi-hl-preview");
    }

    _hexToRgb(hex) {
      const h = (hex || "#000000").replace("#", "");
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

    _hexToRgba(hex, alpha) {
      const [r, g, b] = this._hexToRgb(hex);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    _expandHlBBox(x, y) {
      const style = this.getActiveStyle();
      const pad = Math.max(style.lineWidth * 1.5, 12) / 2;
      if (!this._hlBBox) {
        this._hlBBox = {
          minX: x - pad,
          minY: y - pad,
          maxX: x + pad,
          maxY: y + pad,
        };
        return;
      }
      this._hlBBox.minX = Math.min(this._hlBBox.minX, x - pad);
      this._hlBBox.minY = Math.min(this._hlBBox.minY, y - pad);
      this._hlBBox.maxX = Math.max(this._hlBBox.maxX, x + pad);
      this._hlBBox.maxY = Math.max(this._hlBBox.maxY, y + pad);
    }

    applyHlStrokeStyle(ctx) {
      const style = this.getActiveStyle();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = Math.max(style.lineWidth * 1.5, 12);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    _restoreHighlightSnap() {
      if (!this._hlCommitSnap) return;
      const hlCtx = this.highlightCtx;
      hlCtx.save();
      hlCtx.setTransform(1, 0, 0, 1, 0, 0);
      hlCtx.putImageData(this._hlCommitSnap, 0, 0);
      hlCtx.restore();
      hlCtx.setTransform(1, 0, 0, 1, 0, 0);
      hlCtx.scale(this.dpr, this.dpr);
    }

    /** 绘制中实时预览：还原起笔前荧光层，再叠当前笔划（与松手后一致） */
    _refreshHlStrokeLive() {
      this._restoreHighlightSnap();
      this._compositeHlStrokeToHighlight({ clearStroke: false });
    }

    /** 荧光笔：写入 multiply 混合层，与网页正片叠底，文字保持清晰 */
    _compositeHlStrokeToHighlight(opts = {}) {
      const clearStroke = opts.clearStroke !== false;
      const tool = this.tool;
      if (!S.isHighlighterTool(tool) || !this._hlStrokeCanvas) return;
      const style = this.getActiveStyle();
      const hl = this.getProfile(tool);
      const alpha = hl.highlightAlpha ?? 0.4;
      const [r, g, b] = this._hexToRgb(style.color);
      const fa = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);

      const canvas = this.highlightCanvas;
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;

      const strokeCtx = this._hlStrokeCtx;
      let srcData;
      strokeCtx.save();
      strokeCtx.setTransform(1, 0, 0, 1, 0, 0);
      try {
        srcData = strokeCtx.getImageData(0, 0, w, h);
      } catch {
        strokeCtx.restore();
        return;
      }
      strokeCtx.restore();

      const hlCtx = this.highlightCtx;
      hlCtx.save();
      hlCtx.setTransform(1, 0, 0, 1, 0, 0);
      let hlImg;
      try {
        hlImg = hlCtx.getImageData(0, 0, w, h);
      } catch {
        hlCtx.restore();
        return;
      }

      const sd = srcData.data;
      const md = hlImg.data;
      const dpr = this.dpr;
      const pad = Math.ceil(Math.max(style.lineWidth * 1.5, 12) * dpr) + 2;

      let x0 = 0;
      let y0 = 0;
      let x1 = w - 1;
      let y1 = h - 1;
      if (this._hlBBox) {
        x0 = Math.max(0, Math.floor(this._hlBBox.minX * dpr) - pad);
        y0 = Math.max(0, Math.floor(this._hlBBox.minY * dpr) - pad);
        x1 = Math.min(w - 1, Math.ceil(this._hlBBox.maxX * dpr) + pad);
        y1 = Math.min(h - 1, Math.ceil(this._hlBBox.maxY * dpr) + pad);
      }

      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const i = (py * w + px) * 4;
          if (sd[i + 3] < 32) continue;
          md[i] = r;
          md[i + 1] = g;
          md[i + 2] = b;
          md[i + 3] = fa;
        }
      }

      hlCtx.putImageData(hlImg, 0, 0);
      hlCtx.restore();
      hlCtx.setTransform(1, 0, 0, 1, 0, 0);
      hlCtx.scale(dpr, dpr);
      if (clearStroke) this._clearHlStroke();
    }

    _eraseAtBoth(x, y) {
      this._eraseAt(this.mainCtx, x, y);
      this._eraseAt(this.highlightCtx, x, y);
    }

    _eraseLineBoth(x0, y0, x1, y1) {
      const r = this._eraserRadius();
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const step = Math.max(r * 0.35, 1);
      if (dist === 0) {
        this._eraseAtBoth(x0, y0);
        return;
      }
      for (let d = 0; d <= dist; d += step) {
        const t = dist === 0 ? 0 : d / dist;
        this._eraseAtBoth(
          x0 + (x1 - x0) * t,
          y0 + (y1 - y0) * t,
        );
      }
    }

    _eraserRadius() {
      const er = this.getProfile("eraser");
      return Math.max((er.lineWidth || 16) / 2, 8);
    }

    /** 像素级擦除（忽略 transform，与笔迹坐标一致） */
    _eraseAt(ctx, x, y) {
      const canvas = this.mainCanvas;
      const dpr = this.dpr || 1;
      const r = this._eraserRadius();
      const cx = Math.round(x * dpr);
      const cy = Math.round(y * dpr);
      const cr = Math.ceil(r * dpr);
      const x0 = Math.max(0, cx - cr);
      const y0 = Math.max(0, cy - cr);
      const x1 = Math.min(canvas.width, cx + cr);
      const y1 = Math.min(canvas.height, cy + cr);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return;

      try {
        const img = ctx.getImageData(x0, y0, w, h);
        const data = img.data;
        const lx = cx - x0;
        const ly = cy - y0;
        const r2 = cr * cr;
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const dx = i - lx;
            const dy = j - ly;
            if (dx * dx + dy * dy <= r2) {
              const idx = (j * w + i) * 4;
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = 0;
            }
          }
        }
        ctx.putImageData(img, x0, y0);
      } catch {
        const cr2 = r * dpr;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(cx, cy, cr2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _eraseLine(ctx, x0, y0, x1, y1) {
      const r = this._eraserRadius();
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const step = Math.max(r * 0.35, 1);
      if (dist === 0) {
        this._eraseAt(ctx, x0, y0);
        return;
      }
      for (let d = 0; d <= dist; d += step) {
        const t = dist === 0 ? 0 : d / dist;
        this._eraseAt(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      }
    }

    _endErase(ctx) {
      this._erasing = false;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    applyStrokeStyle(ctx) {
      const style = this.getActiveStyle();
      if (this.tool === "eraser") {
        return;
      } else if (S.isHighlighterTool(this.tool)) {
        return;
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    applyFillStrokeStyle(ctx) {
      const style = this.getActiveStyle();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    onPointerDown(e, toolId) {
      if (e.button !== 0) return;
      if (toolId) {
        this.tool = toolId;
        this.strokeTool = toolId;
      }
      const tool = this._activeTool();
      const { x, y } = this.getPos(e);
      this.isDrawing = true;
      this.startX = x;
      this.startY = y;
      this.lastX = x;
      this.lastY = y;

      if (S.isEraserTool(tool)) {
        this.pushHistory();
        this._erasing = true;
        this._eraseAtBoth(x, y);
      } else if (S.isHighlighterTool(tool)) {
        this.pushHistory();
        this._resizeHlStrokeCanvas();
        this._clearHlStroke();
        this._hlBBox = null;
        this._hlCommitSnap = this._captureHighlight();
        this._expandHlBBox(x, y);
        this.applyHlStrokeStyle(this._hlStrokeCtx);
        this._hlStrokeCtx.beginPath();
        this._hlStrokeCtx.moveTo(x, y);
      } else if (S.isFreehandTool(tool)) {
        this.pushHistory();
        this.applyStrokeStyle(this.mainCtx);
        this.mainCtx.beginPath();
        this.mainCtx.moveTo(x, y);
      } else if (S.isShapeTool(tool)) {
        this.clearPreview();
      }
    }

    onPointerMove(e) {
      if (!this.isDrawing) return;
      const tool = this._activeTool();
      const { x, y } = this.getPos(e);

      if (S.isEraserTool(tool)) {
        this._eraseLineBoth(this.lastX, this.lastY, x, y);
        this.lastX = x;
        this.lastY = y;
        return;
      }

      if (S.isHighlighterTool(tool)) {
        this._expandHlBBox(x, y);
        this.applyHlStrokeStyle(this._hlStrokeCtx);
        this._hlStrokeCtx.lineTo(x, y);
        this._hlStrokeCtx.stroke();
        this._hlStrokeCtx.beginPath();
        this._hlStrokeCtx.moveTo(x, y);
        this._refreshHlStrokeLive();
        return;
      }

      if (S.isFreehandTool(tool)) {
        this.applyStrokeStyle(this.mainCtx);
        this.mainCtx.lineTo(x, y);
        this.mainCtx.stroke();
        this.mainCtx.beginPath();
        this.mainCtx.moveTo(x, y);
        return;
      }

      this.clearPreview();
      const ctx = this.previewCtx;
      this.applyFillStrokeStyle(ctx);

      if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (tool === "rect") {
        ctx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
      } else if (tool === "table") {
        ctx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
        this._drawTableGrid(ctx, this.startX, this.startY, x, y);
      }
    }

    onPointerUp(e) {
      if (!this.isDrawing) return;
      const tool = this._activeTool();
      this.isDrawing = false;
      this.strokeTool = null;
      const { x, y } = this.getPos(e);

      if (S.isEraserTool(tool)) {
        this._eraseLineBoth(this.lastX, this.lastY, x, y);
        this._endErase(this.mainCtx);
        return;
      }

      if (S.isHighlighterTool(tool)) {
        this._expandHlBBox(x, y);
        this._restoreHighlightSnap();
        this._compositeHlStrokeToHighlight({ clearStroke: true });
        this._hlCommitSnap = null;
        this._hlBBox = null;
        return;
      }

      if (S.isFreehandTool(tool)) {
        this.mainCtx.globalCompositeOperation = "source-over";
        this.mainCtx.globalAlpha = 1;
        return;
      }

      if (tool === "line") {
        this.pushHistory();
        this.applyFillStrokeStyle(this.mainCtx);
        this.mainCtx.beginPath();
        this.mainCtx.moveTo(this.startX, this.startY);
        this.mainCtx.lineTo(x, y);
        this.mainCtx.stroke();
      } else if (tool === "rect") {
        this.pushHistory();
        this.applyFillStrokeStyle(this.mainCtx);
        this.mainCtx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
      } else if (tool === "table") {
        this.pushHistory();
        this.applyFillStrokeStyle(this.mainCtx);
        this.mainCtx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
        this._drawTableGrid(this.mainCtx, this.startX, this.startY, x, y);
      }

      this.clearPreview();
    }

    _drawTableGrid(ctx, x1, y1, x2, y2) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (width < 4 || height < 4) return;

      const cols = Math.max(1, this.tableCols);
      const rows = Math.max(1, this.tableRows);
      const colStep = width / cols;
      const rowStep = height / rows;

      ctx.beginPath();
      for (let c = 1; c < cols; c++) {
        const x = left + colStep * c;
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + height);
      }
      for (let r = 1; r < rows; r++) {
        const y = top + rowStep * r;
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y);
      }
      ctx.stroke();
    }
  }

  class HuabiOverlay {
    constructor() {
      this.active = false;
      this.brushMode = false;
      this.notesHidden = false;
      this._canvasPointerActive = false;
      this.settings = null;
      this.engine = null;
      this.root = null;
      this.canvasWrap = null;
      this.toolbar = null;
      this.toolPopover = null;
      this._popoverTool = null;
      this.settingsPanel = null;
      this._onMessage = this._onMessage.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    async init() {
      if (this.root) return;

      this.settings = await S.loadSettings();

      const root = document.createElement("div");
      root.id = "huabi-root";

      const wrap = document.createElement("div");
      wrap.className = "huabi-canvas-wrap";

      const highlight = document.createElement("canvas");
      highlight.id = "huabi-highlight";
      const main = document.createElement("canvas");
      main.id = "huabi-main";
      const preview = document.createElement("canvas");
      preview.id = "huabi-preview";

      wrap.appendChild(highlight);
      wrap.appendChild(main);
      wrap.appendChild(preview);
      root.appendChild(wrap);
      root.appendChild(this._buildToolbar());
      root.appendChild(this._buildToolPopover());
      document.documentElement.appendChild(root);

      this.root = root;
      this.canvasWrap = wrap;
      this.highlightCanvas = highlight;
      this.mainCanvas = main;
      this.previewCanvas = preview;
      this.engine = new DrawingEngine(main, highlight, preview, this.settings);
      this.toolbar = root.querySelector("#huabi-toolbar");
      this.toolPopover = root.querySelector("#huabi-tool-popover");
      this.settingsPanel = new window.HuabiSettingsPanel(root, this);

      this._bindCanvasEvents(wrap);
      this._bindToolbarDrag();
      this._bindToolCarets();
      this._updatePenButtonColors();
      this.syncToolbarFromTool();

      window.addEventListener("resize", () => {
        if (this.active) this.engine.resize();
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes[S.SETTINGS_KEY]) return;
        const next = changes[S.SETTINGS_KEY].newValue;
        if (next) {
          this.settings = next;
          this.engine.applySettings(next);
          this.engine.tableRows = next.tableRows ?? 3;
          this.engine.tableCols = next.tableCols ?? 3;
          this.syncToolbarFromTool();
          this._updatePenButtonColors();
        }
      });

      chrome.runtime.onMessage.addListener(this._onMessage);
    }

    _icon(name) {
      return `<span class="huabi-icon">${I.get(name)}</span>`;
    }

    _toolBtn(toolId, extraClass, title) {
      const ic = (n) => this._icon(n);
      const icons = {
        pen1: "pen",
        pen2: "pen",
        highlighter1: "highlighter",
        highlighter2: "highlighter",
        line: "line",
        rect: "rect",
        table: "table",
        eraser: "eraser",
      };
      return `
        <div class="huabi-tool-wrap">
          <button type="button" data-tool="${toolId}" class="huabi-tool-btn ${extraClass}" title="${title}">${ic(icons[toolId])}</button>
          <button type="button" class="huabi-tool-caret" data-tool-caret="${toolId}" title="样式设置" aria-label="样式设置"></button>
        </div>`;
    }

    _buildToolbar() {
      const bar = document.createElement("div");
      bar.id = "huabi-toolbar";
      const ic = (n) => this._icon(n);
      bar.innerHTML = `
        <span class="huabi-drag-handle" title="拖动">${ic("drag")}</span>
        <button type="button" id="huabi-mode-toggle" class="huabi-tool-btn huabi-active-tool" title="鼠标模式（点击切换画笔）">${ic("modePointer")}</button>
        <span class="huabi-sep"></span>
        ${this._toolBtn("pen1", "huabi-color-btn", "画笔1")}
        ${this._toolBtn("pen2", "huabi-color-btn", "画笔2")}
        ${this._toolBtn("highlighter1", "huabi-color-btn", "荧光笔1")}
        ${this._toolBtn("highlighter2", "huabi-color-btn", "荧光笔2")}
        ${this._toolBtn("line", "", "直线")}
        ${this._toolBtn("rect", "", "矩形")}
        ${this._toolBtn("table", "", "表格")}
        ${this._toolBtn("eraser", "", "橡皮擦")}
        <span class="huabi-sep"></span>
        <button type="button" id="huabi-undo" title="撤销">${ic("undo")}</button>
        <button type="button" id="huabi-redo" title="恢复">${ic("redo")}</button>
        <button type="button" id="huabi-clear" title="全部清除">${ic("clear")}</button>
        <button type="button" id="huabi-toggle-visibility" title="隐藏笔记">${ic("eye")}</button>
        <button type="button" id="huabi-export" title="保存">${ic("save")}</button>
        <span class="huabi-sep"></span>
        <button type="button" id="huabi-open-settings" title="设置">${ic("settings")}</button>
        <button type="button" id="huabi-close" title="关闭标注">${ic("close")}</button>
      `;
      return bar;
    }

    _buildToolPopover() {
      const panel = document.createElement("div");
      panel.id = "huabi-tool-popover";
      panel.hidden = true;
      panel.innerHTML = `<div class="huabi-popover-body"></div>`;
      return panel;
    }

    _updatePenButtonColors() {
      ["pen1", "pen2", "highlighter1", "highlighter2"].forEach((id) => {
        const btn = this.toolbar.querySelector(`[data-tool="${id}"]`);
        if (btn) {
          btn.style.setProperty("--tool-color", this.engine.getProfile(id).color);
        }
      });
    }

    _styleProfileId(toolId) {
      if (S.isEraserTool(toolId)) return "eraser";
      if (S.isShapeTool(toolId)) return this.engine.lastPenTool || "pen1";
      return toolId;
    }

    _persistToolProfiles() {
      this.settings.toolProfiles = this.engine.toolProfiles;
      S.saveSettings(this.settings);
    }

    _closeToolPopover() {
      if (!this.toolPopover) return;
      this.toolPopover.hidden = true;
      this._popoverTool = null;
      this.toolbar?.querySelectorAll(".huabi-tool-caret").forEach((c) => {
        c.classList.remove("huabi-caret-open");
      });
    }

    _toggleToolPopover(toolId, anchor) {
      if (this._popoverTool === toolId) {
        this._closeToolPopover();
        return;
      }
      this._openToolPopover(toolId, anchor);
    }

    _openToolPopover(toolId, anchor) {
      if (!this.toolPopover) return;
      this._popoverTool = toolId;
      this.selectTool(toolId);
      const body = this.toolPopover.querySelector(".huabi-popover-body");
      body.innerHTML = "";
      const title = S.TOOL_STYLE_LABELS[toolId] || toolId;
      body.appendChild(
        Object.assign(document.createElement("p"), {
          className: "huabi-popover-title",
          textContent: title,
        })
      );

      const profileId = this._styleProfileId(toolId);
      const profile = this.engine.getProfile(profileId);

      if (S.isShapeTool(toolId) && !S.isEraserTool(toolId)) {
        const hint = document.createElement("p");
        hint.className = "huabi-popover-hint";
        hint.textContent = `线宽跟随${this.engine.lastPenTool === "pen2" ? "画笔 2" : "画笔 1"}`;
        body.appendChild(hint);
      }

      if (!S.isEraserTool(toolId) && toolId !== "table") {
        const widthRow = this._popoverRangeRow(
          S.isHighlighterTool(toolId) ? "粗细" : "线宽",
          1,
          24,
          profile.lineWidth || 3,
          (v) => {
            this.engine.setProfile(profileId, { lineWidth: v });
            this._persistToolProfiles();
          }
        );
        body.appendChild(widthRow);
      }

      if (S.isHighlighterTool(toolId)) {
        const alphaPct = Math.round((profile.highlightAlpha ?? 0.5) * 100);
        const alphaRow = this._popoverRangeRow("透明度", 20, 80, alphaPct, (v) => {
          this.engine.setProfile(profileId, { highlightAlpha: v / 100 });
          this._persistToolProfiles();
        });
        body.appendChild(alphaRow);
      }

      if (S.isEraserTool(toolId)) {
        const sizeRow = this._popoverRangeRow(
          "大小",
          4,
          48,
          profile.lineWidth || 16,
          (v) => {
            this.engine.setProfile("eraser", { lineWidth: v });
            this._persistToolProfiles();
            this._updateCanvasCursors("eraser");
          }
        );
        body.appendChild(sizeRow);
      }

      if (toolId === "table") {
        const widthRow = this._popoverRangeRow("线宽", 1, 24, profile.lineWidth || 3, (v) => {
          this.engine.setProfile(profileId, { lineWidth: v });
          this._persistToolProfiles();
        });
        body.appendChild(widthRow);
        body.appendChild(this._popoverNumberRow("行", this.engine.tableRows, (v) => {
          this.engine.tableRows = v;
          this.settings.tableRows = v;
          this._persistToolProfiles();
        }));
        body.appendChild(this._popoverNumberRow("列", this.engine.tableCols, (v) => {
          this.engine.tableCols = v;
          this.settings.tableCols = v;
          this._persistToolProfiles();
        }));
        const hint = document.createElement("p");
        hint.className = "huabi-popover-hint";
        hint.textContent = "拖拽绘制表格外框";
        body.appendChild(hint);
      }

      this.toolPopover.hidden = false;
      this.toolbar.querySelectorAll(".huabi-tool-caret").forEach((c) => {
        c.classList.toggle("huabi-caret-open", c.dataset.toolCaret === toolId);
      });
      this._positionToolPopover(anchor);
    }

    _popoverRangeRow(label, min, max, value, onChange) {
      const row = document.createElement("label");
      row.className = "huabi-popover-row";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      const out = document.createElement("output");
      out.textContent = input.value;
      input.addEventListener("input", () => {
        out.textContent = input.value;
        onChange(Number(input.value));
      });
      row.appendChild(span);
      row.appendChild(input);
      row.appendChild(out);
      return row;
    }

    _popoverNumberRow(label, value, onChange) {
      const row = document.createElement("label");
      row.className = "huabi-popover-row";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "20";
      input.value = String(value);
      const sync = () => {
        const v = Math.max(1, Math.min(20, Number(input.value) || 3));
        input.value = String(v);
        onChange(v);
      };
      input.addEventListener("change", sync);
      row.appendChild(span);
      row.appendChild(input);
      return row;
    }

    _positionToolPopover(anchor) {
      if (!this.toolPopover || !anchor) return;
      const ar = anchor.getBoundingClientRect();
      const panelW = this.toolPopover.offsetWidth || 200;
      let left = ar.left;
      if (left + panelW > window.innerWidth - 8) {
        left = window.innerWidth - panelW - 8;
      }
      left = Math.max(8, left);
      this.toolPopover.style.left = left + "px";
      this.toolPopover.style.top = ar.bottom + 6 + "px";
    }

    _bindToolCarets() {
      this.toolbar.querySelectorAll("[data-tool-caret]").forEach((caret) => {
        caret.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          const toolId = caret.dataset.toolCaret;
          this._toggleToolPopover(toolId, caret.closest(".huabi-tool-wrap") || caret);
        });
      });

      this._onDocPointerDown = (e) => {
        if (!this._popoverTool || !this.toolPopover) return;
        const t = e.target;
        if (
          this.toolPopover.contains(t) ||
          t.closest?.(".huabi-tool-caret") ||
          t.closest?.(".huabi-tool-wrap")
        ) {
          return;
        }
        this._closeToolPopover();
      };

      this._onPopoverEsc = (e) => {
        if (e.key === "Escape" && this._popoverTool) this._closeToolPopover();
      };

      document.addEventListener("pointerdown", this._onDocPointerDown, true);
      document.addEventListener("keydown", this._onPopoverEsc, true);
    }

    syncToolbarFromTool() {
      const engine = this.engine;
      const bar = this.toolbar;

      bar.querySelectorAll("[data-tool]").forEach((b) => {
        b.classList.toggle("huabi-active-tool", b.dataset.tool === engine.tool);
      });

      const modeBtn = bar.querySelector("#huabi-mode-toggle");
      if (modeBtn) {
        modeBtn.classList.toggle("huabi-active-tool", !this.brushMode);
        modeBtn.title = this.brushMode
          ? "画笔模式（点击切换为鼠标）"
          : "鼠标模式（点击切换为画笔）";
      }

      const visBtn = bar.querySelector("#huabi-toggle-visibility");
      if (visBtn) {
        const iconEl = visBtn.querySelector(".huabi-icon");
        if (iconEl) iconEl.innerHTML = I.get(this.notesHidden ? "eyeOff" : "eye");
        visBtn.title = this.notesHidden ? "显示笔记" : "隐藏笔记";
        visBtn.classList.toggle("huabi-active-tool", this.notesHidden);
      }

      this._updateCanvasCursors();
    }

    _getBrushCursorColor() {
      const tool = this.engine.tool;
      let t = tool;
      if (S.isShapeTool(tool)) t = this.engine.lastPenTool || "pen1";
      if (S.isEraserTool(tool)) return "#252423";
      return this.engine.getProfile(t).color || "#252423";
    }

    _getToolbarToolId() {
      const eraserBtn = this.toolbar?.querySelector('[data-tool="eraser"]');
      if (eraserBtn?.classList.contains("huabi-active-tool")) {
        return "eraser";
      }
      const active = this.toolbar?.querySelectorAll("[data-tool].huabi-active-tool");
      if (active?.length === 1) return active[0].dataset.tool;
      if (active?.length > 1) {
        for (const b of active) {
          if (b.dataset.tool === this.engine.tool) return b.dataset.tool;
        }
      }
      return this.engine.tool;
    }

    _resolveActiveToolId() {
      const id = this._getToolbarToolId();
      this.engine.tool = id;
      return id;
    }

    _updateCanvasCursors(toolId) {
      const id = toolId || this.engine.tool;
      const isEraser = id === "eraser";
      this.root.classList.toggle("huabi-tool-eraser", isEraser);

      let cursor = "default";
      if (this.active && C) {
        if (isEraser) {
          const er = this.engine.getProfile("eraser");
          cursor = C.eraser(Math.max(er.lineWidth || 16, 8));
        } else if (this.brushMode) {
          const color = this._getBrushCursorColor();
          if (S.isPenTool(id)) cursor = C.pen(color);
          else if (S.isHighlighterTool(id)) cursor = C.highlighter(color);
          else cursor = C.brush(color);
        }
      }

      [this.canvasWrap, this.highlightCanvas, this.mainCanvas, this.previewCanvas].forEach((el) => {
        if (!el) return;
        el.classList.toggle("huabi-eraser-active", isEraser);
        if (this.active && (this.brushMode || isEraser)) {
          el.style.setProperty("cursor", cursor, "important");
        } else {
          el.style.removeProperty("cursor");
        }
      });
    }

    selectTool(toolId) {
      if (this._popoverTool && this._popoverTool !== toolId) {
        this._closeToolPopover();
      }
      this.engine.tool = toolId;
      if (S.isPenTool(toolId)) {
        this.engine.lastPenTool = toolId;
        this.settings.lastPenTool = toolId;
      }
      const drawTools = [
        "pen1",
        "pen2",
        "highlighter1",
        "highlighter2",
        "line",
        "rect",
        "table",
        "eraser",
      ];
      if (drawTools.includes(toolId) && !this.brushMode) {
        this.setBrushMode(true);
      }
      this.syncToolbarFromTool();
      this._updatePenButtonColors();
    }

    applyBrushModeUI() {
      this.root.classList.toggle("huabi-mouse-mode", this.active && !this.brushMode);
      this.root.classList.toggle("huabi-brush-mode", this.active && this.brushMode);
      const modeBtn = this.toolbar.querySelector("#huabi-mode-toggle");
      if (modeBtn) {
        modeBtn.title = this.brushMode
          ? "画笔模式（点击切换为鼠标）"
          : "鼠标模式（点击切换为画笔）";
      }
      this.syncToolbarFromTool();
    }

    toggleBrushMode() {
      this.brushMode = !this.brushMode;
      this.applyBrushModeUI();
    }

    setBrushMode(on) {
      this.brushMode = !!on;
      this.applyBrushModeUI();
    }

    toggleNotesVisibility() {
      this.notesHidden = !this.notesHidden;
      this.canvasWrap.classList.toggle("huabi-notes-hidden", this.notesHidden);
      this.syncToolbarFromTool();
    }

    _canCanvasInteract() {
      if (!this.active) return false;
      if (this.brushMode) return true;
      const tool = this._getToolbarToolId() || this.engine.tool;
      return tool === "eraser";
    }

    _bindCanvasEvents(wrap) {
      const skipTarget = (el) =>
        el.closest(
          "#huabi-toolbar, #huabi-tool-popover, #huabi-settings-backdrop, #huabi-settings-panel"
        );

      const stopTrack = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", up, true);
      };

      const bindDown = (e) => {
        if (!this._canCanvasInteract()) return;
        if (this.settingsPanel?.visible) return;
        if (skipTarget(e.target)) return;
        if (e.button !== 0) return;
        const toolId = this._resolveActiveToolId();
        const isEraser = toolId === "eraser";
        this._canvasPointerActive = true;
        this.root.classList.add("huabi-drawing");
        this.root.classList.toggle("huabi-erasing", isEraser);
        this._updateCanvasCursors(toolId);
        this.engine.onPointerDown(e, toolId);
        const capEl = this.mainCanvas || wrap;
        if (capEl.setPointerCapture && e.pointerId !== undefined) {
          try {
            capEl.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);
        window.addEventListener("mousemove", move, true);
        window.addEventListener("mouseup", up, true);
        e.preventDefault();
        e.stopPropagation();
      };

      const move = (e) => {
        if (!this.engine.isDrawing) return;
        this.engine.onPointerMove(e);
        e.preventDefault();
      };

      const up = (e) => {
        if (!this._canvasPointerActive && !this.engine.isDrawing) return;
        if (e.button !== 0 && e.type === "mouseup") return;
        this.engine.onPointerUp(e);
        this._canvasPointerActive = false;
        this.root.classList.remove("huabi-drawing", "huabi-erasing");
        this._updateCanvasCursors();
        stopTrack();
        const capEl = this.mainCanvas || wrap;
        if (capEl.releasePointerCapture && e.pointerId !== undefined) {
          try {
            capEl.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        e.preventDefault();
      };

      wrap.addEventListener("pointerdown", bindDown, true);
    }

    _bindToolbarDrag() {
      const handle = this.toolbar.querySelector(".huabi-drag-handle");
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;

      const onMove = (e) => {
        if (!dragging) return;
        const clientX = e.clientX;
        const clientY = e.clientY;
        const rect = this.toolbar.getBoundingClientRect();
        let left = clientX - offsetX;
        let top = clientY - offsetY;
        left = Math.max(4, Math.min(window.innerWidth - rect.width - 4, left));
        top = Math.max(4, Math.min(window.innerHeight - rect.height - 4, top));
        this.toolbar.style.left = left + "px";
        this.toolbar.style.top = top + "px";
        this.toolbar.style.transform = "none";
        if (this._popoverTool) {
          const caret = this.toolbar.querySelector(
            `[data-tool-caret="${this._popoverTool}"]`
          );
          if (caret) {
            this._positionToolPopover(caret.closest(".huabi-tool-wrap") || caret);
          }
        }
      };

      const onUp = () => {
        dragging = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = this.toolbar.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dragging = true;
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    }

    _bindToolbarActions() {
      const bar = this.toolbar;
      const engine = this.engine;

      bar.querySelector("#huabi-mode-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleBrushMode();
      });

      bar.querySelectorAll("[data-tool]").forEach((btn) => {
        btn.addEventListener(
          "pointerdown",
          (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            this.selectTool(btn.dataset.tool);
          },
          true
        );
      });

      bar.querySelector("#huabi-open-settings").addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeToolPopover();
        this.settingsPanel.toggle();
      });

      bar.querySelector("#huabi-undo").addEventListener("click", (e) => {
        e.stopPropagation();
        engine.undo();
      });
      bar.querySelector("#huabi-redo").addEventListener("click", (e) => {
        e.stopPropagation();
        engine.redo();
      });
      bar.querySelector("#huabi-clear").addEventListener("click", (e) => {
        e.stopPropagation();
        engine.clear();
      });
      bar.querySelector("#huabi-toggle-visibility").addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleNotesVisibility();
      });
      bar.querySelector("#huabi-export").addEventListener("click", (e) => {
        e.stopPropagation();
        this.exportPng();
      });
      bar.querySelector("#huabi-close").addEventListener("click", (e) => {
        e.stopPropagation();
        this.setActive(false);
      });
    }

    _bindKeyboard() {
      window.addEventListener("keydown", this._onKeyDown, true);
    }

    _unbindKeyboard() {
      window.removeEventListener("keydown", this._onKeyDown, true);
    }

    _isEditableTarget() {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return false;
      if (this.root?.contains(el)) {
        const panel = document.getElementById("huabi-settings-panel");
        if (panel?.contains(el)) {
          const tag = el.tagName;
          return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
        }
        return false;
      }
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }

    _onKeyDown(e) {
      if (!this.active) return;
      if (this.settingsPanel?.visible) return;
      if (this._isEditableTarget()) return;
      const shortcuts = this.settings.shortcuts || S.DEFAULT_SHORTCUTS;

      if (K.matchShortcut(e, shortcuts.toggleDrawMode)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleBrushMode();
        return;
      }

      if (!this.brushMode) {
        if (K.matchShortcut(e, shortcuts.eraser)) {
          e.preventDefault();
          e.stopPropagation();
          this.selectTool("eraser");
        }
        return;
      }

      const toolIds = [
        "pen1",
        "pen2",
        "highlighter1",
        "highlighter2",
        "line",
        "rect",
        "table",
        "eraser",
      ];
      for (const id of toolIds) {
        if (K.matchShortcut(e, shortcuts[id])) {
          e.preventDefault();
          e.stopPropagation();
          this.selectTool(id);
          return;
        }
      }

      if (K.matchShortcut(e, shortcuts.undo)) {
        e.preventDefault();
        e.stopPropagation();
        this.engine.undo();
        return;
      }
      if (K.matchShortcut(e, shortcuts.redo)) {
        e.preventDefault();
        e.stopPropagation();
        this.engine.redo();
        return;
      }
      if (shortcuts.clear && K.matchShortcut(e, shortcuts.clear)) {
        e.preventDefault();
        e.stopPropagation();
        this.engine.clear();
        return;
      }
      if (K.matchShortcut(e, shortcuts.export)) {
        e.preventDefault();
        e.stopPropagation();
        this.exportPng();
        return;
      }
      if (K.matchShortcut(e, shortcuts.toggleVisibility)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleNotesVisibility();
      }
    }

    async setActive(on) {
      await this.init();
      if (!this._toolbarBound) {
        this._bindToolbarActions();
        this._toolbarBound = true;
      }

      if (on && !this.active) {
        this._bindKeyboard();
      } else if (!on && this.active) {
        this._unbindKeyboard();
      }

      this.active = on;
      this.root.classList.toggle("huabi-active", on);

      if (on) {
        this.settings = await S.loadSettings();
        this.engine.applySettings(this.settings);
        this.brushMode = false;
        this.applyBrushModeUI();
        this.engine.tableRows = this.settings.tableRows ?? 3;
        this.engine.tableCols = this.settings.tableCols ?? 3;
        this.engine.resize();
        this.syncToolbarFromTool();
        this._updatePenButtonColors();
      } else {
        this.setBrushMode(false);
        this.settingsPanel.hide();
        this._closeToolPopover();
        this.canvasWrap.classList.remove("huabi-notes-hidden");
        this.notesHidden = false;
      }

      chrome.runtime.sendMessage({ type: "DRAW_STATE_CHANGED", active: on }).catch(() => {});
    }

    async toggle() {
      await this.setActive(!this.active);
      return { active: this.active };
    }

    exportPng() {
      const bar = this.toolbar;
      const backdrop = document.getElementById("huabi-settings-backdrop");
      const barDisplay = bar.style.display;
      const popHidden = this.toolPopover?.hidden;
      const bdHidden = backdrop ? backdrop.hidden : true;
      bar.style.display = "none";
      if (this.toolPopover) this.toolPopover.hidden = true;
      if (backdrop) backdrop.hidden = true;

      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d");
      tctx.drawImage(this.highlightCanvas, 0, 0);
      tctx.drawImage(this.mainCanvas, 0, 0);
      const url = tmp.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "huabi-" + Date.now() + ".png";
      a.click();

      bar.style.display = barDisplay;
      if (this.toolPopover && popHidden != null) this.toolPopover.hidden = popHidden;
      if (backdrop) backdrop.hidden = bdHidden;
    }

    _onMessage(msg, _sender, sendResponse) {
      if (msg.type === "TOGGLE_DRAW_MODE") {
        this.toggle().then((res) => sendResponse(res));
        return true;
      }
      if (msg.type === "GET_STATE") {
        sendResponse({ active: this.active });
        return true;
      }
      if (msg.type === "RELOAD_SETTINGS") {
        S.loadSettings().then((s) => {
          this.settings = s;
          this.engine.toolProfiles = s.toolProfiles;
          this.engine.lastPenTool = s.lastPenTool || "pen1";
          this.engine.tableRows = s.tableRows ?? 3;
          this.engine.tableCols = s.tableCols ?? 3;
          this.settings.tableRows = s.tableRows ?? 3;
          this.settings.tableCols = s.tableCols ?? 3;
          this.syncToolbarFromTool();
          this._updatePenButtonColors();
          sendResponse({ ok: true });
        });
        return true;
      }
      return false;
    }
  }

  const overlay = new HuabiOverlay();
  overlay.init();
})();
