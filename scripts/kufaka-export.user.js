// ==UserScript==
// @name         酷发卡 · 卡密按商品批量导出
// @namespace    kufaka.export
// @version      1.0.0
// @description  遍历所有卡密商品，把卡密按「商品名.txt」导出（只读，不删除不标记已用），打包成 ZIP 下载
// @author       you
// @match        https://www.kufaka.com/*
// @grant        none
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js
// ==/UserScript==

(function () {
  'use strict';

  const API = 'https://www.kufaka.com/merchantApi';

  // ---------- 认证 token ----------
  function getToken() {
    const m = document.cookie.match(/(?:^|;\s*)merchant-token=([^;]+)/);
    if (m && m[1]) return m[1];
    try {
      const t = localStorage.getItem('merchant-token');
      if (t) return t;
    } catch (e) {}
    return '';
  }

  // ---------- 统一请求 ----------
  async function postJson(path, body) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
    };
    if (token) headers['merchant-token'] = token;
    const res = await fetch(API + path, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.code !== 1) throw new Error(json.msg || ('code ' + json.code));
    return json;
  }

  // ---------- 商品列表 ----------
  async function fetchAllGoods() {
    const out = [];
    let current = 1;
    const pageSize = 100;
    for (;;) {
      const json = await postJson('/Goods/list', {
        current,
        pageSize,
        goods_type: 'card',
        status: 999,
        name: '',
        is_proxy: '0',
      });
      const data = json.data || {};
      const list = data.list || [];
      out.push(...list);
      if (list.length < pageSize || out.length >= (data.total || 0)) break;
      current += 1;
    }
    return out;
  }

  // ---------- 某商品的卡密 ----------
  async function fetchCards(goodsId, includeUsed) {
    const out = [];
    let current = 1;
    const pageSize = 200;
    let rawTotal = null;
    let rawCount = 0;
    for (;;) {
      const json = await postJson('/goodsCardStorage/list', {
        goods_id: goodsId,
        current,
        pageSize,
        keywords: '',
        status: '',
        first: '',
      });
      const data = json.data || {};
      const list = data.list || [];
      if (rawTotal === null) rawTotal = data.total || 0;
      rawCount += list.length;
      for (const it of list) {
        if (!includeUsed && it.status !== 0) continue;
        if (it.secret) out.push(String(it.secret).trim());
      }
      if (list.length === 0 || rawCount >= rawTotal) break;
      current += 1;
    }
    return out;
  }

  function sanitizeName(name) {
    return String(name).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim() || '未命名';
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------- 主流程 ----------
  async function run(includeUsed, statusEl) {
    statusEl.textContent = '正在获取商品列表…';
    let goods;
    try {
      goods = await fetchAllGoods();
    } catch (e) {
      statusEl.textContent = '获取商品失败：' + e.message + '（请确认已登录酷发卡，并在商品列表页运行）';
      return;
    }
    if (goods.length === 0) {
      statusEl.textContent = '没有获取到卡密商品（可能 token 失效，请刷新页面重试）';
      return;
    }

    const files = []; // {name, text}
    let okCount = 0;
    for (let i = 0; i < goods.length; i++) {
      const g = goods[i];
      statusEl.textContent = '正在导出 ' + g.name + '（' + (i + 1) + '/' + goods.length + '）…';
      try {
        const cards = await fetchCards(g.id, includeUsed);
        if (cards.length > 0) {
          files.push({ name: sanitizeName(g.name), text: cards.join('\n') + '\n' });
        }
        okCount += 1;
      } catch (e) {
        statusEl.textContent = '导出 ' + g.name + ' 失败：' + e.message + '，继续下一个…';
        await sleep(400);
      }
    }

    // 文件名去重（同名商品追加序号）
    const seen = new Set();
    for (const f of files) {
      let n = f.name;
      let k = 1;
      while (seen.has(n)) n = f.name + '_' + k++;
      seen.add(n);
      f.name = n;
    }

    statusEl.textContent = '完成 ' + okCount + '/' + goods.length + ' 个商品，共 ' + files.length + ' 个 txt，正在打包…';

    if (typeof fflate !== 'undefined' && fflate.zipSync) {
      const map = {};
      for (const f of files) map[f.name + '.txt'] = new TextEncoder().encode(f.text);
      const zipBytes = fflate.zipSync(map);
      downloadBlob(new Blob([zipBytes], { type: 'application/zip' }),
        '卡密导出_' + new Date().toISOString().slice(0, 10) + '.zip');
      statusEl.textContent = '已下载 ZIP（' + files.length + ' 个 txt）。解压后即可用于文件夹批量导入。';
    } else {
      statusEl.textContent = 'fflate 未加载，改为逐个下载（请允许浏览器「下载多个文件」）…';
      for (const f of files) {
        downloadBlob(new Blob([f.text], { type: 'text/plain' }), f.name + '.txt');
        await sleep(500);
      }
      statusEl.textContent = '已逐个下载 ' + files.length + ' 个文件';
    }
  }

  // ---------- 悬浮面板 UI ----------
  function buildUI() {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;' +
      'z-index:2147483647;width:280px;' +
      'background:#fff;border:1px solid #d0d7de;' +
      'border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.15);' +
      'padding:14px;' +
      'font:13px/1.5 "Microsoft YaHei",sans-serif;' +
      'color:#1f2328;';

    root.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;font-size:14px;">酷发卡 · 卡密导出</div>' +
      '<label style="display:flex;align-items:center;gap:6px;margin-bottom:10px;cursor:pointer;">' +
      '<input type="checkbox" id="kf-include-used" style="accent-color:#0a84ff;">' +
      '<span>包含已使用的卡密（默认只导未使用）</span></label>' +
      '<button id="kf-go" style="width:100%;padding:8px;border:none;border-radius:6px;background:#0a84ff;color:#fff;font-weight:600;cursor:pointer;">开始导出全部商品</button>' +
      '<div id="kf-status" style="margin-top:10px;color:#57606a;font-size:12px;word-break:break-all;"></div>';

    document.body.appendChild(root);

    const statusEl = root.querySelector('#kf-status');
    const goBtn = root.querySelector('#kf-go');
    const includeUsed = root.querySelector('#kf-include-used');

    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      goBtn.textContent = '导出中…';
      try {
        await run(includeUsed.checked, statusEl);
      } finally {
        goBtn.disabled = false;
        goBtn.textContent = '开始导出全部商品';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
