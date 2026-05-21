(function () {
  if (window.__huabiInitialized) return;
  window.__huabiInitialized = true;

  const S = window.HuabiSettings;
  const K = window.HuabiShortcuts;
  const I = window.HuabiIcons;
  const C = window.HuabiCursors;

  const MAX_HISTORY = 25;

  class DrawingEngine {
    constructor(mainCanvas, highlightCanvas, shapeCanvas, textCanvas, previewCanvas, settings) {
      this.mainCanvas = mainCanvas;
      this.highlightCanvas = highlightCanvas;
      this.shapeCanvas = shapeCanvas;
      this.textCanvas = textCanvas;
      this.previewCanvas = previewCanvas;
      const ctxOpts = { willReadFrequently: true };
      this.mainCtx = mainCanvas.getContext("2d", ctxOpts);
      this.highlightCtx = highlightCanvas.getContext("2d", ctxOpts);
      this.shapeCtx = shapeCanvas.getContext("2d", ctxOpts);
      this.textCtx = textCanvas.getContext("2d", ctxOpts);
      this.previewCtx = previewCanvas.getContext("2d", ctxOpts);
      this.shapeItems = [];
      this.textItems = [];
      this.dpr = window.devicePixelRatio || 1;
      this.toolProfiles = settings.toolProfiles;
      this.lastPenTool = settings.lastPenTool || S.DEFAULT_PEN_TOOL;
      this.tool = S.DEFAULT_PEN_TOOL;
      this.isDrawing = false;
      this.startX = 0;
      this.startY = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.tableRows = settings.tableRows ?? 3;
      this.tableCols = settings.tableCols ?? 3;
      this.coordTicks = settings.coordTicks ?? 5;
      this.coordStart = settings.coordStart ?? 0;
      this.coordStep = settings.coordStep ?? 1;
      this.coordShowY = settings.coordShowY === true;
      this.textFontSize = settings.textFontSize ?? 0;
      this.arrowEnds = settings.arrowEnds === "both" ? "both" : "end";
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
      this.lastPenTool = settings.lastPenTool || S.DEFAULT_PEN_TOOL;
      this.tableRows = settings.tableRows ?? 3;
      this.tableCols = settings.tableCols ?? 3;
      this.coordTicks = settings.coordTicks ?? 5;
      this.coordStart = settings.coordStart ?? 0;
      this.coordStep = settings.coordStep ?? 1;
      this.coordShowY = settings.coordShowY === true;
      this.textFontSize = settings.textFontSize ?? 0;
      this.arrowEnds = settings.arrowEnds === "both" ? "both" : "end";
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
      const target =
        S.isShapeTool(this.tool) || S.isTextTool(this.tool)
          ? this.lastPenTool
          : this.getStyleTargetTool();
      return this.getProfile(target);
    }

    _paintTextOnCtx(ctx, text, x, y, fontSize, color) {
      const lineHeight = fontSize * 1.25;
      ctx.save();
      ctx.font = `${fontSize}px ${S.getTextFontCss()}`;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      text.split("\n").forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineHeight);
      });
      ctx.restore();
    }

    measureTextBlock(text, fontSize) {
      const lines = text.split("\n");
      const lineHeight = fontSize * 1.25;
      const ctx = this.textCtx;
      ctx.save();
      ctx.font = `${fontSize}px ${S.getTextFontCss()}`;
      let w = 0;
      for (const line of lines) {
        w = Math.max(w, ctx.measureText(line).width);
      }
      ctx.restore();
      return { w, h: Math.max(lineHeight, lines.length * lineHeight) };
    }

    _newTextId() {
      return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    addTextItem({ id, text, x, y, fontSize, color }) {
      const { w, h } = this.measureTextBlock(text, fontSize);
      this.textItems.push({ id: id || this._newTextId(), text, x, y, fontSize, color, w, h });
    }

    updateTextItem(id, patch) {
      let item = this.textItems.find((t) => t.id === id);
      if (!item) {
        item = { id, text: "", x: 0, y: 0, fontSize: 16, color: "#252423" };
        this.textItems.push(item);
      }
      Object.assign(item, patch);
      const { w, h } = this.measureTextBlock(item.text, item.fontSize);
      item.w = w;
      item.h = h;
    }

    removeTextItem(id) {
      const i = this.textItems.findIndex((t) => t.id === id);
      if (i >= 0) this.textItems.splice(i, 1);
    }

    renderTexts() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.textCtx.clearRect(0, 0, w, h);
      for (const item of this.textItems) {
        this._paintTextOnCtx(
          this.textCtx,
          item.text,
          item.x,
          item.y,
          item.fontSize,
          item.color
        );
      }
    }

    hitTestText(x, y, padding = 6) {
      for (let i = this.textItems.length - 1; i >= 0; i--) {
        const t = this.textItems[i];
        if (
          x >= t.x - padding &&
          x <= t.x + t.w + padding &&
          y >= t.y - padding &&
          y <= t.y + t.h + padding
        ) {
          return { kind: "text", item: t };
        }
      }
      return null;
    }

    _newShapeId() {
      return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    _applyItemStrokeStyle(ctx, item) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    _shapeBounds(item) {
      const left = Math.min(item.x1, item.x2);
      const top = Math.min(item.y1, item.y2);
      const width = Math.abs(item.x2 - item.x1);
      const height = Math.abs(item.y2 - item.y1);
      return { left, top, width, height };
    }

    _distToSegment(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    _strokeHitThreshold(item, padding) {
      return padding + Math.max(4, (item.lineWidth || 2) * 1.5 + 2);
    }

    _hitNearAnySegment(x, y, segments, thresh) {
      for (const seg of segments) {
        if (this._distToSegment(x, y, seg[0], seg[1], seg[2], seg[3]) <= thresh) {
          return true;
        }
      }
      return false;
    }

    _hitRectStroke(x, y, x1, y1, x2, y2, thresh) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const right = Math.max(x1, x2);
      const bottom = Math.max(y1, y2);
      return this._hitNearAnySegment(
        x,
        y,
        [
          [left, top, right, top],
          [right, top, right, bottom],
          [right, bottom, left, bottom],
          [left, bottom, left, top],
        ],
        thresh
      );
    }

    _hitCircleStroke(x, y, x1, y1, x2, y2, thresh) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (width < 2 && height < 2) return false;
      const rx = width / 2;
      const ry = height / 2;
      if (rx < 1 || ry < 1) return false;
      const cx = left + rx;
      const cy = top + ry;
      const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
      const bx = cx + rx * Math.cos(angle);
      const by = cy + ry * Math.sin(angle);
      return Math.hypot(x - bx, y - by) <= thresh;
    }

    _hitTableStroke(x, y, item, thresh) {
      const { x1, y1, x2, y2 } = item;
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (width < 4 || height < 4) return false;
      const cols = Math.max(1, item.tableCols ?? this.tableCols);
      const rows = Math.max(1, item.tableRows ?? this.tableRows);
      const colStep = width / cols;
      const rowStep = height / rows;
      const segments = [
        [left, top, left + width, top],
        [left + width, top, left + width, top + height],
        [left + width, top + height, left, top + height],
        [left, top + height, left, top],
      ];
      for (let c = 1; c < cols; c++) {
        const sx = left + colStep * c;
        segments.push([sx, top, sx, top + height]);
      }
      for (let r = 1; r < rows; r++) {
        const sy = top + rowStep * r;
        segments.push([left, sy, left + width, sy]);
      }
      return this._hitNearAnySegment(x, y, segments, thresh);
    }

    _hitAxesStroke(x, y, item, thresh) {
      const { x1, y1, x2, y2 } = item;
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      const showY = item.coordShowY != null ? !!item.coordShowY : !!this.coordShowY;
      if (width < 8 || (showY && height < 8)) return false;

      const cx = left + width / 2;
      const cy = top + height / 2;
      const ticks = Math.max(1, Math.min(20, item.coordTicks ?? this.coordTicks));
      const tickLen = Math.max(4, Math.min(10, (item.lineWidth || 2) * 2));
      const arrow = Math.max(6, tickLen + 2);
      const segments = [[left, cy, left + width, cy]];

      if (showY) {
        segments.push([cx, top, cx, top + height]);
      }

      const stepX = width / ticks;
      for (let i = 1; i < ticks; i++) {
        const sx = left + stepX * i;
        segments.push([sx, cy - tickLen, sx, cy + tickLen]);
      }
      if (showY) {
        const stepY = height / ticks;
        for (let i = 1; i < ticks; i++) {
          const sy = top + stepY * i;
          segments.push([cx - tickLen, sy, cx + tickLen, sy]);
        }
      }

      const right = left + width;
      segments.push(
        [right, cy, right - arrow, cy - arrow * 0.45],
        [right, cy, right - arrow, cy + arrow * 0.45]
      );
      if (showY) {
        segments.push(
          [cx, top, cx - arrow * 0.45, top + arrow],
          [cx, top, cx + arrow * 0.45, top + arrow]
        );
      }

      return this._hitNearAnySegment(x, y, segments, thresh);
    }

    _hitArrowHeadSegments(tipX, tipY, angle, lineWidth) {
      const len = Math.max(8, (lineWidth || 2) * 3);
      const a1 = angle - 0.45;
      const a2 = angle + 0.45;
      return [
        [tipX, tipY, tipX - len * Math.cos(a1), tipY - len * Math.sin(a1)],
        [tipX, tipY, tipX - len * Math.cos(a2), tipY - len * Math.sin(a2)],
      ];
    }

    _hitArrowLineStroke(x, y, item, thresh) {
      const { x1, y1, x2, y2 } = item;
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (dist < 1) return false;
      const segments = [[x1, y1, x2, y2]];
      const angle = Math.atan2(y2 - y1, x2 - x1);
      segments.push(...this._hitArrowHeadSegments(x2, y2, angle, item.lineWidth));
      if (item.arrowEnds === "both") {
        segments.push(...this._hitArrowHeadSegments(x1, y1, angle + Math.PI, item.lineWidth));
      }
      return this._hitNearAnySegment(x, y, segments, thresh);
    }

    _hitTestShapeItem(item, x, y, padding) {
      const thresh = this._strokeHitThreshold(item, padding);
      const { left, top, width, height } = this._shapeBounds(item);
      const pad = thresh + 2;
      if (
        x < left - pad ||
        x > left + width + pad ||
        y < top - pad ||
        y > top + height + pad
      ) {
        return false;
      }

      if (item.type === "line") {
        return this._distToSegment(x, y, item.x1, item.y1, item.x2, item.y2) <= thresh;
      }
      if (item.type === "arrowLine") {
        return this._hitArrowLineStroke(x, y, item, thresh);
      }
      if (item.type === "rect") {
        return this._hitRectStroke(x, y, item.x1, item.y1, item.x2, item.y2, thresh);
      }
      if (item.type === "circle") {
        return this._hitCircleStroke(x, y, item.x1, item.y1, item.x2, item.y2, thresh);
      }
      if (item.type === "table") {
        return this._hitTableStroke(x, y, item, thresh);
      }
      if (item.type === "axes") {
        return this._hitAxesStroke(x, y, item, thresh);
      }
      return false;
    }

    hitTestShape(x, y, padding = 6) {
      for (let i = this.shapeItems.length - 1; i >= 0; i--) {
        const s = this.shapeItems[i];
        if (this._hitTestShapeItem(s, x, y, padding)) {
          return { kind: "shape", item: s };
        }
      }
      return null;
    }

    hitTestCanvasObject(x, y, padding = 6) {
      return this.hitTestText(x, y, padding) || this.hitTestShape(x, y, padding);
    }

    addShapeItem(item) {
      this.shapeItems.push({
        id: item.id || this._newShapeId(),
        type: item.type,
        x1: item.x1,
        y1: item.y1,
        x2: item.x2,
        y2: item.y2,
        color: item.color,
        lineWidth: item.lineWidth,
        tableRows: item.tableRows,
        tableCols: item.tableCols,
        coordTicks: item.coordTicks,
        coordStart: item.coordStart,
        coordStep: item.coordStep,
        coordShowY: item.coordShowY,
        arrowEnds: item.arrowEnds,
      });
    }

    updateShapeItem(id, patch) {
      const item = this.shapeItems.find((s) => s.id === id);
      if (!item) return;
      Object.assign(item, patch);
    }

    removeShapeItem(id) {
      const i = this.shapeItems.findIndex((s) => s.id === id);
      if (i >= 0) this.shapeItems.splice(i, 1);
    }

    _paintShapeItem(ctx, item) {
      this._applyItemStrokeStyle(ctx, item);
      if (item.type === "line") {
        const dist = Math.hypot(item.x2 - item.x1, item.y2 - item.y1);
        if (dist < 1) return;
        ctx.beginPath();
        ctx.moveTo(item.x1, item.y1);
        ctx.lineTo(item.x2, item.y2);
        ctx.stroke();
      } else if (item.type === "rect") {
        ctx.strokeRect(item.x1, item.y1, item.x2 - item.x1, item.y2 - item.y1);
      } else if (item.type === "table") {
        ctx.strokeRect(item.x1, item.y1, item.x2 - item.x1, item.y2 - item.y1);
        this._drawTableGrid(ctx, item.x1, item.y1, item.x2, item.y2, {
          rows: item.tableRows,
          cols: item.tableCols,
        });
      } else if (item.type === "axes") {
        this._drawAxes(ctx, item.x1, item.y1, item.x2, item.y2, {
          coordTicks: item.coordTicks,
          coordStart: item.coordStart ?? 0,
          coordStep: item.coordStep ?? 1,
          coordShowY: item.coordShowY,
        });
      } else if (item.type === "arrowLine") {
        this._drawArrowLine(
          ctx,
          item.x1,
          item.y1,
          item.x2,
          item.y2,
          item.arrowEnds || "end"
        );
      } else if (item.type === "circle") {
        this._drawCircle(ctx, item.x1, item.y1, item.x2, item.y2);
      }
    }

    renderShapes() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.shapeCtx.clearRect(0, 0, w, h);
      for (const item of this.shapeItems) {
        this._paintShapeItem(this.shapeCtx, item);
      }
    }

    _commitShapeFromDrag(tool, x1, y1, x2, y2) {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const { left, top, width, height } = {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      };
      if (tool === "line" || tool === "arrowLine") {
        if (dist < 1) return false;
      } else if (tool === "circle" || tool === "rect") {
        if (width < 2 && height < 2) return false;
      } else if (tool === "table") {
        if (width < 4 || height < 4) return false;
      } else if (tool === "axes") {
        const showY = !!this.coordShowY;
        if (width < 8 || (showY && height < 8)) return false;
      }

      const style = this.getActiveStyle();
      const item = {
        type: tool,
        x1,
        y1,
        x2,
        y2,
        color: style.color,
        lineWidth: style.lineWidth,
      };
      if (tool === "table") {
        item.tableRows = this.tableRows;
        item.tableCols = this.tableCols;
      } else if (tool === "axes") {
        item.coordTicks = this.coordTicks;
        item.coordStart = this.coordStart;
        item.coordStep = this.coordStep;
        item.coordShowY = this.coordShowY;
      } else if (tool === "arrowLine") {
        item.arrowEnds = this.arrowEnds;
      }
      this.pushHistory();
      this.addShapeItem(item);
      this.renderShapes();
      return true;
    }

    drawText(text, x, y, fontSize, color) {
      this.addTextItem({ text, x, y, fontSize, color });
      this.renderTexts();
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = this.dpr;

      const mainSnap = this._captureMain();
      const hlSnap = this._captureHighlight();
      [this.highlightCanvas, this.mainCanvas, this.shapeCanvas, this.textCanvas, this.previewCanvas].forEach((c) => {
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
      this.renderShapes();
      this.renderTexts();
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
        this.textItems = snap.textItems
          ? snap.textItems.map((t) => ({ ...t }))
          : [];
        this.shapeItems = snap.shapeItems
          ? snap.shapeItems.map((s) => ({ ...s }))
          : [];
        this.renderShapes();
        this.renderTexts();
        return;
      }
      if (snap.data) {
        this.mainCtx.putImageData(snap, 0, 0);
        this.textItems = [];
        this.shapeItems = [];
        this.renderShapes();
        this.renderTexts();
      }
    }

    _captureHistorySnap() {
      const w = this.mainCanvas.width;
      const h = this.mainCanvas.height;
      return {
        main: this.mainCtx.getImageData(0, 0, w, h),
        highlight: this.highlightCtx.getImageData(0, 0, w, h),
        shapeItems: this.shapeItems.map((s) => ({ ...s })),
        textItems: this.textItems.map((t) => ({ ...t })),
      };
    }

    getPos(e) {
      const rect = this.mainCanvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    /** Shift 直线：捕捉 0°/30°/45°/60°/90° 等（15° 步进） */
    _snapLinePoint(x1, y1, x, y) {
      const dx = x - x1;
      const dy = y - y1;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return { x, y };
      const step = Math.PI / 12;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return {
        x: x1 + dist * Math.cos(snapped),
        y: y1 + dist * Math.sin(snapped),
      };
    }

    /** Shift：圆/矩形外框约束为正方形（正圆即正方形外接圆） */
    _snapSquarePoint(x1, y1, x, y) {
      const dx = x - x1;
      const dy = y - y1;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      if (size < 1) return { x, y };
      return {
        x: x1 + (dx >= 0 ? size : -size),
        y: y1 + (dy >= 0 ? size : -size),
      };
    }

    /** Shift 表格：每个小格为正方形（按当前行列数） */
    _snapTableSquareCells(x1, y1, x, y) {
      const cols = Math.max(1, this.tableCols);
      const rows = Math.max(1, this.tableRows);
      let width = x - x1;
      let height = y - y1;
      const signX = width >= 0 ? 1 : -1;
      const signY = height >= 0 ? 1 : -1;
      width = Math.abs(width);
      height = Math.abs(height);
      if (width < 1 && height < 1) return { x, y };
      const cell = Math.min(width / cols, height / rows);
      if (cell < 0.5) return { x, y };
      return {
        x: x1 + signX * cell * cols,
        y: y1 + signY * cell * rows,
      };
    }

    _constrainShapePoint(x1, y1, x, y, tool, shiftKey) {
      if (!shiftKey) return { x, y };
      if (tool === "line" || tool === "arrowLine") {
        return this._snapLinePoint(x1, y1, x, y);
      }
      if (tool === "table") {
        return this._snapTableSquareCells(x1, y1, x, y);
      }
      if (tool === "circle" || tool === "rect") {
        return this._snapSquarePoint(x1, y1, x, y);
      }
      return { x, y };
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
      this.shapeItems = [];
      this.textItems = [];
      this.renderShapes();
      this.renderTexts();
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
      const raw = this.getPos(e);
      const { x, y } = this._constrainShapePoint(
        this.startX,
        this.startY,
        raw.x,
        raw.y,
        tool,
        e.shiftKey
      );

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
      } else if (tool === "axes") {
        this._drawAxes(ctx, this.startX, this.startY, x, y, {
          coordTicks: this.coordTicks,
          coordStart: this.coordStart,
          coordStep: this.coordStep,
          coordShowY: this.coordShowY,
        });
      } else if (tool === "arrowLine") {
        this._drawArrowLine(
          ctx,
          this.startX,
          this.startY,
          x,
          y,
          this.arrowEnds
        );
      } else if (tool === "circle") {
        this._drawCircle(ctx, this.startX, this.startY, x, y);
      }
    }

    onPointerUp(e) {
      if (!this.isDrawing) return false;
      const tool = this._activeTool();
      this.isDrawing = false;
      this.strokeTool = null;
      const raw = this.getPos(e);
      const { x, y } = this._constrainShapePoint(
        this.startX,
        this.startY,
        raw.x,
        raw.y,
        tool,
        e.shiftKey
      );

      if (S.isEraserTool(tool)) {
        this._eraseLineBoth(this.lastX, this.lastY, x, y);
        this._endErase(this.mainCtx);
        this.clearPreview();
        return false;
      }

      if (S.isHighlighterTool(tool)) {
        this._expandHlBBox(x, y);
        this._restoreHighlightSnap();
        this._compositeHlStrokeToHighlight({ clearStroke: true });
        this._hlCommitSnap = null;
        this._hlBBox = null;
        this.clearPreview();
        return false;
      }

      if (S.isFreehandTool(tool)) {
        this.mainCtx.globalCompositeOperation = "source-over";
        this.mainCtx.globalAlpha = 1;
        this.clearPreview();
        return false;
      }

      if (S.isShapeTool(tool)) {
        const committed = this._commitShapeFromDrag(tool, this.startX, this.startY, x, y);
        this.clearPreview();
        return committed;
      }

      this.clearPreview();
      return false;
    }

    _drawArrowHead(ctx, tipX, tipY, angle) {
      const len = Math.max(8, (ctx.lineWidth || 2) * 3);
      const a1 = angle - 0.45;
      const a2 = angle + 0.45;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - len * Math.cos(a1), tipY - len * Math.sin(a1));
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - len * Math.cos(a2), tipY - len * Math.sin(a2));
      ctx.stroke();
    }

    _drawArrowLine(ctx, x1, y1, x2, y2, ends) {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      if (dist < 1) return;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      this._drawArrowHead(ctx, x2, y2, angle);
      if (ends === "both") {
        this._drawArrowHead(ctx, x1, y1, angle + Math.PI);
      }
    }

    _drawCircle(ctx, x1, y1, x2, y2) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      if (rx < 1 && ry < 1) return;
      const cx = left + rx;
      const cy = top + ry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    _formatCoordLabel(value, step) {
      const stepNum = Number(step) || 1;
      const stepStr = String(stepNum);
      let decimals = 0;
      if (stepStr.includes(".")) {
        const frac = stepStr.split(".")[1] || "";
        decimals = frac.replace(/0+$/, "").length || frac.length;
      }
      if (decimals === 0) return String(Math.round(value));
      return value.toFixed(decimals);
    }

    _drawAxes(ctx, x1, y1, x2, y2, opts = {}) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      const showY = opts.coordShowY != null ? !!opts.coordShowY : !!this.coordShowY;
      if (width < 8 || (showY && height < 8)) return;

      const cx = left + width / 2;
      const cy = top + height / 2;
      const ticks = Math.max(1, Math.min(20, opts.coordTicks ?? this.coordTicks));
      const tickLen = Math.max(4, Math.min(10, (ctx.lineWidth || 2) * 2));
      const arrow = Math.max(6, tickLen + 2);
      let coordStart = opts.coordStart != null ? Number(opts.coordStart) : this.coordStart;
      let coordStep = opts.coordStep != null ? Number(opts.coordStep) : this.coordStep;
      if (!Number.isFinite(coordStart)) coordStart = 0;
      if (!Number.isFinite(coordStep) || coordStep <= 0) coordStep = 1;

      ctx.beginPath();
      ctx.moveTo(left, cy);
      ctx.lineTo(left + width, cy);
      if (showY) {
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, top + height);
      }
      ctx.stroke();

      const stepX = width / ticks;
      ctx.beginPath();
      for (let i = 1; i < ticks; i++) {
        const x = left + stepX * i;
        ctx.moveTo(x, cy - tickLen);
        ctx.lineTo(x, cy + tickLen);
      }
      if (showY) {
        const stepY = height / ticks;
        for (let i = 1; i < ticks; i++) {
          const y = top + stepY * i;
          ctx.moveTo(cx - tickLen, y);
          ctx.lineTo(cx + tickLen, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(left + width, cy);
      ctx.lineTo(left + width - arrow, cy - arrow * 0.45);
      ctx.moveTo(left + width, cy);
      ctx.lineTo(left + width - arrow, cy + arrow * 0.45);
      if (showY) {
        ctx.moveTo(cx, top);
        ctx.lineTo(cx - arrow * 0.45, top + arrow);
        ctx.moveTo(cx, top);
        ctx.lineTo(cx + arrow * 0.45, top + arrow);
      }
      ctx.stroke();

      const stepY = height / ticks;
      const fontSize = Math.max(
        21,
        Math.min(
          (ctx.lineWidth || 2) * 7.5,
          Math.min(stepX, showY ? stepY : stepX) * 0.825,
          30
        )
      );
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `${fontSize}px ${S.getTextFontCss()}`;

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      if (showY) {
        const xOriginLabel = this._formatCoordLabel(coordStart, coordStep);
        ctx.fillText(xOriginLabel, cx, cy + tickLen + 4);
        for (let i = 0; i <= ticks; i++) {
          const x = left + stepX * i;
          if (Math.abs(x - cx) < 1) continue;
          const value = coordStart + ((x - cx) / stepX) * coordStep;
          const label = this._formatCoordLabel(value, coordStep);
          if (ctx.measureText(label).width > stepX * 0.9) continue;
          ctx.fillText(label, x, cy + tickLen + 4);
        }
      } else {
        for (let i = 0; i <= ticks; i++) {
          const x = left + stepX * i;
          const value = coordStart + i * coordStep;
          const label = this._formatCoordLabel(value, coordStep);
          if (ctx.measureText(label).width > stepX * 0.9) continue;
          ctx.fillText(label, x, cy + tickLen + 4);
        }
      }

      if (showY) {
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const originLabel = this._formatCoordLabel(coordStart, coordStep);
        ctx.fillText(originLabel, cx - tickLen - 4, cy);
        for (let i = 0; i <= ticks; i++) {
          const y = top + stepY * i;
          if (Math.abs(y - cy) < 1) continue;
          const value = coordStart + ((cy - y) / stepY) * coordStep;
          const label = this._formatCoordLabel(value, coordStep);
          if (ctx.measureText(label).width > stepY * 0.9) continue;
          ctx.fillText(label, cx - tickLen - 4, y);
        }
      }
      ctx.restore();
    }

    _drawTableGrid(ctx, x1, y1, x2, y2, opts = {}) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (width < 4 || height < 4) return;

      const cols = Math.max(1, opts.cols ?? this.tableCols);
      const rows = Math.max(1, opts.rows ?? this.tableRows);
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
      this._textEditor = null;
      this._selectedCanvasObject = null;
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
      const shape = document.createElement("canvas");
      shape.id = "huabi-shape";
      const text = document.createElement("canvas");
      text.id = "huabi-text";
      const preview = document.createElement("canvas");
      preview.id = "huabi-preview";

      wrap.appendChild(highlight);
      wrap.appendChild(main);
      wrap.appendChild(shape);
      wrap.appendChild(text);
      wrap.appendChild(preview);
      root.appendChild(wrap);
      root.appendChild(this._buildToolbar());
      root.appendChild(this._buildToolPopover());
      document.documentElement.appendChild(root);

      this.root = root;
      this.canvasWrap = wrap;
      this.highlightCanvas = highlight;
      this.mainCanvas = main;
      this.shapeCanvas = shape;
      this.textCanvas = text;
      this.previewCanvas = preview;
      this.engine = new DrawingEngine(main, highlight, shape, text, preview, this.settings);
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
        if ((area !== "sync" && area !== "local") || !changes[S.SETTINGS_KEY]) return;
        const next = changes[S.SETTINGS_KEY].newValue;
        if (next) {
          this.settings = next;
          this.engine.applySettings(next);
          this.engine.tableRows = next.tableRows ?? 3;
          this.engine.tableCols = next.tableCols ?? 3;
          this.engine.coordTicks = next.coordTicks ?? 5;
          this.engine.coordStart = next.coordStart ?? 0;
          this.engine.coordStep = next.coordStep ?? 1;
          this.engine.coordShowY = next.coordShowY === true;
          this.engine.textFontSize = next.textFontSize ?? 0;
          this.engine.arrowEnds = next.arrowEnds === "both" ? "both" : "end";
          this.syncToolbarFromTool();
          this._updatePenButtonColors();
          this._applyToolbarPosition();
          this._rebuildToolbarTools();
        }
      });

      this._applyToolbarPosition();

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
        arrowLine: "arrowLine",
        circle: "circle",
        table: "table",
        axes: "axes",
        text: "text",
        eraser: "eraser",
      };
      return `
        <div class="huabi-tool-wrap">
          <button type="button" data-tool="${toolId}" class="huabi-tool-btn ${extraClass}" title="${title}">${ic(icons[toolId])}</button>
          <button type="button" class="huabi-tool-caret" data-tool-caret="${toolId}" title="样式设置" aria-label="样式设置"></button>
        </div>`;
    }

    _shapeToolsHtml() {
      const titles = {
        line: "直线",
        rect: "矩形",
        arrowLine: "箭头直线",
        circle: "圆形",
        table: "表格",
        axes: "坐标系",
        text: "文字",
      };
      return S.getVisibleToolbarShapeTools(this.settings)
        .map((t) => this._toolBtn(t.id, "", titles[t.id] || t.label))
        .join("");
    }

    _rebuildToolbarTools() {
      const slot = this.toolbar?.querySelector("#huabi-toolbar-shape-tools");
      if (!slot) return;
      slot.innerHTML = this._shapeToolsHtml();
      this._bindShapeToolButtons();
      this._bindToolCarets();
      this.syncToolbarFromTool();
    }

    _buildToolbar() {
      const bar = document.createElement("div");
      bar.id = "huabi-toolbar";
      const ic = (n) => this._icon(n);
      bar.innerHTML = `
        <span class="huabi-drag-handle" title="拖动">${ic("drag")}</span>
        <button type="button" id="huabi-mode-toggle" class="huabi-tool-btn" title="鼠标模式（点击切换画笔）">${ic("modePointer")}</button>
        <span class="huabi-sep"></span>
        ${this._toolBtn("pen1", "huabi-color-btn", "画笔1")}
        ${this._toolBtn("pen2", "huabi-color-btn", "画笔2")}
        ${this._toolBtn("highlighter1", "huabi-color-btn", "荧光笔1")}
        ${this._toolBtn("highlighter2", "huabi-color-btn", "荧光笔2")}
        <span id="huabi-toolbar-shape-tools">${this._shapeToolsHtml()}</span>
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
      if (S.isShapeTool(toolId) || S.isTextTool(toolId))
        return this.engine.lastPenTool || S.DEFAULT_PEN_TOOL;
      return toolId;
    }

    _persistSettings() {
      this.settings.toolProfiles = this.engine.toolProfiles;
      this.settings.lastPenTool =
        this.engine.lastPenTool || this.settings.lastPenTool || S.DEFAULT_PEN_TOOL;
      this.settings.tableRows = this.engine.tableRows;
      this.settings.tableCols = this.engine.tableCols;
      this.settings.coordTicks = this.engine.coordTicks;
      this.settings.coordStart = this.engine.coordStart;
      this.settings.coordStep = this.engine.coordStep;
      this.settings.coordShowY = this.engine.coordShowY;
      this.settings.textFontSize = this.engine.textFontSize;
      this.settings.arrowEnds = this.engine.arrowEnds;
      S.saveSettings(this.settings);
    }

    _persistToolProfiles() {
      this._persistSettings();
    }

    _applyToolbarPosition() {
      const bar = this.toolbar;
      if (!bar) return;
      const pos = this.settings?.toolbarPosition;
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        bar.style.left = pos.left + "px";
        bar.style.top = pos.top + "px";
        bar.style.transform = "none";
      }
    }

    _saveToolbarPosition() {
      const bar = this.toolbar;
      if (!bar) return;
      const left = parseFloat(bar.style.left);
      const top = parseFloat(bar.style.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return;
      this.settings.toolbarPosition = {
        left: Math.round(left),
        top: Math.round(top),
      };
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

      const simpleShape =
        S.isShapeTool(toolId) &&
        !S.isEraserTool(toolId) &&
        toolId !== "table" &&
        toolId !== "axes" &&
        toolId !== "text";

      if (simpleShape) {
        body.appendChild(
          this._popoverHint(
            `线宽跟随${this.engine.lastPenTool === "pen2" ? "画笔 2" : "画笔 1"}`,
            true
          )
        );
      }

      if (!S.isEraserTool(toolId) && toolId !== "table" && toolId !== "axes" && toolId !== "text") {
        const fields = this._popoverFields();
        fields.appendChild(
          this._popoverRangeRow(
            S.isHighlighterTool(toolId) ? "粗细" : "线宽",
            1,
            24,
            profile.lineWidth || 3,
            (v) => {
              this.engine.setProfile(profileId, { lineWidth: v });
              this._persistToolProfiles();
            }
          )
        );
        if (S.isHighlighterTool(toolId)) {
          const alphaPct = Math.round((profile.highlightAlpha ?? 0.5) * 100);
          fields.appendChild(
            this._popoverRangeRow("透明度", 20, 80, alphaPct, (v) => {
              this.engine.setProfile(profileId, { highlightAlpha: v / 100 });
              this._persistToolProfiles();
            })
          );
        }
        body.appendChild(fields);
      }

      if (toolId === "arrowLine") {
        const row = document.createElement("label");
        row.className = "huabi-popover-row";
        const span = document.createElement("span");
        span.textContent = "箭头";
        const sel = document.createElement("select");
        sel.innerHTML =
          '<option value="end">终点</option><option value="both">两端</option>';
        sel.value = this.settings.arrowEnds === "both" ? "both" : "end";
        sel.addEventListener("change", () => {
          const ends = sel.value === "both" ? "both" : "end";
          this.settings.arrowEnds = ends;
          this.engine.arrowEnds = ends;
          this._persistSettings();
        });
        row.appendChild(span);
        row.appendChild(sel);
        body.appendChild(row);
      }

      if (S.isEraserTool(toolId)) {
        const fields = this._popoverFields();
        fields.appendChild(
          this._popoverRangeRow(
            "大小",
            4,
            48,
            profile.lineWidth || 16,
            (v) => {
              this.engine.setProfile("eraser", { lineWidth: v });
              this._persistToolProfiles();
              this._updateCanvasCursors("eraser");
            }
          )
        );
        body.appendChild(fields);
      }

      if (toolId === "table") {
        const fields = this._popoverFields();
        fields.appendChild(
          this._popoverRangeRow("线宽", 1, 24, profile.lineWidth || 3, (v) => {
            this.engine.setProfile(profileId, { lineWidth: v });
            this._persistToolProfiles();
          })
        );
        const grid = document.createElement("div");
        grid.className = "huabi-popover-grid-2";
        grid.appendChild(
          this._popoverNumberRow("行数", this.engine.tableRows, (v) => {
            this.engine.tableRows = v;
            this.settings.tableRows = v;
            this._persistToolProfiles();
          })
        );
        grid.appendChild(
          this._popoverNumberRow("列数", this.engine.tableCols, (v) => {
            this.engine.tableCols = v;
            this.settings.tableCols = v;
            this._persistToolProfiles();
          })
        );
        fields.appendChild(grid);
        body.appendChild(fields);
        body.appendChild(this._popoverHint("拖拽绘制表格外框"));
      }

      if (toolId === "axes") {
        const fields = this._popoverFields();
        fields.appendChild(
          this._popoverRangeRow("线宽", 1, 24, profile.lineWidth || 3, (v) => {
            this.engine.setProfile(profileId, { lineWidth: v });
            this._persistToolProfiles();
          })
        );
        fields.appendChild(
          this._popoverNumberRow("刻度数", this.engine.coordTicks, (v) => {
            this.engine.coordTicks = v;
            this.settings.coordTicks = v;
            this._persistToolProfiles();
          })
        );
        fields.appendChild(
          this._popoverNumberRow(
            "起始值",
            this.engine.coordStart,
            (v) => {
              this.engine.coordStart = v;
              this.settings.coordStart = v;
              this._persistToolProfiles();
            },
            { min: -10000, max: 10000 }
          )
        );
        fields.appendChild(
          this._popoverNumberRow(
            "跨度",
            this.engine.coordStep,
            (v) => {
              this.engine.coordStep = v;
              this.settings.coordStep = v;
              this._persistToolProfiles();
            },
            { min: 0.1, max: 10000, step: "any" }
          )
        );
        fields.appendChild(
          this._popoverCheckboxRow("显示 Y 轴", this.engine.coordShowY, (on) => {
            this.engine.coordShowY = on;
            this.settings.coordShowY = on;
            this._persistToolProfiles();
          })
        );
        body.appendChild(fields);
        body.appendChild(
          this._popoverHint(
            "仅 X 轴：从左起按「起始 + i×跨度」标注（默认 0,1,2…）。勾选 Y 轴后：交点为原点，X 下左负右正，Y 左侧上正下负。拖拽划定区域。"
          )
        );
      }

      if (toolId === "text") {
        const fields = this._popoverFields();
        const pagePx = S.getPageDefaultFontSize();
        const autoPx = S.getDefaultTextFontSize();
        const stored = this.settings.textFontSize ?? 0;
        body.appendChild(
          this._popoverHint(
            `颜色跟随${this.engine.lastPenTool === "pen2" ? "画笔 2" : "画笔 1"}；网页默认约 ${pagePx}px，自动字号 ${autoPx}px`,
            true
          )
        );
        fields.appendChild(
          this._popoverNumberRow(
            "字号",
            stored,
            (v) => {
              const px = Math.max(0, Math.min(120, v));
              this.settings.textFontSize = px;
              this.engine.textFontSize = px;
              this._persistToolProfiles();
            },
            { min: 0, max: 120 }
          )
        );
        body.appendChild(fields);
        body.appendChild(
          this._popoverHint(
            "画笔模式：点击空白新建，单击选中拖动，双击编辑；输入时点击空白遮罩确认。鼠标模式：点网页操作页面，点中文字/形状可选中拖动。Delete/Backspace 删除选中项。升级前旧标注不可点选。"
          )
        );
      }

      if (S.isShapeTool(toolId)) {
        body.appendChild(
          this._popoverHint("绘制完成后自动切换为鼠标模式，便于选中、移动与删除。")
        );
      }

      this.toolPopover.hidden = false;
      this.toolbar.querySelectorAll(".huabi-tool-caret").forEach((c) => {
        c.classList.toggle("huabi-caret-open", c.dataset.toolCaret === toolId);
      });
      this._positionToolPopover(anchor);
    }

    _popoverFields() {
      const el = document.createElement("div");
      el.className = "huabi-popover-fields";
      return el;
    }

    _popoverHint(text, top = false) {
      const p = document.createElement("p");
      p.className = top ? "huabi-popover-hint huabi-popover-hint--top" : "huabi-popover-hint";
      p.textContent = text;
      return p;
    }

    _popoverCheckboxRow(label, checked, onChange) {
      const row = document.createElement("label");
      row.className = "huabi-popover-row huabi-popover-check";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!checked;
      input.addEventListener("change", () => onChange(input.checked));
      row.appendChild(span);
      row.appendChild(input);
      return row;
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

    _popoverNumberRow(label, value, onChange, opts = {}) {
      const min = opts.min ?? 1;
      const max = opts.max ?? 20;
      const row = document.createElement("label");
      row.className = "huabi-popover-row";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      const sync = () => {
        const raw = Number(input.value);
        const v = Number.isFinite(raw)
          ? Math.max(min, Math.min(max, raw))
          : min;
        input.value = String(v);
        onChange(v);
      };
      if (opts.step != null) input.step = String(opts.step);
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

      const activeTool = engine.tool;
      bar.querySelectorAll("[data-tool]").forEach((b) => {
        b.classList.toggle("huabi-active-tool", b.dataset.tool === activeTool);
      });

      const modeBtn = bar.querySelector("#huabi-mode-toggle");
      if (modeBtn) {
        modeBtn.classList.remove("huabi-active-tool");
        modeBtn.classList.toggle("huabi-mode-active", !this.brushMode);
        modeBtn.title = this.brushMode
          ? "画笔模式（点击切换为鼠标）"
          : "鼠标模式：点网页操作页面，点中标注可选中移动（点击切换为画笔）";
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
      if (S.isShapeTool(tool) || S.isTextTool(tool)) t = this.engine.lastPenTool || S.DEFAULT_PEN_TOOL;
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
      const eraserActive = this.brushMode && isEraser;
      this.root.classList.toggle("huabi-tool-eraser", eraserActive);

      let cursor = "default";
      if (this.active && this.brushMode && C) {
        if (isEraser) {
          const er = this.engine.getProfile("eraser");
          cursor = C.eraser(Math.max(er.lineWidth || 16, 8));
        } else if (S.isTextTool(id)) {
          cursor = "text";
        } else {
          const color = this._getBrushCursorColor();
          if (S.isPenTool(id)) cursor = C.pen(color);
          else if (S.isHighlighterTool(id)) cursor = C.highlighter(color);
          else cursor = C.brush(color);
        }
      }

      [
        this.canvasWrap,
        this.highlightCanvas,
        this.mainCanvas,
        this.shapeCanvas,
        this.textCanvas,
        this.previewCanvas,
      ].forEach(
        (el) => {
          if (!el) return;
          el.classList.toggle("huabi-eraser-active", eraserActive);
          if (this.active && this.brushMode) {
            el.style.setProperty("cursor", cursor, "important");
          } else {
            el.style.removeProperty("cursor");
          }
        }
      );
    }

    _clearCanvasSelection() {
      this._selectedCanvasObject = null;
      this.engine?.clearPreview();
    }

    _selectionBounds(sel) {
      if (!sel) return null;
      if (sel.kind === "text") {
        const t = this.engine.textItems.find((i) => i.id === sel.id);
        if (!t) return null;
        return { left: t.x, top: t.y, width: t.w, height: t.h };
      }
      const s = this.engine.shapeItems.find((i) => i.id === sel.id);
      if (!s) return null;
      const b = this.engine._shapeBounds(s);
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }

    _renderCanvasSelection() {
      this.engine.clearPreview();
      const bounds = this._selectionBounds(this._selectedCanvasObject);
      if (!bounds) {
        this._selectedCanvasObject = null;
        return;
      }
      const ctx = this.engine.previewCtx;
      const pad = 4;
      ctx.save();
      ctx.strokeStyle = "#0078d4";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        bounds.left - pad,
        bounds.top - pad,
        bounds.width + pad * 2,
        bounds.height + pad * 2
      );
      ctx.restore();
    }

    _selectCanvasObject(hit) {
      this._selectedCanvasObject = { kind: hit.kind, id: hit.item.id };
      this._renderCanvasSelection();
    }

    _deleteSelectedCanvasObject() {
      const sel = this._selectedCanvasObject;
      if (!sel) return;
      if (sel.kind === "text") {
        if (!this.engine.textItems.some((t) => t.id === sel.id)) {
          this._clearCanvasSelection();
          return;
        }
        this.engine.pushHistory();
        this.engine.removeTextItem(sel.id);
        this.engine.renderTexts();
      } else {
        if (!this.engine.shapeItems.some((s) => s.id === sel.id)) {
          this._clearCanvasSelection();
          return;
        }
        this.engine.pushHistory();
        this.engine.removeShapeItem(sel.id);
        this.engine.renderShapes();
      }
      this._clearCanvasSelection();
    }

    _pageInteractiveSelector() {
      return [
        "button",
        "a[href]",
        "input",
        "select",
        "textarea",
        "label",
        "summary",
        "iframe",
        "[contenteditable]",
        '[contenteditable="true"]',
        '[role="button"]',
        '[role="textbox"]',
        '[role="combobox"]',
        '[onclick]',
        ".monaco-editor",
        ".cm-editor",
        ".CodeMirror",
        ".ace_editor",
        '[class*="close"]',
        ".el-dialog__close",
        ".el-dialog__headerbtn",
        ".ant-modal-close",
        ".anticon-close",
      ].join(", ");
    }

    _isPageInteractive(el) {
      if (!el?.closest) return false;
      if (el.closest("#huabi-root")) return false;
      return !!el.closest(this._pageInteractiveSelector());
    }

    _resolvePagePassTarget(el) {
      if (!el) return null;
      const sel = this._pageInteractiveSelector();
      const interactive = el.closest(sel);
      if (interactive && !interactive.closest("#huabi-root")) return interactive;
      if (!el.closest("#huabi-root")) return el;
      return null;
    }

    _resolveFocusableFromPassTarget(el) {
      if (!el) return null;
      if (el.closest?.("#huabi-root")) return null;
      const tag = el.tagName?.toLowerCase();
      if (tag === "iframe") return el;
      const inner = el.querySelector?.(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable], [contenteditable="true"]'
      );
      if (inner) return inner;
      if (
        typeof el.matches === "function" &&
        el.matches(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable], [contenteditable="true"]'
        )
      ) {
        return el;
      }
      return el;
    }

    _findPagePassTarget(clientX, clientY) {
      const stack = document.elementsFromPoint(clientX, clientY);
      let fallback = null;
      for (const el of stack) {
        if (!el?.closest || el.closest("#huabi-root")) continue;
        if (el.tagName === "IFRAME") return el;
        if (!fallback) fallback = el;
        if (this._isPageInteractive(el)) {
          return this._resolvePagePassTarget(el);
        }
      }
      return this._resolvePagePassTarget(fallback);
    }

    _clickIframeTarget(iframe, e) {
      try {
        iframe.focus();
      } catch {
        /* ignore */
      }
      const rect = iframe.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      let doc;
      try {
        doc = iframe.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc) {
        try {
          iframe.click();
        } catch {
          /* ignore */
        }
        return;
      }
      const inner = doc.elementFromPoint(localX, localY);
      if (!inner) {
        try {
          iframe.click();
        } catch {
          /* ignore */
        }
        return;
      }
      const win = iframe.contentWindow;
      const innerFocus = this._resolveFocusableFromPassTarget(inner) || inner;
      const opts = {
        bubbles: true,
        cancelable: true,
        view: win,
        clientX: localX,
        clientY: localY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: 0,
        buttons: 0,
      };
      try {
        if (typeof innerFocus.click === "function") {
          innerFocus.click();
          if (typeof innerFocus.focus === "function") {
            try {
              innerFocus.focus({ preventScroll: true });
            } catch {
              innerFocus.focus();
            }
          }
          return;
        }
      } catch {
        /* ignore */
      }
      innerFocus.dispatchEvent(new MouseEvent("mousedown", opts));
      innerFocus.dispatchEvent(new MouseEvent("mouseup", opts));
      innerFocus.dispatchEvent(new MouseEvent("click", opts));
      try {
        innerFocus.focus?.();
      } catch {
        /* ignore */
      }
    }

    _clickPageTarget(target, e) {
      const resolved = this._resolvePagePassTarget(target);
      const el = this._resolveFocusableFromPassTarget(resolved);
      if (!el) return;
      if (el.tagName === "IFRAME") {
        this._clickIframeTarget(el, e);
        return;
      }
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: 0,
        buttons: 0,
      };
      const focusable =
        typeof el.matches === "function" &&
        el.matches(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
        );
      try {
        if (typeof el.click === "function") {
          el.click();
          if (focusable && typeof el.focus === "function") {
            try {
              el.focus({ preventScroll: true });
            } catch {
              el.focus();
            }
          }
          return;
        }
      } catch {
        /* ignore */
      }
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    }

    _openTextEditorForItem(item) {
      this._clearCanvasSelection();
      this._openTextEditor(item.x, item.y, {
        editId: item.id,
        initialText: item.text,
        fontSize: item.fontSize,
        color: item.color,
      });
    }

    selectTool(toolId) {
      this._stopObjectDrag?.();
      if (toolId !== "text") {
        this._clearCanvasSelection();
      }
      if (toolId !== "text") this._closeTextEditor(false);
      if (this._popoverTool && this._popoverTool !== toolId) {
        this._closeToolPopover();
      }
      this.engine.tool = toolId;
      if (S.isPenTool(toolId)) {
        this.engine.lastPenTool = toolId;
        this.settings.lastPenTool = toolId;
        this._persistSettings();
      }
      const drawTools = S.getAllToolIds();
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
          : "鼠标模式：点网页操作页面，点中标注可选中移动（点击切换为画笔）";
      }
      if (this._selectedCanvasObject) this._renderCanvasSelection();
      this.syncToolbarFromTool();
    }

    toggleBrushMode() {
      this.brushMode = !this.brushMode;
      if (!this.brushMode) {
        this.root?.classList.remove("huabi-drawing", "huabi-erasing");
      }
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

    _closeTextEditor(commit) {
      if (!this._textEditor) return;
      const { el, layer, x, y, editId, fontSize, color } = this._textEditor;
      const text = el.value;
      layer?.remove();
      this._textEditor = null;
      this.root?.classList.remove("huabi-text-editing");
      if (commit) {
        if (text.trim()) {
          this._commitTextToCanvas(text, x, y, { editId, fontSize, color });
        } else if (editId) {
          this.engine.pushHistory();
          this.engine.renderTexts();
        }
      } else if (editId) {
        this.engine.undo();
      }
    }

    async _commitTextToCanvas(text, x, y, opts = {}) {
      const { editId, fontSize: fs, color: col } = opts;
      await S.ensureTextFont();
      const fontSize = fs ?? S.resolveTextFontSize(this.settings, this.engine);
      const color = col ?? this.engine.getProfile(this.engine.lastPenTool || S.DEFAULT_PEN_TOOL).color;
      this.engine.pushHistory();
      if (editId) {
        this.engine.updateTextItem(editId, { text, x, y, fontSize, color });
      } else {
        this.engine.addTextItem({ text, x, y, fontSize, color });
      }
      this.engine.renderTexts();
    }

    async _openTextEditor(x, y, opts = {}) {
      this._closeTextEditor(false);
      this._closeToolPopover();
      await S.ensureTextFont();
      const editId = opts.editId ?? null;
      const fontSize = opts.fontSize ?? S.resolveTextFontSize(this.settings, this.engine);
      const color =
        opts.color ?? this.engine.getProfile(this.engine.lastPenTool || S.DEFAULT_PEN_TOOL).color;
      if (editId) {
        this.engine.pushHistory();
        this.engine.removeTextItem(editId);
        this.engine.renderTexts();
      }
      const wrap = document.createElement("div");
      wrap.className = "huabi-text-editor-wrap";
      const ta = document.createElement("textarea");
      ta.className = "huabi-text-editor";
      ta.rows = 1;
      ta.placeholder = "输入文字…";
      ta.style.fontFamily = S.getTextFontCss();
      ta.style.fontSize = `${fontSize}px`;
      ta.style.color = color;
      if (opts.initialText) ta.value = opts.initialText;
      wrap.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 160))}px`;
      wrap.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 48))}px`;
      wrap.appendChild(ta);
      wrap.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        if (ev.target !== ta) {
          ev.preventDefault();
          ta.focus();
        }
      });

      const layer = document.createElement("div");
      layer.className = "huabi-text-editing-layer";
      const backdrop = document.createElement("div");
      backdrop.className = "huabi-text-editing-backdrop";
      backdrop.title = "点击确认文字";
      backdrop.addEventListener(
        "pointerdown",
        (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          this._closeTextEditor(true);
        },
        true
      );
      layer.appendChild(backdrop);
      layer.appendChild(wrap);
      this.root.appendChild(layer);

      this._textEditor = { el: ta, layer, x, y, editId, fontSize, color };
      this.root.classList.add("huabi-text-editing");
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          this._closeTextEditor(false);
        }
      });
      requestAnimationFrame(() => ta.focus());
    }

    _canCanvasInteract() {
      if (!this.active) return false;
      if (this.brushMode) return true;
      return true;
    }

    _bindCanvasEvents(wrap) {
      const skipTarget = (el) =>
        el.closest(
          "#huabi-toolbar, #huabi-tool-popover, #huabi-settings-backdrop, #huabi-settings-panel, .huabi-text-editing-layer, .huabi-text-editor-wrap"
        );

      const stopTrack = () => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", up, true);
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", up, true);
      };

      const OBJECT_DRAG_THRESHOLD = 4;
      const PAGE_CLICK_MOVE_THRESHOLD = 6;
      let objectDrag = null;
      let pagePassTarget = null;
      let pagePassStartX = 0;
      let pagePassStartY = 0;

      const stopObjectTrack = () => {
        window.removeEventListener("pointermove", objectMove, true);
        window.removeEventListener("pointerup", objectUp, true);
        window.removeEventListener("pointercancel", objectUp, true);
        window.removeEventListener("mousemove", objectMove, true);
        window.removeEventListener("mouseup", objectUp, true);
        objectDrag = null;
        pagePassTarget = null;
        pagePassStartX = 0;
        pagePassStartY = 0;
        this.root?.classList.remove("huabi-object-dragging");
      };

      const startPagePassTrack = (pageTarget, e) => {
        if (this._selectedCanvasObject) this._clearCanvasSelection();
        pagePassTarget = pageTarget;
        pagePassStartX = e.clientX;
        pagePassStartY = e.clientY;
        window.addEventListener("pointermove", objectMove, true);
        window.addEventListener("pointerup", objectUp, true);
        window.addEventListener("pointercancel", objectUp, true);
        window.addEventListener("mousemove", objectMove, true);
        window.addEventListener("mouseup", objectUp, true);
        e.preventDefault();
        e.stopPropagation();
      };

      const startObjectDrag = (hit, x, y) => {
        this._selectCanvasObject(hit);
        stopObjectTrack();
        if (hit.kind === "text") {
          objectDrag = {
            kind: "text",
            id: hit.item.id,
            pointerX: x,
            pointerY: y,
            itemX: hit.item.x,
            itemY: hit.item.y,
            dragging: false,
          };
        } else {
          objectDrag = {
            kind: "shape",
            id: hit.item.id,
            pointerX: x,
            pointerY: y,
            x1: hit.item.x1,
            y1: hit.item.y1,
            x2: hit.item.x2,
            y2: hit.item.y2,
            dragging: false,
          };
        }
        window.addEventListener("pointermove", objectMove, true);
        window.addEventListener("pointerup", objectUp, true);
        window.addEventListener("pointercancel", objectUp, true);
        window.addEventListener("mousemove", objectMove, true);
        window.addEventListener("mouseup", objectUp, true);
      };

      const objectMove = (e) => {
        if (pagePassTarget && !objectDrag) return;
        if (!objectDrag) return;
        const { x, y } = this.engine.getPos(e);
        const dx = x - objectDrag.pointerX;
        const dy = y - objectDrag.pointerY;
        if (!objectDrag.dragging) {
          if (Math.hypot(dx, dy) < OBJECT_DRAG_THRESHOLD) return;
          objectDrag.dragging = true;
          this.engine.pushHistory();
          this.root?.classList.add("huabi-object-dragging");
        }
        if (objectDrag.kind === "text") {
          this.engine.updateTextItem(objectDrag.id, {
            x: objectDrag.itemX + dx,
            y: objectDrag.itemY + dy,
          });
          this.engine.renderTexts();
        } else {
          this.engine.updateShapeItem(objectDrag.id, {
            x1: objectDrag.x1 + dx,
            y1: objectDrag.y1 + dy,
            x2: objectDrag.x2 + dx,
            y2: objectDrag.y2 + dy,
          });
          this.engine.renderShapes();
        }
        this._renderCanvasSelection();
        e.preventDefault();
      };

      const objectUp = (e) => {
        if (objectDrag) {
          if (e.button !== 0 && e.type === "mouseup") return;
          stopObjectTrack();
          e.preventDefault();
          return;
        }
        if (pagePassTarget) {
          if (e.button !== 0 && e.type === "mouseup") return;
          const moved = Math.hypot(e.clientX - pagePassStartX, e.clientY - pagePassStartY);
          if (moved <= PAGE_CLICK_MOVE_THRESHOLD) {
            this._clickPageTarget(pagePassTarget, e);
          }
          stopObjectTrack();
          e.preventDefault();
        }
      };

      /** 鼠标模式：画布 pointer-events:none，仅在命中标注对象时拦截 */
      const mouseModeDown = (e) => {
        if (!this.active || this.brushMode) return;
        if (!this._canCanvasInteract()) return;
        if (this._textEditor) return;
        if (this.settingsPanel?.visible) return;
        if (skipTarget(e.target)) return;
        if (e.button !== 0) return;
        const { x, y } = this.engine.getPos(e);
        const hit = this.engine.hitTestCanvasObject(x, y);
        if (!hit) return;
        startObjectDrag(hit, x, y);
        e.preventDefault();
        e.stopPropagation();
      };

      const bindDown = (e) => {
        if (!this.brushMode) return;
        if (!this._canCanvasInteract()) return;
        if (this._textEditor) return;
        if (this.settingsPanel?.visible) return;
        if (skipTarget(e.target)) return;
        if (e.button !== 0) return;
        const toolId = this._resolveActiveToolId();
        const { x, y } = this.engine.getPos(e);
        const pageTarget = this._findPagePassTarget(e.clientX, e.clientY);
        const pageInteractive = pageTarget && this._isPageInteractive(pageTarget);

        const brushCanvasHit =
          toolId === "text"
            ? this.engine.hitTestText(x, y)
            : S.isShapeTool(toolId)
              ? this.engine.hitTestCanvasObject(x, y)
              : null;
        if (pageInteractive && !brushCanvasHit && pageTarget) {
          startPagePassTrack(pageTarget, e);
          return;
        }

        if (toolId === "text") {
          const hit = this.engine.hitTestText(x, y);
          if (hit) {
            startObjectDrag(hit, x, y);
          } else {
            stopObjectTrack();
            this._clearCanvasSelection();
            this._openTextEditor(x, y);
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (S.isShapeTool(toolId)) {
          const hit = this.engine.hitTestCanvasObject(x, y);
          if (hit) {
            startObjectDrag(hit, x, y);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

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
        if (this.engine.onPointerUp(e)) {
          this.setBrushMode(false);
        }
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
      document.addEventListener("pointerdown", mouseModeDown, true);

      const onCanvasDblClick = (e) => {
        if (!this._canCanvasInteract()) return;
        if (this._textEditor) return;
        if (this.settingsPanel?.visible) return;
        if (skipTarget(e.target)) return;
        const { x, y } = this.engine.getPos(e);
        const hit = this.engine.hitTestText(x, y);
        if (!hit) return;
        if (this.brushMode && this._resolveActiveToolId() !== "text") return;
        this._openTextEditorForItem(hit.item);
        e.preventDefault();
        e.stopPropagation();
      };

      wrap.addEventListener("dblclick", onCanvasDblClick, true);
      document.addEventListener("dblclick", (e) => {
        if (!this.active || this.brushMode) return;
        onCanvasDblClick(e);
      }, true);

      this._stopObjectDrag = stopObjectTrack;
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
        if (dragging) this._saveToolbarPosition();
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

    _bindShapeToolButtons() {
      this.toolbar?.querySelectorAll("#huabi-toolbar-shape-tools [data-tool]").forEach((btn) => {
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
    }

    _bindToolbarActions() {
      const bar = this.toolbar;
      const engine = this.engine;

      bar.querySelector("#huabi-mode-toggle").addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleBrushMode();
      });

      bar
        .querySelectorAll(
          ".huabi-color-btn[data-tool], [data-tool='eraser']"
        )
        .forEach((btn) => {
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
      this._bindShapeToolButtons();

      bar.querySelector("#huabi-open-settings").addEventListener("click", (e) => {
        e.stopPropagation();
        this._closeToolPopover();
        this.settingsPanel.toggle();
      });

      bar.querySelector("#huabi-undo").addEventListener("click", (e) => {
        e.stopPropagation();
        engine.undo();
        this._clearCanvasSelection();
      });
      bar.querySelector("#huabi-redo").addEventListener("click", (e) => {
        e.stopPropagation();
        engine.redo();
        this._clearCanvasSelection();
      });
      bar.querySelector("#huabi-clear").addEventListener("click", (e) => {
        e.stopPropagation();
        this._clearCanvasSelection();
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
      if (el.closest?.(".huabi-text-editor-wrap")) return true;
      if (this.root?.contains(el)) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        return false;
      }
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    }

    _onKeyDown(e) {
      if (!this.active) return;
      if (this._textEditor) return;
      if (this.settingsPanel?.visible) return;
      if (this._isEditableTarget()) return;
      const shortcuts = this.settings.shortcuts || S.DEFAULT_SHORTCUTS;

      if (K.matchShortcut(e, shortcuts.toggleDrawMode)) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleBrushMode();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (this._selectedCanvasObject) {
          e.preventDefault();
          e.stopPropagation();
          this._deleteSelectedCanvasObject();
          return;
        }
      }
      if (e.key === "Enter" && this._selectedCanvasObject?.kind === "text") {
        const item = this.engine.textItems.find(
          (t) => t.id === this._selectedCanvasObject.id
        );
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          this._openTextEditorForItem(item);
          return;
        }
      }

      if (!this.brushMode) {
        if (K.matchShortcut(e, shortcuts.eraser)) {
          e.preventDefault();
          e.stopPropagation();
          this.selectTool("eraser");
        }
        return;
      }

      for (const id of S.getAllToolIds()) {
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
        this._clearCanvasSelection();
        return;
      }
      if (K.matchShortcut(e, shortcuts.redo)) {
        e.preventDefault();
        e.stopPropagation();
        this.engine.redo();
        this._clearCanvasSelection();
        return;
      }
      if (shortcuts.clear && K.matchShortcut(e, shortcuts.clear)) {
        e.preventDefault();
        e.stopPropagation();
        this._clearCanvasSelection();
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
        this.engine.tableRows = this.settings.tableRows ?? 3;
        this.engine.tableCols = this.settings.tableCols ?? 3;
        this.engine.coordTicks = this.settings.coordTicks ?? 5;
        this.engine.coordStart = this.settings.coordStart ?? 0;
        this.engine.coordStep = this.settings.coordStep ?? 1;
        this.engine.coordShowY = this.settings.coordShowY === true;
        this.engine.textFontSize = this.settings.textFontSize ?? 0;
        this.engine.arrowEnds =
          this.settings.arrowEnds === "both" ? "both" : "end";
        this.engine.resize();
        this.setBrushMode(true);
        this.selectTool(this.settings.lastPenTool || S.DEFAULT_PEN_TOOL);
        this._updatePenButtonColors();
      } else {
        this.setBrushMode(false);
        this.settingsPanel.hide();
        this._closeToolPopover();
        this._closeTextEditor(false);
        this._clearCanvasSelection();
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
      tctx.drawImage(this.shapeCanvas, 0, 0);
      tctx.drawImage(this.textCanvas, 0, 0);
      const url = tmp.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "晨曦画笔-" + Date.now() + ".png";
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
          this.engine.lastPenTool = s.lastPenTool || S.DEFAULT_PEN_TOOL;
          this.engine.tableRows = s.tableRows ?? 3;
          this.engine.tableCols = s.tableCols ?? 3;
          this.engine.coordTicks = s.coordTicks ?? 5;
          this.engine.coordStart = s.coordStart ?? 0;
          this.engine.coordStep = s.coordStep ?? 1;
          this.engine.coordShowY = s.coordShowY === true;
          this.settings.tableRows = s.tableRows ?? 3;
          this.settings.tableCols = s.tableCols ?? 3;
          this.settings.coordTicks = s.coordTicks ?? 5;
          this.settings.coordStart = s.coordStart ?? 0;
          this.settings.coordStep = s.coordStep ?? 1;
          this.settings.coordShowY = s.coordShowY === true;
          this.engine.textFontSize = s.textFontSize ?? 0;
          this.settings.textFontSize = s.textFontSize ?? 0;
          this.engine.arrowEnds = s.arrowEnds === "both" ? "both" : "end";
          this.syncToolbarFromTool();
          this._updatePenButtonColors();
          this._applyToolbarPosition();
          this._rebuildToolbarTools();
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
