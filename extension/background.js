chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('https://cloudflare.pay/')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PAYID_SCOUT' });
  } catch {
    // 页面尚未加载 content script 时保持安静，刷新页面即可重新注入。
  }
});
