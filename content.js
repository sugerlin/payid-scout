(() => {
  if (window.__PAYID_SCOUT_LOADED__) return;
  window.__PAYID_SCOUT_LOADED__ = true;

  const SCORE_WEIGHTS = Object.freeze({ scarcity: 17, dictionary: 18, brandability: 16, memorability: 14, pronunciation: 12, versatility: 12, commercial: 11 });
  const CACHE_KEY = '__payid_scout_result_cache_v1__';
  const QUEUE_KEY = '__payid_scout_queue_v1__';
  const state = { open: false, scanning: false, stopRequested: false, queue: [], results: [], cache: {}, current: null, timer: null, saveTimer: null };

  const root = document.createElement('div');
  root.id = 'payid-scout-root';
  root.innerHTML = `
    <div id="payid-scout-launcher"><button type="button">PayID Scout</button></div>
    <section id="payid-scout-panel" hidden aria-label="PayID Scout 扫描面板">
      <header class="ps-head"><div><p class="ps-kicker">CLOUDFLARE.PAY / CANDIDATE SCAN</p><h2>逐个查询有价值的名字</h2><p class="ps-subtitle">只查询，不点击 Reserve；品牌标记只读本地参考，不触发额外检索。</p></div><button class="ps-close" type="button" aria-label="关闭">×</button></header>
      <div class="ps-body">
        <label class="ps-label" for="ps-input">候选词队列（可直接编辑；每行一个，支持 2—32 位字母或数字）</label>
        <textarea id="ps-input" spellcheck="false" placeholder="cove\nmint\nlumen\n输入你自己的候选词…"></textarea>
        <input id="ps-file" type="file" accept=".txt,.csv,.json,text/plain,text/csv,application/json" hidden />
        <div class="ps-row"><button id="ps-load-words" class="ps-quiet" type="button">载入内置词库（${PAYID_SCOUT_WORDS.length}）</button><button id="ps-import-bank" class="ps-quiet" type="button">导入 TXT / CSV / JSON</button><button id="ps-export-words" class="ps-quiet" type="button">导出当前词库</button><button id="ps-clear-input" class="ps-quiet" type="button">清空</button><label class="ps-check">查询间隔 <select id="ps-delay"><option value="700">快 / 0.7s</option><option value="1000" selected>标准 / 1s</option><option value="1600">稳妥 / 1.6s</option><option value="2500">保守 / 2.5s</select></label></div>
        <div id="ps-queue-note" class="ps-note">词库可导入后直接编辑，最近一次编辑会保存在本地。</div>
        <div class="ps-actions"><button id="ps-start" class="ps-action" type="button">开始逐个查询</button><button id="ps-stop" class="ps-action stop" type="button" disabled>停止</button></div>
        <div class="ps-progress"><span id="ps-progress-text">等待候选词</span><div class="ps-progress-track"><div id="ps-progress-fill" class="ps-progress-fill"></div></div></div>
        <div id="ps-error" class="ps-error" hidden></div>
        <div class="ps-filter-row"><label class="ps-check"><input id="ps-available-only" type="checkbox" /> 只显示 AVAILABLE</label><select id="ps-sort" aria-label="结果排序"><option value="total">总分最高</option><option value="commercial">商业价值</option><option value="versatility">适用范围</option><option value="scarcity">稀缺程度</option><option value="status">AVAILABLE 优先</option></select></div>
        <div class="ps-summary"><div class="ps-metric"><span>已查询</span><b id="ps-count">0</b></div><div class="ps-metric"><span>AVAILABLE</span><b id="ps-available">0</b></div><div class="ps-metric"><span>平均总分</span><b id="ps-average">—</b></div><div class="ps-metric"><span>品牌关联</span><b id="ps-flagged">0</b></div></div>
        <div class="ps-table-wrap"><table><thead><tr><th>候选词</th><th>总分</th><th>价值</th><th>商标标记</th><th>页面结果</th></tr></thead><tbody id="ps-results"><tr><td colspan="5" class="ps-empty">先载入词库或粘贴候选词，然后开始查询。</td></tr></tbody></table></div>
        <div class="ps-footer"><div><button id="ps-export" type="button">导出 CSV</button><button id="ps-clear-cache" type="button">清除本地结果</button></div><span>结果本地保存；最终保留/预订由你决定。</span></div>
      </div><div id="ps-toast" class="ps-toast"></div>
    </section>`;
  document.documentElement.appendChild(root);

  const $ = (selector) => root.querySelector(selector);
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => value.trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9]/g, '');
  const statusText = { AVAILABLE: 'AVAILABLE', RESERVED: 'ALREADY RESERVED', CHECKING: 'CHECKING', UNKNOWN: 'UNKNOWN', RATE_LIMITED: 'RATE LIMITED' };

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state.cache));
    } catch {
      setError('本地存储空间不足，当前结果仍显示在页面中，但无法持久保存。');
    }
  }

  function hydrateCache() {
    state.cache = readCache();
    state.results = Object.values(state.cache);
  }

  function readQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((word) => typeof word === 'string') : [];
    } catch {
      return [];
    }
  }

  function parseWords(text) {
    return String(text || '').split(/[\s,，;；]+/).map(normalize).filter((word, index, all) => word.length >= 2 && word.length <= 32 && /^[a-z0-9]+$/.test(word) && all.indexOf(word) === index);
  }

  function parseImportedText(text) {
    const source = String(text || '').trim();
    if (!source) return [];
    try {
      const parsed = JSON.parse(source);
      const values = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.words) ? parsed.words : [parsed]);
      const words = values.map((item) => typeof item === 'string' ? item : (item?.word || item?.name || item?.candidate || '')).join('\n');
      return parseWords(words);
    } catch {
      return parseWords(source);
    }
  }

  function saveQueue(words) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(words)); } catch { setError('本地词库保存失败，但当前队列仍可继续查询。'); }
  }

  function queueWords() {
    return parseWords($('#ps-input').value);
  }

  function updateQueueNote(words = queueWords()) {
    $('#ps-queue-note').textContent = words.length ? `当前词库 ${words.length} 个；可继续编辑，扫描时会自动去重并跳过已有结果。` : '词库可导入后直接编辑，最近一次编辑会保存在本地。';
  }

  function setQueue(words, message = '') {
    const uniqueWords = parseWords(words.join('\n'));
    $('#ps-input').value = uniqueWords.join('\n');
    saveQueue(uniqueWords);
    updateQueueNote(uniqueWords);
    setProgress(0, 0);
    render();
    if (message) toast(message);
  }

  function hydrateQueue() {
    const words = parseWords(readQueue().join('\n'));
    if (words.length) {
      $('#ps-input').value = words.join('\n');
      updateQueueNote(words);
    }
  }

  function cacheResult(candidate) {
    state.cache[candidate.word] = { ...candidate, checkedAt: new Date().toISOString() };
    writeCache();
    state.results = Object.values(state.cache);
  }

  function clearCache() {
    state.cache = {};
    state.results = [];
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore storage cleanup errors */ }
    render();
    toast('本地结果已清除，之后会重新查询。');
  }

  function findWalletInput() {
    return document.querySelector('input[placeholder="yourname"], input[placeholder*="yourname" i], input[type="text"]');
  }

  function scoreScarcity(meta) {
    const lengthScore = { 2: 100, 3: 98, 4: 94, 5: 87, 6: 80 }[meta.word.length] || 65;
    return clamp(lengthScore * .65 + (meta.rarity ?? .5) * 100 * .35);
  }

  function scoreMemorability(meta) {
    const vowels = (meta.word.match(/[aeiouy]/g) || []).length;
    const clusters = (meta.word.match(/[^aeiouy]{3,}/g) || []).length;
    return clamp((vowels ? 78 + Math.min(16, vowels * 5) : 52) - clusters * 13);
  }

  function scorePronunciation(meta) {
    let score = 90;
    if (/[qx]/.test(meta.word)) score -= 13;
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(meta.word)) score -= 12;
    if (meta.word.length > 5) score -= 3;
    if ((meta.syllables || 1) > 2) score -= 7;
    return clamp(score);
  }

  function candidateFor(raw) {
    const word = normalize(raw);
    const meta = PAYID_SCOUT_WORD_MAP.get(word) || { word, category: '自定义', meaning: '自定义输入，等待词典确认', rarity: .5, brandability: 64, versatility: 64, commercial: 58, syllables: 1 };
    const signal = PAYID_SCOUT_BRAND_SIGNALS[word] || { flag: 'NONE', note: '未发现明显著名品牌关联。' };
    const isDictionaryWord = PAYID_SCOUT_WORD_MAP.has(word) && !meta.compound;
    const scores = {
      scarcity: meta.compound ? clamp(82 - Math.max(0, word.length - 10) * 1.5 + (meta.rarity ?? .5) * 8) : scoreScarcity(meta),
      dictionary: meta.compound ? 82 : (isDictionaryWord ? 100 : (/^[a-z]+$/.test(word) ? 35 : 15)),
      brandability: meta.brandability ?? clamp(65 + scoreMemorability(meta) * .28),
      memorability: meta.memorability ?? scoreMemorability(meta),
      pronunciation: meta.pronunciation ?? scorePronunciation(meta),
      versatility: meta.versatility ?? 64,
      commercial: meta.commercial ?? 58,
    };
    const total = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + scores[key] * weight / 100, 0);
    return { ...meta, ...signal, word, length: word.length, dictionary: isDictionaryWord, scores, total: clamp(total), trademark_flag: signal.flag, trademark_note: signal.note, status: 'CHECKING' };
  }

  function parseQueue() {
    const values = queueWords();
    saveQueue(values);
    updateQueueNote(values);
    return values;
  }

  function setInputValue(word) {
    const input = findWalletInput();
    if (!input) throw new Error('找不到 Cloudflare Wallet 名称输入框。');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    input.focus();
    input.select();
    if (setter) setter.call(input, word); else input.value = word;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: word }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'e' }));
  }

  function pageResultFor(word) {
    const text = document.body.innerText.toLowerCase();
    if (text.includes(`@${word} is available`)) return 'AVAILABLE';
    if (text.includes(`@${word} is already reserved`)) return 'RESERVED';
    if (/too many requests|rate limit|slow down|try again later/.test(text)) return 'RATE_LIMITED';
    return null;
  }

  async function waitForPageResult(word, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = pageResultFor(word);
      if (result) return result;
      await sleep(220);
    }
    return 'UNKNOWN';
  }

  function setError(message = '') {
    const box = $('#ps-error');
    box.textContent = message;
    box.hidden = !message;
  }

  function toast(message) {
    const node = $('#ps-toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(state.timer);
    state.timer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function flagClass(flag) {
    return { NONE: 'flag-none', GENERIC_BRAND: 'flag-generic', STRONG_BRAND: 'flag-strong', BRAND_ONLY: 'flag-only' }[flag] || 'flag-none';
  }

  function statusClass(status) {
    return { AVAILABLE: 'status-available', RESERVED: 'status-reserved', CHECKING: 'status-checking', UNKNOWN: 'status-unknown', RATE_LIMITED: 'status-rate' }[status] || 'status-unknown';
  }

  function sortedResults() {
    let list = [...state.results];
    if ($('#ps-available-only').checked) list = list.filter((item) => item.status === 'AVAILABLE');
    const sort = $('#ps-sort').value;
    return list.sort((a, b) => {
      if (sort === 'status') return (a.status === 'AVAILABLE' ? 0 : 1) - (b.status === 'AVAILABLE' ? 0 : 1) || b.total - a.total;
      return (b.scores[sort] ?? b.total) - (a.scores[sort] ?? a.total) || b.total - a.total;
    });
  }

  function render() {
    const rows = sortedResults();
    const visibleRows = rows.slice(0, 200);
    const available = state.results.filter((item) => item.status === 'AVAILABLE').length;
    const flagged = state.results.filter((item) => item.trademark_flag !== 'NONE').length;
    const average = state.results.length ? Math.round(state.results.reduce((sum, item) => sum + item.total, 0) / state.results.length) : 0;
    $('#ps-count').textContent = state.results.length;
    $('#ps-available').textContent = available;
    $('#ps-average').textContent = average || '—';
    $('#ps-flagged').textContent = flagged;
    $('#ps-results').innerHTML = visibleRows.length ? visibleRows.map((item) => `<tr><td><span class="ps-word">${item.word}</span><span class="ps-meaning">${item.meaning}</span></td><td><span class="ps-score">${item.total}</span></td><td><span class="ps-meaning">稀缺 ${item.scores.scarcity} · 商业 ${item.scores.commercial}</span></td><td><span class="ps-badge ${flagClass(item.trademark_flag)}">${item.trademark_flag}</span></td><td><span class="ps-badge ${statusClass(item.status)}">${statusText[item.status]}</span></td></tr>`).join('') + (rows.length > visibleRows.length ? `<tr><td colspan="5" class="ps-empty">本地共 ${rows.length} 条结果，表格显示当前排序前 200 条；导出 CSV 可获取全部。</td></tr>` : '') : '<tr><td colspan="5" class="ps-empty">暂无结果。先载入词库或粘贴候选词，然后开始查询。</td></tr>';
  }

  function setProgress(done, total, word = '') {
    const percentage = total ? Math.round(done / total * 100) : 0;
    $('#ps-progress-fill').style.width = `${percentage}%`;
    $('#ps-progress-text').textContent = word ? `${done} / ${total} · 正在查询 @${word}` : (total ? `${done} / ${total} · ${done === total ? '查询完成，本地已保存' : '准备中'}` : (state.results.length ? `本地已有 ${state.results.length} 条结果` : '等待候选词'));
  }

  async function scan() {
    if (state.scanning) return;
    state.queue = parseQueue();
    if (!state.queue.length) { toast('请先输入 2—32 位候选词。'); return; }
    state.scanning = true;
    state.stopRequested = false;
    setError('');
    $('#ps-start').disabled = true;
    $('#ps-stop').disabled = false;
    $('#ps-input').disabled = true;
    const delay = Number($('#ps-delay').value);
    const pending = state.queue.filter((word) => !state.cache[word]);
    const cachedCount = state.queue.length - pending.length;
    state.results = Object.values(state.cache);
    render();
    if (!pending.length) {
      state.scanning = false;
      $('#ps-start').disabled = false;
      $('#ps-stop').disabled = true;
      $('#ps-input').disabled = false;
      setProgress(state.queue.length, state.queue.length, '');
      toast(`本批 ${state.queue.length} 个名称已有本地结果，没有重复查询。`);
      return;
    }
    for (let index = 0; index < pending.length; index += 1) {
      if (state.stopRequested) break;
      const word = pending[index];
      const candidate = candidateFor(word);
      state.current = candidate;
      state.results = [...Object.values(state.cache), candidate];
      setProgress(cachedCount + index, state.queue.length, word);
      render();
      try {
        setInputValue(word);
        await sleep(240);
        candidate.status = await waitForPageResult(word);
        if (candidate.status === 'RATE_LIMITED') { setError('页面返回了频率限制提示，扫描已停止。请稍后再继续，并使用更长的查询间隔。该名称未写入缓存。'); render(); break; }
        cacheResult(candidate);
      } catch (error) {
        candidate.status = 'UNKNOWN';
        setError(error.message || '查询失败。');
        cacheResult(candidate);
      }
      setProgress(cachedCount + index + 1, state.queue.length, index + 1 === pending.length ? '' : pending[index + 1]);
      render();
      if (index < pending.length - 1 && !state.stopRequested) await sleep(delay);
    }
    state.scanning = false;
    state.current = null;
    $('#ps-start').disabled = false;
    $('#ps-stop').disabled = true;
    $('#ps-input').disabled = false;
    state.results = Object.values(state.cache);
    const done = cachedCount + pending.filter((word) => state.cache[word]).length;
    setProgress(done, state.queue.length, '');
    if (state.stopRequested) toast(`已停止，本地保存 ${done} 个结果`); else if (!$('#ps-error').textContent) toast(`已完成 ${done} 个名称，本地已保存，不会重复查询`);
  }

  function exportCsv() {
    if (!state.results.length) { toast('暂无结果可导出。'); return; }
    const headers = ['word', 'total_score', 'length', 'dictionary_score', 'brandability_score', 'memorability_score', 'pronunciation_score', 'versatility_score', 'commercial_score', 'trademark_flag', 'page_status', 'checked_at'];
    const rows = state.results.map((item) => [item.word, item.total, item.length, item.scores.dictionary, item.scores.brandability, item.scores.memorability, item.scores.pronunciation, item.scores.versatility, item.scores.commercial, item.trademark_flag, item.status, item.checkedAt || '']);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `payid-scout-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('CSV 已导出。');
  }

  function exportWords() {
    const words = queueWords();
    if (!words.length) { toast('当前没有可导出的词库。'); return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`${words.join('\n')}\n`], { type: 'text/plain;charset=utf-8' }));
    link.download = `payid-scout-word-bank-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast(`已导出 ${words.length} 个词`);
  }

  async function importWords(file) {
    if (!file) return;
    try {
      const words = parseImportedText(await file.text());
      if (!words.length) throw new Error('文件中没有找到有效候选词。');
      setQueue(words, `已导入并去重 ${words.length} 个词，现在可以直接编辑。`);
    } catch (error) {
      setError(error.message || '词库导入失败。');
      toast('词库导入失败。');
    }
  }

  function openPanel() { state.open = true; $('#payid-scout-panel').hidden = false; $('#payid-scout-launcher').hidden = true; }
  function closePanel() { if (state.scanning) { toast('扫描进行中，请先停止查询。'); return; } state.open = false; $('#payid-scout-panel').hidden = true; $('#payid-scout-launcher').hidden = false; }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'TOGGLE_PAYID_SCOUT') return;
    if (state.open) closePanel(); else openPanel();
  });

  $('#payid-scout-launcher button').addEventListener('click', openPanel);
  $('.ps-close').addEventListener('click', closePanel);
  $('#ps-load-words').addEventListener('click', () => setQueue(PAYID_SCOUT_WORDS.map((item) => item.word), `已载入 ${PAYID_SCOUT_WORDS.length} 个内置词`));
  $('#ps-import-bank').addEventListener('click', () => $('#ps-file').click());
  $('#ps-file').addEventListener('change', (event) => { importWords(event.target.files?.[0]); event.target.value = ''; });
  $('#ps-export-words').addEventListener('click', exportWords);
  $('#ps-clear-input').addEventListener('click', () => setQueue([], '已清空查询队列，本地结果保留。'));
  $('#ps-input').addEventListener('input', () => {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => { const words = queueWords(); saveQueue(words); updateQueueNote(words); }, 250);
  });
  $('#ps-start').addEventListener('click', scan);
  $('#ps-stop').addEventListener('click', () => { state.stopRequested = true; $('#ps-progress-text').textContent = '正在停止…'; });
  $('#ps-export').addEventListener('click', exportCsv);
  $('#ps-clear-cache').addEventListener('click', () => { if (!state.scanning) clearCache(); else toast('扫描进行中，请先停止查询。'); });
  $('#ps-sort').addEventListener('change', render);
  $('#ps-available-only').addEventListener('change', render);
  hydrateCache();
  hydrateQueue();
  render();
})();
