(function () {
  const S = window.HuabiSettings;
  const F = window.HuabiSettingsForm;

  class HuabiSettingsPanel {
    constructor(rootEl, overlay) {
      this.overlay = overlay;
      this.visible = false;
      this.formApi = null;

      this.backdrop = document.createElement("div");
      this.backdrop.id = "huabi-settings-backdrop";
      this.backdrop.hidden = true;

      this.panel = document.createElement("div");
      this.panel.id = "huabi-settings-panel";
      this.panel.hidden = true;

      const header = document.createElement("div");
      header.className = "huabi-settings-header";
      header.innerHTML = `<h2>设置</h2>`;
      const btnClose = document.createElement("button");
      btnClose.type = "button";
      btnClose.className = "huabi-btn-icon";
      btnClose.title = "关闭";
      btnClose.innerHTML = `<span class="huabi-icon"></span>`;
      window.HuabiIcons.setIcon(btnClose.querySelector(".huabi-icon"), "close");
      btnClose.addEventListener("click", () => {
        this.hide();
      });
      header.appendChild(btnClose);

      this.body = document.createElement("div");
      this.body.className = "huabi-settings-body";

      this.panel.appendChild(header);
      this.panel.appendChild(this.body);
      this.backdrop.appendChild(this.panel);
      rootEl.appendChild(this.backdrop);

      this.backdrop.addEventListener("mousedown", (e) => {
        if (e.target === this.backdrop) this.hide();
      });

      this._onEsc = (e) => {
        if (e.key === "Escape" && this.visible) void this.hide();
      };
    }

    async show() {
      const settings = await S.loadSettings();
      this.overlay.settings = settings;
      if (this.formApi) this.formApi.destroy();
      this.body.innerHTML = "";
      this.formApi = await F.mount(this.body, {
        settings,
        overlay: this.overlay,
        onSave: async (s) => {
          this.overlay.settings = s;
          this.overlay.engine.applySettings(s);
          await S.applyTextFontToOverlay(this.overlay, s.textFontFamily);
          this.overlay.syncToolbarFromTool();
          this.overlay._updatePenButtonColors();
          this.overlay._rebuildToolbarTools();
        },
        onClose: (opts) => void this.hide(opts?.skipFlush),
      });
      this.visible = true;
      this.backdrop.hidden = false;
      this.panel.hidden = false;
      this.overlay.root?.classList.add("huabi-settings-open");
      document.addEventListener("keydown", this._onEsc, true);
      this._positionPanel();
    }

    async hide(skipFlush = false) {
      if (!skipFlush && this.formApi?.flushSave) {
        try {
          await this.formApi.flushSave();
        } catch {
          /* ignore */
        }
      }
      this.visible = false;
      this.backdrop.hidden = true;
      this.panel.hidden = true;
      this.overlay.root?.classList.remove("huabi-settings-open");
      document.removeEventListener("keydown", this._onEsc, true);
      if (this.formApi) {
        this.formApi.destroy();
        this.formApi = null;
      }
    }

    toggle() {
      if (this.visible) this.hide();
      else this.show();
    }

    _positionPanel() {
      const tr = this.overlay.toolbar.getBoundingClientRect();
      const panelW = Math.min(420, window.innerWidth - 24);
      let left = tr.left;
      if (left + panelW > window.innerWidth - 12) {
        left = window.innerWidth - panelW - 12;
      }
      left = Math.max(12, left);
      this.panel.style.width = panelW + "px";
      this.panel.style.left = left + "px";
      this.panel.style.top = tr.bottom + 10 + "px";
    }
  }

  window.HuabiSettingsPanel = HuabiSettingsPanel;
})();
