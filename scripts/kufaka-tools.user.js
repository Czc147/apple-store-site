// ==UserScript==
// @name         酷发卡 · 工具（卡密导出 + 商品批量创建）
// @namespace    kufaka.tools
// @version      1.1.1
// @description  卡密按商品导出为 txt（只读不删除）；按分类+前缀批量创建商品（重名跳过，分类自动识别）
// @author       you
// @match        https://www.kufaka.com/*
// @grant        none
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.3/umd/index.js
// ==/UserScript==

(function () {
  'use strict';
  /* global fflate */
  var API = 'https://www.kufaka.com/merchantApi';
  var CAT_KEY = 'kufaka_categories_v1';

  // ===== 分类自动识别 =====
  var categories = [{ id: 3818, name: '2026.8' }];
  try {
    var saved = JSON.parse(localStorage.getItem(CAT_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) categories = saved;
  } catch (e) {}

  function mergeCategories(list) {
    var seen = {};
    categories.forEach(function (c) { seen[String(c.id)] = c; });
    list.forEach(function (c) {
      if (c && c.id !== undefined && c.id !== null && c.id !== '') {
        seen[String(c.id)] = { id: c.id, name: c.name || String(c.id) };
      }
    });
    categories = [];
    Object.keys(seen).forEach(function (k) { categories.push(seen[k]); });
    try { localStorage.setItem(CAT_KEY, JSON.stringify(categories)); } catch (e) {}
    refreshCatSelect();
  }

  function sniffJson(url, json) {
    if (!json || typeof json !== 'object' || json.code !== 1) return;
    var data = json.data;
    var list = Array.isArray(data) ? data : (data && (data.list || data.rows || data.data));
    if (!Array.isArray(list) || list.length === 0 || list.length > 500) return;
    var s0 = list[0];
    if (!s0 || typeof s0 !== 'object') return;
    var hasName = ('name' in s0) || ('category_name' in s0) || ('title' in s0) || ('label' in s0);
    var hasId = ('id' in s0) || ('category_id' in s0) || ('value' in s0);
    var isGoods = ('secret' in s0) || ('price' in s0) || ('stock_count' in s0) || ('goods_type' in s0) || ('market_price' in s0);
    if (hasName && hasId && !isGoods) {
      var arr = list.map(function (it) {
        var id = it.id !== undefined ? it.id : (it.category_id !== undefined ? it.category_id : it.value);
        return { id: id, name: it.name || it.category_name || it.title || it.label || String(id) };
      });
      mergeCategories(arr);
    }
  }

  function hookFetch() {
    var of = window.fetch;
    if (!of) return;
    window.fetch = function () {
      var args = arguments;
      var u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      var p = of.apply(this, args);
      if (u && /merchantApi/i.test(u)) {
        p.then(function (r) {
          try {
            var c = r.clone();
            c.text().then(function (t) {
              try { sniffJson(u, JSON.parse(t)); } catch (e) {}
            });
          } catch (e) {}
          return r;
        });
      }
      return p;
    };
  }

  function hookXHR() {
    var OO = XMLHttpRequest.prototype.open;
    var OS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return OO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { sniffJson(self.__u, JSON.parse(self.responseText)); } catch (e) {}
      });
      return OS.apply(this, arguments);
    };
  }

  hookFetch();
  hookXHR();

  // ===== 认证 + 请求 =====
  function getToken() {
    var m = document.cookie.match(/(?:^|;\s*)merchant-token=([^;]+)/);
    if (m && m[1]) return m[1];
    try { var t = localStorage.getItem('merchant-token'); if (t) return t; } catch (e) {}
    return '';
  }

  async function postJson(path, body) {
    var token = getToken();
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*'
    };
    if (token) headers['merchant-token'] = token;
    var res = await fetch(API + path, {
      method: 'POST', credentials: 'include',
      headers: headers, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json.code !== 1) throw new Error(json.msg || ('code ' + json.code));
    return json;
  }

  async function fetchAllGoods() {
    var out = [], current = 1, pageSize = 100;
    for (;;) {
      var json = await postJson('/Goods/list', {
        current: current, pageSize: pageSize,
        goods_type: 'card', status: 999, name: '', is_proxy: '0'
      });
      var data = json.data || {};
      var list = data.list || [];
      out.push.apply(out, list);
      if (list.length < pageSize || out.length >= (data.total || 0)) break;
      current += 1;
    }
    return out;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // ===== 卡密导出 =====
  async function fetchCards(goodsId, includeUsed) {
    var out = [], current = 1, pageSize = 200;
    var rawTotal = null, rawCount = 0;
    for (;;) {
      var json = await postJson('/goodsCardStorage/list', {
        goods_id: goodsId, current: current, pageSize: pageSize,
        keywords: '', status: '', first: ''
      });
      var data = json.data || {};
      var list = data.list || [];
      if (rawTotal === null) rawTotal = data.total || 0;
      rawCount += list.length;
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
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

  async function runExport(includeUsed, statusEl) {
    statusEl.textContent = '正在获取商品列表…';
    var goods;
    try { goods = await fetchAllGoods(); }
    catch (e) { statusEl.textContent = '获取商品失败：' + e.message; return; }
    if (!goods.length) { statusEl.textContent = '没有卡密商品'; return; }

    var files = [], okCount = 0;
    for (var i = 0; i < goods.length; i++) {
      var g = goods[i];
      statusEl.textContent = '导出 ' + g.name + '（' + (i + 1) + '/' + goods.length + '）…';
      try {
        var cards = await fetchCards(g.id, includeUsed);
        if (cards.length) files.push({ name: sanitizeName(g.name), text: cards.join('\n') + '\n' });
        okCount += 1;
      } catch (e) {
        statusEl.textContent = '导出 ' + g.name + ' 失败：' + e.message + '，继续…';
      }
    }

    var seen = new Set();
    files.forEach(function (f) {
      var n = f.name, k = 1;
      while (seen.has(n)) n = f.name + '_' + k++;
      seen.add(n); f.name = n;
    });

    statusEl.textContent = '完成 ' + okCount + '/' + goods.length + '，共 ' + files.length + ' 个 txt，打包中…';
    if (typeof window.fflate !== 'undefined' && window.fflate.zipSync) {
      var map = {};
      files.forEach(function (f) { map[f.name + '.txt'] = window.fflate.strToU8(f.text); });
      var zip = window.fflate.zipSync(map);
      downloadBlob(new Blob([zip], { type: 'application/zip' }),
        '卡密导出_' + new Date().toISOString().slice(0, 10) + '.zip');
      statusEl.textContent = '已下载 ZIP（' + files.length + ' 个 txt）';
    } else {
      statusEl.textContent = 'fflate 未加载，逐个下载（请允许多文件下载）…';
      for (var j = 0; j < files.length; j++) {
        downloadBlob(new Blob([files[j].text], { type: 'text/plain' }), files[j].name + '.txt');
        await sleep(500);
      }
      statusEl.textContent = '已逐个下载 ' + files.length + ' 个';
    }
  }

  // ===== 商品批量创建 =====
  function buildPayload(name, categoryId, price) {
    return {
      goods_type: 'card', id: 0, name: name, image: '',
      category_id: Number(categoryId) || 0,
      price: Number(price) || 0, market_price: 0, description: '',
      sort: 0, coupon_status: 1, status: 1, fee_payer: -1, show: 1,
      contact_format: 'any', agent_status: 0,
      agent_price1: 0, agent_price2: 0, agent_price3: 0, agent_price_limit: 0,
      description_sync: 0, name_sync: 0, parent_id: 0, cost_price: 0,
      add_type: 1, add_rate: 0, add_price: 0,
      extend: {
        instructions: '<p><br></p>', stock_notice: 0, lock_card: 0,
        limit_count: 1, limit_count_max: 0, show_stock_type: 0,
        send_order: 0, query_password_status: 0
      }
    };
  }

  function pad(num, width) {
    var s = String(num);
    while (s.length < width) s = '0' + s;
    return s;
  }

  async function runCreate(cfg, statusEl) {
    statusEl.textContent = '正在读取已有商品名…';
    var goods;
    try { goods = await fetchAllGoods(); }
    catch (e) { statusEl.textContent = '读取商品失败：' + e.message; return; }
    var existing = new Set();
    goods.forEach(function (g) { if (g.name) existing.add(String(g.name)); });

    var total = cfg.end - cfg.start + 1;
    var ok = 0, dup = 0, fail = 0;
    for (var n = cfg.start; n <= cfg.end; n++) {
      var name = cfg.prefix + (cfg.padWidth > 0 ? pad(n, cfg.padWidth) : String(n));
      var idx = n - cfg.start + 1;
      if (existing.has(name)) {
        dup += 1;
        statusEl.textContent = '跳过 ' + name + '（已存在） ' + idx + '/' + total;
        continue;
      }
      statusEl.textContent = '创建 ' + name + '（' + idx + '/' + total + '）…';
      try {
        await postJson('/Goods/update', buildPayload(name, cfg.categoryId, cfg.price));
        existing.add(name);
        ok += 1;
      } catch (e) {
        fail += 1;
        statusEl.textContent = '创建 ' + name + ' 失败：' + e.message + '，继续…';
      }
    }
    statusEl.textContent = '完成：成功 ' + ok + ' · 跳过(重名) ' + dup + ' · 失败 ' + fail;
  }

  // ===== 面板 UI =====
  var catSelectEl = null;

  function refreshCatSelect() {
    if (!catSelectEl) return;
    var html = '';
    categories.forEach(function (c) {
      html += '<option value="' + c.id + '">' + c.name + '</option>';
    });
    catSelectEl.innerHTML = html;
  }

  function buildUI() {
    var root = document.createElement('div');
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;' +
      'z-index:2147483647;width:300px;' +
      'background:#fff;border:1px solid #d0d7de;' +
      'border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.15);' +
      'padding:14px;' +
      'font:13px/1.5 "Microsoft YaHei",sans-serif;' +
      'color:#1f2328;';

    var field = 'width:100%;box-sizing:border-box;padding:5px;' +
      'border:1px solid #d0d7de;border-radius:5px;';
    var btn = 'width:100%;padding:8px;border:none;border-radius:6px;' +
      'background:#0a84ff;color:#fff;font-weight:600;cursor:pointer;';
    var sub = 'font-weight:600;margin:12px 0 8px;font-size:13px;' +
      'border-top:1px solid #eaecef;padding-top:10px;';

    root.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<span style="font-weight:700;font-size:14px;">酷发卡 · 工具</span>' +
      '<button id="kf-toggle" type="button" style="border:none;background:#f0f0f0;color:#57606a;' +
      'border-radius:4px;padding:2px 8px;font-size:12px;cursor:pointer;">收起</button></div>' +

      '<div id="kf-body">' +

      '<div style="' + sub + '">一、卡密导出</div>' +
      '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;">' +
      '<input type="checkbox" id="kf-e-used" style="accent-color:#0a84ff;">' +
      '<span>包含已使用的卡密</span></label>' +
      '<button id="kf-e-go" style="' + btn + '">导出全部商品卡密</button>' +
      '<div id="kf-e-status" style="margin-top:8px;color:#57606a;font-size:12px;word-break:break-all;"></div>' +

      '<div style="' + sub + '">二、商品批量创建</div>' +
      '<div style="margin-bottom:6px;">分类 <select id="kf-c-cat" style="' + field + 'background:#fff;"></select></div>' +
      '<div style="margin-bottom:6px;">或手动分类ID <input id="kf-c-catid" type="number" placeholder="留空则用上面的分类" style="' + field + '"></div>' +
      '<div style="margin-bottom:6px;">前缀 <input id="kf-c-prefix" type="text" placeholder="如 M" style="' + field + '"></div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
      '<span style="flex:1;">起始 <input id="kf-c-start" type="number" value="1" style="' + field + '"></span>' +
      '<span style="flex:1;">结束 <input id="kf-c-end" type="number" value="10" style="' + field + '"></span>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
      '<span style="flex:1;">补零 <input id="kf-c-pad" type="number" value="0" style="' + field + '"></span>' +
      '<span style="flex:1;">价格 <input id="kf-c-price" type="number" value="0" style="' + field + '"></span>' +
      '</div>' +
      '<button id="kf-c-go" style="' + btn + '">开始批量创建</button>' +
      '<div id="kf-c-status" style="margin-top:8px;color:#57606a;font-size:12px;word-break:break-all;"></div>' +

      '</div>';

    document.body.appendChild(root);

    function $(id) { return root.querySelector(id); }

    catSelectEl = $('#kf-c-cat');
    refreshCatSelect();

    var toggleBtn = $('#kf-toggle');
    var bodyEl = $('#kf-body');
    toggleBtn.addEventListener('click', function () {
      var hidden = bodyEl.style.display === 'none';
      bodyEl.style.display = hidden ? '' : 'none';
      toggleBtn.textContent = hidden ? '收起' : '展开';
    });

    var eGo = $('#kf-e-go'), eUsed = $('#kf-e-used'), eStatus = $('#kf-e-status');
    eGo.addEventListener('click', function () {
      eGo.disabled = true; eGo.textContent = '导出中…';
      runExport(eUsed.checked, eStatus).finally(function () {
        eGo.disabled = false; eGo.textContent = '导出全部商品卡密';
      });
    });

    var cGo = $('#kf-c-go');
    cGo.addEventListener('click', function () {
      var prefix = $('#kf-c-prefix').value.trim();
      var start = parseInt($('#kf-c-start').value, 10);
      var end = parseInt($('#kf-c-end').value, 10);
      var padWidth = parseInt($('#kf-c-pad').value, 10) || 0;
      var price = $('#kf-c-price').value;
      var categoryId = $('#kf-c-catid').value.trim() || $('#kf-c-cat').value;
      var cStatus = $('#kf-c-status');

      if (!prefix) { cStatus.textContent = '请先填写前缀'; return; }
      if (!categoryId) { cStatus.textContent = '请选择分类，或填手动分类ID'; return; }
      if (isNaN(start) || isNaN(end) || start > end) {
        cStatus.textContent = '起始/结束编号不对（起始须 ≤ 结束）';
        return;
      }
      if (end - start + 1 > 500) { cStatus.textContent = '一次最多 500 个'; return; }

      cGo.disabled = true; cGo.textContent = '创建中…';
      runCreate({ prefix: prefix, start: start, end: end, padWidth: padWidth, price: price, categoryId: categoryId }, cStatus)
        .finally(function () {
          cGo.disabled = false; cGo.textContent = '开始批量创建';
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
