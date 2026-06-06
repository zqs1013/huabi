(function () {
  const S = window.HuabiSettings;
  const K = window.HuabiShortcuts;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  async function mount(container, options) {
    if (container._huabiFormDestroy) {
      container._huabiFormDestroy();
      container._huabiFormDestroy = null;
    }

    await S.ensureTextFontsReady();

    const settings = options.settings;
    let recordingId = null;
    const state = { settings };

    container.innerHTML = "";
    container.classList.add("huabi-settings-form");

    const status = el("p", "huabi-form-status");
    status.hidden = true;
    container.appendChild(status);

    const recordHint = el("p", "huabi-record-hint");
    recordHint.textContent = "请按下新的快捷键…";
    recordHint.hidden = true;
    container.appendChild(recordHint);

    const pressureSec = el("section", "huabi-form-section huabi-pressure-section");
    const pressureHead = el("div", "huabi-settings-row-head");
    pressureHead.appendChild(el("h3", "", "数位板压感"));
    const pressurePopBtn = el("button", "huabi-settings-pop-trigger");
    pressurePopBtn.type = "button";
    pressurePopBtn.title = "压感设置";
    pressurePopBtn.setAttribute("aria-label", "压感设置");
    pressurePopBtn.setAttribute("aria-expanded", "false");
    pressurePopBtn.textContent = "▾";
    pressureHead.appendChild(pressurePopBtn);
    pressureSec.appendChild(pressureHead);
    pressureSec.appendChild(
      el(
        "p",
        "huabi-form-hint huabi-form-hint--tight",
        "默认开启：画笔、荧光笔、橡皮擦线宽随手写笔压力变化。画笔/荧光笔颜色与线宽请在工具栏对应工具 ▾ 中调整。"
      )
    );

    const pressurePop = el("div", "huabi-settings-popover");
    pressurePop.hidden = true;

    const pressureEnableLabel = el("label", "huabi-toolbar-visible-item");
    const pressureEnableInp = document.createElement("input");
    pressureEnableInp.type = "checkbox";
    pressureEnableInp.checked = state.settings.pressureEnabled !== false;
    pressureEnableInp.dataset.field = "pressure-enabled";
    pressureEnableInp.addEventListener("change", scheduleAutoSave);
    pressureEnableLabel.appendChild(pressureEnableInp);
    pressureEnableLabel.appendChild(document.createTextNode("启用压感"));
    pressurePop.appendChild(pressureEnableLabel);

    const penOnlyLabel = el("label", "huabi-toolbar-visible-item");
    const penOnlyInp = document.createElement("input");
    penOnlyInp.type = "checkbox";
    penOnlyInp.checked = state.settings.pressurePenOnly !== false;
    penOnlyInp.dataset.field = "pressure-pen-only";
    penOnlyInp.addEventListener("change", scheduleAutoSave);
    penOnlyLabel.appendChild(penOnlyInp);
    penOnlyLabel.appendChild(document.createTextNode("仅手写笔生效"));
    pressurePop.appendChild(penOnlyLabel);

    const minRatioInp = document.createElement("input");
    minRatioInp.type = "number";
    minRatioInp.min = "0.1";
    minRatioInp.max = "2";
    minRatioInp.step = "0.05";
    minRatioInp.value = String(
      state.settings.pressureMinRatio ?? S.DEFAULT_PRESSURE_MIN_RATIO
    );
    minRatioInp.dataset.field = "pressure-min-ratio";
    minRatioInp.addEventListener("change", scheduleAutoSave);
    pressurePop.appendChild(labelRow("最细倍数", minRatioInp));

    const maxRatioInp = document.createElement("input");
    maxRatioInp.type = "number";
    maxRatioInp.min = "0.1";
    maxRatioInp.max = "2";
    maxRatioInp.step = "0.05";
    maxRatioInp.value = String(
      state.settings.pressureMaxRatio ?? S.DEFAULT_PRESSURE_MAX_RATIO
    );
    maxRatioInp.dataset.field = "pressure-max-ratio";
    maxRatioInp.addEventListener("change", scheduleAutoSave);
    pressurePop.appendChild(labelRow("最粗倍数", maxRatioInp));

    pressurePop.appendChild(
      el("p", "huabi-form-hint", "相对工具栏 ▾ 中的线宽，轻压为最细、重压为最粗（默认 0.35～1.0）。")
    );
    pressureSec.appendChild(pressurePop);
    container.appendChild(pressureSec);

    let pressurePopOpen = false;
    const closePressurePop = () => {
      pressurePopOpen = false;
      pressurePop.hidden = true;
      pressurePopBtn.classList.remove("huabi-settings-pop-open");
      pressurePopBtn.setAttribute("aria-expanded", "false");
    };
    const togglePressurePop = () => {
      pressurePopOpen = !pressurePopOpen;
      pressurePop.hidden = !pressurePopOpen;
      pressurePopBtn.classList.toggle("huabi-settings-pop-open", pressurePopOpen);
      pressurePopBtn.setAttribute("aria-expanded", pressurePopOpen ? "true" : "false");
    };
    pressurePopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePressurePop();
    });
    pressurePop.addEventListener("click", (e) => e.stopPropagation());
    const onDocClickClosePressure = (e) => {
      if (!pressurePopOpen) return;
      if (pressureSec.contains(e.target)) return;
      closePressurePop();
    };
    document.addEventListener("click", onDocClickClosePressure, true);

    const textSec = el("section", "huabi-form-section");
    textSec.appendChild(el("h3", "", "文字工具"));
    textSec.appendChild(
      el(
        "p",
        "huabi-form-hint",
        "新建或编辑文字时的默认字体。把字体文件放进扩展的 content/fonts 文件夹后，在 chrome://extensions 重新加载本扩展即可自动出现在下方列表（开发时也可运行 npm run fonts:watch 监听目录）。"
      )
    );
    const fontSel = document.createElement("select");
    fontSel.className = "huabi-text-font-select";

    const fillFontSelect = () => {
      const prev = fontSel.value;
      fontSel.innerHTML = "";
      const builtinGroup = document.createElement("optgroup");
      builtinGroup.label = "内置";
      S.BUILTIN_TEXT_FONT_OPTIONS.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        builtinGroup.appendChild(o);
      });
      fontSel.appendChild(builtinGroup);
      const bundled = S.getTextFontOptions().filter((o) => o.needBundle && o.file);
      if (bundled.length) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = "自定义（content/fonts）";
        bundled.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.id;
          o.textContent = opt.label;
          customGroup.appendChild(o);
        });
        fontSel.appendChild(customGroup);
      }
      fontSel.value = S.normalizeTextFontFamily(prev || state.settings.textFontFamily);
    };

    fillFontSelect();

    const btnRefreshFonts = el("button", "huabi-btn", "刷新字体列表");
    btnRefreshFonts.type = "button";
    btnRefreshFonts.addEventListener("click", () => {
      btnRefreshFonts.disabled = true;
      S.rescanBundledFonts()
        .then(async () => {
          fillFontSelect();
          const fid = S.normalizeTextFontFamily(fontSel.value);
          state.settings.textFontFamily = fid;
          const ok = await S.ensureTextFont(fid);
          updateFontPreview();
          if (options.overlay) await S.applyTextFontToOverlay(options.overlay, fid);
          const n = S.getTextFontOptions().filter((o) => o.needBundle).length;
          status.textContent = ok
            ? `已扫描 ${n} 个自定义字体，并已应用到画布`
            : `已扫描 ${n} 个字体，但当前字体加载失败，请重新加载扩展后重试`;
          status.classList.toggle("error", !ok && S.getTextFontOption(fid).needBundle);
          status.hidden = false;
        })
        .catch(() => {
          status.textContent = "扫描字体失败";
          status.classList.add("error");
          status.hidden = false;
        })
        .finally(() => {
          btnRefreshFonts.disabled = false;
        });
    });
    const fontPreview = el("p", "huabi-font-preview", "晨曦画笔 — 示例文字 ABC 123");
    const updateFontPreview = async () => {
      const fid = S.normalizeTextFontFamily(fontSel.value);
      const opt = S.getTextFontOption(fid);
      let ok = true;
      if (opt.needBundle) ok = await S.ensureTextFont(fid);
      fontPreview.style.fontFamily = S.getDomFontFamily(fid);
      fontPreview.classList.toggle("huabi-font-preview--failed", opt.needBundle && !ok);
      return ok;
    };
    fontSel.addEventListener("change", () => {
      const fid = S.normalizeTextFontFamily(fontSel.value);
      state.settings.textFontFamily = fid;
      void (async () => {
        const ok = await updateFontPreview();
        if (options.overlay) await S.applyTextFontToOverlay(options.overlay, fid);
        if (!ok && S.getTextFontOption(fid).needBundle) {
          status.textContent = `字体「${S.getTextFontOption(fid).label}」加载失败，请重新加载扩展`;
          status.classList.add("error");
          status.hidden = false;
        }
        scheduleAutoSave();
      })();
    });
    void updateFontPreview();
    textSec.appendChild(labelRow("默认字体", fontSel));
    textSec.appendChild(btnRefreshFonts);
    textSec.appendChild(fontPreview);
    container.appendChild(textSec);

    const tbSec = el("section", "huabi-form-section");
    tbSec.appendChild(el("h3", "", "工具栏显示"));
    tbSec.appendChild(
      el(
        "p",
        "huabi-form-hint",
        "取消勾选后工具栏不显示该按钮；若已设置快捷键，仍可用快捷键切换工具。"
      )
    );
    if (!state.settings.toolbarVisible) {
      state.settings.toolbarVisible = S.getDefaultToolbarVisible();
    }
    const tbList = el("div", "huabi-toolbar-visible-list");
    S.TOOLBAR_SHAPE_TOOLS.forEach((t) => {
      const label = el("label", "huabi-toolbar-visible-item");
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.checked = state.settings.toolbarVisible[t.id] !== false;
      inp.dataset.toolId = t.id;
      inp.addEventListener("change", () => {
        state.settings.toolbarVisible[t.id] = inp.checked;
        scheduleAutoSave();
      });
      label.appendChild(inp);
      label.appendChild(document.createTextNode(t.label));
      tbList.appendChild(label);
    });
    tbSec.appendChild(tbList);
    container.appendChild(tbSec);

    const scSec = el("section", "huabi-form-section");
    scSec.appendChild(el("h3", "", "快捷键"));
    const scHint = el(
      "p",
      "huabi-form-hint",
      "工具快捷键在鼠标/画笔模式下均可切换工具；形状、文字等会自动进入画笔模式。撤销/重做等仅在画笔模式下响应。切换鼠标/画笔在标注会话内始终可用。Ctrl+1～9、Ctrl+T/W 等由浏览器占用，无法用于标注；切换鼠标/画笔建议用空格或 Alt+字母（如 Alt+M）。"
    );
    scSec.appendChild(scHint);
    const scTable = el("table", "huabi-shortcut-table");
    scTable.innerHTML = "<thead><tr><th>功能</th><th>快捷键</th><th></th></tr></thead>";
    const scBody = el("tbody");
    scTable.appendChild(scBody);
    scSec.appendChild(scTable);
    container.appendChild(scSec);

    const version =
      typeof chrome !== "undefined" && chrome.runtime?.getManifest
        ? chrome.runtime.getManifest().version
        : "";
    const aboutSec = el("section", "huabi-form-section huabi-about-section");
    aboutSec.appendChild(el("h3", "", "开发者介绍"));
    const aboutInfo = el("div", "huabi-about-info");
    aboutInfo.innerHTML = `
      <p class="huabi-about-row"><span>开发者</span><span>邹庆松</span></p>
      <p class="huabi-about-row"><span>电话</span><span>18603919370</span></p>
      <p class="huabi-about-row"><span>版本</span><span>v${version || "—"}</span></p>`;
    aboutSec.appendChild(aboutInfo);
    container.appendChild(aboutSec);

    const actions = el("div", "huabi-form-actions");
    const btnSave = el("button", "huabi-btn primary", "立即保存");
    btnSave.type = "button";
    let autoSaveTimer = null;
    const btnClose = el("button", "huabi-btn", "关闭");
    btnClose.type = "button";
    const btnResetSc = el("button", "huabi-btn", "恢复默认快捷键");
    btnResetSc.type = "button";
    actions.appendChild(btnSave);
    actions.appendChild(btnClose);
    actions.appendChild(btnResetSc);
    container.appendChild(actions);

    function renderShortcuts() {
      scBody.innerHTML = "";
      S.SHORTCUT_ACTIONS.forEach((action) => {
        const tr = el("tr");
        if (recordingId === action.id) tr.classList.add("recording");
        tr.dataset.actionId = action.id;
        const combo = state.settings.shortcuts[action.id] || "";
        tr.innerHTML = `
          <td>${action.label}</td>
          <td><span class="kbd">${K.formatShortcutDisplay(combo)}</span></td>
          <td class="huabi-sc-actions">
            <button type="button" data-set>设置</button>
            <button type="button" data-clear>清除</button>
          </td>`;
        tr.querySelector("[data-set]").addEventListener("click", () => {
          recordingId = action.id;
          recordHint.hidden = false;
          scBody.querySelectorAll("tr").forEach((r) => r.classList.remove("recording"));
          tr.classList.add("recording");
        });
        tr.querySelector("[data-clear]").addEventListener("click", () => {
          state.settings.shortcuts[action.id] = "";
          tr.querySelector(".kbd").textContent = K.formatShortcutDisplay("");
          scheduleAutoSave();
        });
        scBody.appendChild(tr);
      });
    }

    function labelRow(label, input) {
      const row = el("label", "huabi-label-row");
      const span = el("span", "", label);
      row.appendChild(span);
      row.appendChild(input);
      return row;
    }

    async function persistSettings() {
      collect();
      const saved = await S.saveSettings(state.settings);
      state.settings = saved;
      status.textContent = "已保存";
      status.classList.remove("error");
      status.hidden = false;
      if (options.onSave) await options.onSave(state.settings);
    }

    function scheduleAutoSave() {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        persistSettings().catch(() => {
          status.textContent = "保存失败，请重试";
          status.classList.add("error");
          status.hidden = false;
        });
      }, 400);
    }

    function collect() {
      const pe = container.querySelector('[data-field="pressure-enabled"]');
      if (pe) state.settings.pressureEnabled = pe.checked;
      const ppo = container.querySelector('[data-field="pressure-pen-only"]');
      if (ppo) state.settings.pressurePenOnly = ppo.checked;
      const pmin = container.querySelector('[data-field="pressure-min-ratio"]');
      if (pmin) state.settings.pressureMinRatio = Number(pmin.value);
      const pmax = container.querySelector('[data-field="pressure-max-ratio"]');
      if (pmax) state.settings.pressureMaxRatio = Number(pmax.value);
      Object.assign(state.settings, S.normalizePressureSettings(state.settings));
      return state.settings;
    }

    function onKeyRecord(e) {
      if (!recordingId) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        recordingId = null;
        recordHint.hidden = true;
        renderShortcuts();
        return;
      }
      const combo = K.normalizeFromEvent(e);
      if (!combo) return;
      const reserved = K.getBrowserReservedMessage(combo);
      if (reserved) {
        status.textContent = reserved;
        status.hidden = false;
        status.classList.add("error");
        return;
      }
      const conflict = K.findConflict(state.settings.shortcuts, recordingId, combo);
      if (conflict) {
        status.textContent = `与「${S.SHORTCUT_ACTIONS.find((a) => a.id === conflict)?.label}」冲突`;
        status.hidden = false;
        status.classList.add("error");
        return;
      }
      state.settings.shortcuts[recordingId] = combo;
      recordingId = null;
      recordHint.hidden = true;
      status.hidden = true;
      renderShortcuts();
      scheduleAutoSave();
    }

    document.addEventListener("keydown", onKeyRecord, true);

    btnSave.addEventListener("click", () => {
      clearTimeout(autoSaveTimer);
      persistSettings()
        .then(() => {
          if (options.onClose) options.onClose({ skipFlush: true });
        })
        .catch(() => {
          status.textContent = "保存失败，请重试";
          status.classList.add("error");
          status.hidden = false;
        });
    });

    btnClose.addEventListener("click", () => {
      if (options.onClose) options.onClose();
    });

    btnResetSc.addEventListener("click", () => {
      state.settings.shortcuts = { ...S.DEFAULT_SHORTCUTS };
      renderShortcuts();
      status.textContent = "已恢复默认快捷键（需点保存）";
      status.classList.remove("error");
      status.hidden = false;
    });

    renderShortcuts();

    const api = {
      collect,
      async flushSave() {
        clearTimeout(autoSaveTimer);
        await persistSettings();
      },
      destroy() {
        clearTimeout(autoSaveTimer);
        document.removeEventListener("keydown", onKeyRecord, true);
        document.removeEventListener("click", onDocClickClosePressure, true);
      },
      refresh(newSettings) {
        state.settings = newSettings;
        mount(container, { ...options, settings: newSettings });
      },
    };
    container._huabiFormDestroy = api.destroy;
    return api;
  }

  window.HuabiSettingsForm = { mount };
})();
