const S = window.HuabiSettings;
const F = window.HuabiSettingsForm;
const root = document.getElementById("settings-root");

let formApi = null;

S.loadSettings().then(async (settings) => {
  formApi = await F.mount(root, {
    settings,
    onSave: async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "RELOAD_SETTINGS" }).catch(() => {});
        }
      }
    },
    onClose: async (opts) => {
      if (!opts?.skipFlush && formApi?.flushSave) {
        try {
          await formApi.flushSave();
        } catch {
          /* ignore */
        }
      }
      window.close();
    },
  });
});
