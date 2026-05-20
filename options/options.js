const S = window.HuabiSettings;
const F = window.HuabiSettingsForm;
const root = document.getElementById("settings-root");

S.loadSettings().then((settings) => {
  F.mount(root, {
    settings,
    onSave: async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "RELOAD_SETTINGS" }).catch(() => {});
        }
      }
    },
  });
});
