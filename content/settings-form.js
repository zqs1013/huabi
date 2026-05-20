(function () {
  const S = window.HuabiSettings;
  const K = window.HuabiShortcuts;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function mount(container, options) {
    if (container._huabiFormDestroy) {
      container._huabiFormDestroy();
      container._huabiFormDestroy = null;
    }

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

    const toolsSec = el("section", "huabi-form-section");
    toolsSec.appendChild(el("h3", "", "画笔颜色"));
    const colorHint = el(
      "p",
      "huabi-form-hint",
      "设置会自动保存到浏览器，换网页、重启后仍有效（需登录 Chrome 账号可同步到其他设备）。线宽、荧光笔透明度等请在工具栏各工具右下角 ▾ 中调整。"
    );
    toolsSec.appendChild(colorHint);

    S.COLOR_EDIT_TOOLS.forEach((toolId) => {
      toolsSec.appendChild(buildColorBlock(toolId, state));
    });
    container.appendChild(toolsSec);

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
      "工具快捷键仅在画笔模式下生效；切换鼠标/画笔在标注会话内始终可用。Ctrl+1～9、Ctrl+T/W 等由浏览器占用，无法用于标注；切换鼠标/画笔建议用空格或 Alt+字母（如 Alt+M）。"
    );
    scSec.appendChild(scHint);
    const scTable = el("table", "huabi-shortcut-table");
    scTable.innerHTML = "<thead><tr><th>功能</th><th>快捷键</th><th></th></tr></thead>";
    const scBody = el("tbody");
    scTable.appendChild(scBody);
    scSec.appendChild(scTable);
    container.appendChild(scSec);

    const actions = el("div", "huabi-form-actions");
    const btnSave = el("button", "huabi-btn primary", "立即保存");
    btnSave.type = "button";
    let autoSaveTimer = null;
    const btnResetSc = el("button", "huabi-btn", "恢复默认快捷键");
    btnResetSc.type = "button";
    const btnResetCol = el("button", "huabi-btn", "恢复默认颜色");
    btnResetCol.type = "button";
    actions.appendChild(btnSave);
    actions.appendChild(btnResetSc);
    actions.appendChild(btnResetCol);
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

    function buildColorBlock(toolId, st) {
      const block = el("div", "huabi-tool-block");
      const profile = st.settings.toolProfiles[toolId] || {};
      const saved = S.getSavedColors(profile, toolId);

      block.innerHTML = `<h4>${S.COLOR_TOOL_LABELS[toolId] || toolId}</h4>`;

      const colorsRow = el("div", "huabi-colors-row");
      colorsRow.appendChild(document.createTextNode("保存色："));
      saved.forEach((c, i) => {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = c;
        inp.dataset.tool = toolId;
        inp.dataset.slot = String(i);
        inp.dataset.field = "saved-color";
        inp.addEventListener("input", scheduleAutoSave);
        colorsRow.appendChild(inp);
      });
      block.appendChild(colorsRow);

      const customInp = document.createElement("input");
      customInp.type = "color";
      customInp.value = profile.color || saved[0];
      customInp.dataset.tool = toolId;
      customInp.dataset.field = "custom-color";
      customInp.addEventListener("input", scheduleAutoSave);
      block.appendChild(labelRow("当前颜色", customInp));
      return block;
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
      container.querySelectorAll('[data-field="saved-color"]').forEach((inp) => {
        const tid = inp.dataset.tool;
        const slot = Number(inp.dataset.slot);
        if (!state.settings.toolProfiles[tid]) state.settings.toolProfiles[tid] = {};
        if (!state.settings.toolProfiles[tid].savedColors) {
          state.settings.toolProfiles[tid].savedColors = S.getSavedColors(
            state.settings.toolProfiles[tid],
            tid
          );
        }
        state.settings.toolProfiles[tid].savedColors[slot] = inp.value;
      });
      container.querySelectorAll('[data-field="custom-color"]').forEach((inp) => {
        const tid = inp.dataset.tool;
        if (!state.settings.toolProfiles[tid]) state.settings.toolProfiles[tid] = {};
        state.settings.toolProfiles[tid].color = inp.value;
      });
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
      persistSettings().catch(() => {
        status.textContent = "保存失败，请重试";
        status.classList.add("error");
        status.hidden = false;
      });
    });

    btnResetSc.addEventListener("click", () => {
      state.settings.shortcuts = { ...S.DEFAULT_SHORTCUTS };
      renderShortcuts();
      status.textContent = "已恢复默认快捷键（需点保存）";
      status.classList.remove("error");
      status.hidden = false;
    });

    btnResetCol.addEventListener("click", () => {
      const defs = S.getDefaultSettings().toolProfiles;
      S.COLOR_EDIT_TOOLS.forEach((id) => {
        state.settings.toolProfiles[id] = {
          ...state.settings.toolProfiles[id],
          ...defs[id],
          savedColors: [...defs[id].savedColors],
        };
      });
      mount(container, { ...options, settings: state.settings });
      status.textContent = "已恢复默认颜色（需点保存）";
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
