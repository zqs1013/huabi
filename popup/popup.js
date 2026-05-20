const btnToggle = document.getElementById("btn-toggle");
const statusEl = document.getElementById("status");
const linkOptions = document.getElementById("link-options");

function setUi(active) {
  btnToggle.textContent = active ? "关闭标注" : "开启标注";
  btnToggle.classList.toggle("active", active);
  statusEl.textContent = active ? "标注模式已开启（默认鼠标模式）" : "";
  statusEl.classList.remove("error");
}

async function refreshState() {
  const res = await chrome.runtime.sendMessage({ type: "POPUP_GET_STATE" });
  if (res?.active) setUi(true);
  else setUi(false);
}

btnToggle.addEventListener("click", async () => {
  statusEl.textContent = "";
  const res = await chrome.runtime.sendMessage({ type: "POPUP_TOGGLE" });
  if (res?.error === "inject_failed") {
    statusEl.textContent = "无法在此页面使用（请刷新后重试）";
    statusEl.classList.add("error");
    return;
  }
  if (res?.active !== undefined) setUi(res.active);
});

linkOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshState();
