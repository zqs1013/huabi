const tabDrawState = new Map();

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

async function toggleDrawOnTab(tabId) {
  const res = await sendToTab(tabId, { type: "TOGGLE_DRAW_MODE" });
  if (res && typeof res.active === "boolean") {
    tabDrawState.set(tabId, res.active);
  }
  return res;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DRAW_STATE_CHANGED" && sender.tab?.id) {
    tabDrawState.set(sender.tab.id, message.active);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) await toggleDrawOnTab(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-draw") return;
  const tab = await getActiveTab();
  if (tab?.id) await toggleDrawOnTab(tab.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "POPUP_TOGGLE") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ error: "no_tab" });
        return;
      }
      const res = await toggleDrawOnTab(tab.id);
      sendResponse(res || { error: "inject_failed" });
    })();
    return true;
  }
  if (message.type === "POPUP_GET_STATE") {
    (async () => {
      const tab = await getActiveTab();
      if (!tab?.id) {
        sendResponse({ active: false });
        return;
      }
      const res = await sendToTab(tab.id, { type: "GET_STATE" });
      sendResponse(res || { active: tabDrawState.get(tab.id) || false });
    })();
    return true;
  }
  return false;
});
