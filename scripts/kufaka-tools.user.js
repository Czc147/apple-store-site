// ==UserScript==
// @name         酷发卡 · 工具（卡密导出 + 商品批量创建 + 批量生成卡密）
// @namespace    kufaka.tools
// @version      1.3.0
// @description  卡密按商品导出为 txt，支持按分类过滤（只读不删除）；按分类+前缀批量创建商品（重名跳过，分类自动识别）；按分类批量生成随机卡密并写入库存（导入接口自动学习）
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
  var IMP_KEY = 'kufaka_import_api_v1';

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

  // ===== 导入卡密接口自动学习 =====
  // 目标：用户在后台手动给任意商品「添加/导入卡密」一次，就把那个请求的
  // 路径与请求体模板记下来，之后批量生成直接复用，不用猜接口。
  var importApi = null;
  var selfCall = false; // 脚本自己发的导入请求不参与学习，避免模板被自己覆盖
  try { importApi = JSON.parse(localStorage.getItem(IMP_KEY) || 'null'); } catch (e) {}
  var candidates = [];
  var SKIP_STR_KEYS = { goods_id: 1, keywords: 1, status: 1, first: 1, name: 1, goods_type: 1, is_proxy: 1 };

  function apiPath(url) {
    var m = String(url).match(/\/merchantApi(\/[^?#]*)/);
    return m ? m[1] : '';
  }

  function findCardField(body) {
    var keys = Object.keys(body);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (SKIP_STR_KEYS[k]) continue;
      var v = body[k];
      if (typeof v === 'string' && v.trim().length >= 3) return k;
      if (Array.isArray(v) && v.length && typeof v[0] === 'string') return k;
    }
    return '';
  }

  function sniffRequest(url, bodyText, respJson) {
    if (!bodyText || typeof bodyText !== 'string') return;
    if (!respJson || respJson.code !== 1) return;
    var path = apiPath(url);
    if (!path || /\/list$/i.test(path)) return;
    var body;
    try { body = JSON.parse(bodyText); } catch (e) { return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return;
    if (!('goods_id' in body)) return;
    var field = findCardField(body);
    if (!field) return;

    var rec = { path: path, field: field, body: body, at: Date.now() };
    candidates.unshift(rec);
    if (candidates.length > 5) candidates.pop();
    importApi = rec;
    try { localStorage.setItem(IMP_KEY, JSON.stringify(rec)); } catch (e) {}
    refreshImportHint();
  }

  function hookFetch() {
    var of = window.fetch;
    if (!of) return;
    window.fetch = function () {
      var args = arguments;
      var u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
      var reqBody = args[1] && typeof args[1].body === 'string' ? args[1].body : null;
      var p = of.apply(this, args);
      if (u && /merchantApi/i.test(u)) {
        p.then(function (r) {
          try {
            var c = r.clone();
            c.text().then(function (t) {
              var json = null;
              try { json = JSON.parse(t); } catch (e) { return; }
              try { sniffJson(u, json); } catch (e) {}
              if (reqBody && !selfCall) { try { sniffRequest(u, reqBody, json); } catch (e) {} }
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
    XMLHttpRequest.prototype.send = function (b) {
      var self = this;
      var reqBody = typeof b === 'string' ? b : null;
      this.addEventListener('load', function () {
        var json = null;
        try { json = JSON.parse(self.responseText); } catch (e) { return; }
        try { sniffJson(self.__u, json); } catch (e) {}
        if (reqBody && /merchantApi/i.test(String(self.__u))) {
          try { sniffRequest(self.__u, reqBody, json); } catch (e) {}
        }
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

  async function fetchAllGoods(categoryId) {
    var out = [], current = 1, pageSize = 100;
    var body = {
      current: current, pageSize: pageSize,
      goods_type: 'card', status: 999, name: '', is_proxy: '0'
    };
    if (categoryId) body.category_id = Number(categoryId);
    for (;;) {
      body.current = current;
      var json = await postJson('/Goods/list', body);
      var data = json.data || {};
      var list = data.list || [];
      out.push.apply(out, list);
      if (list.length < pageSize || out.length >= (data.total || 0)) break;
      current += 1;
    }
    if (categoryId) {
      var hasField = out.length === 0 || out[0].category_id !== undefined;
      if (hasField) out = out.filter(function (g) { return Number(g.category_id) === Number(categoryId); });
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

  async function runExport(includeUsed, categoryId, statusEl) {
    statusEl.textContent = '正在获取商品列表…';
    var goods;
    try { goods = await fetchAllGoods(categoryId); }
    catch (e) { statusEl.textContent = '获取商品失败：' + e.message; return; }
    if (!goods.length) { statusEl.textContent = categoryId ? '该分类下没有卡密商品' : '没有卡密商品'; return; }

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

  // ===== 批量生成卡密 =====
  var CHARSETS = {
    num: '0123456789',
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',       // 去掉易混淆的 O0I1
    mixed: 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  };

  function randomStrings(count, length, charset, prefix, used) {
    var out = [];
    var n = charset.length;
    var buf = new Uint32Array(length);
    var guard = 0;
    while (out.length < count) {
      crypto.getRandomValues(buf);
      var s = '';
      for (var i = 0; i < length; i++) s += charset[buf[i] % n];
      s = prefix + s;
      if (used[s]) {
        if (++guard > count * 50 + 1000) throw new Error('随机空间太小，请加长卡密长度');
        continue;
      }
      used[s] = 1;
      out.push(s);
    }
    return out;
  }

  function buildImportBody(goodsId, cards) {
    var body = JSON.parse(JSON.stringify(importApi.body));
    body.goods_id = goodsId;
    var cur = importApi.body[importApi.field];
    body[importApi.field] = Array.isArray(cur) ? cards : cards.join('\n');
    return body;
  }

  async function importCards(goodsId, cards, chunkSize) {
    for (var i = 0; i < cards.length; i += chunkSize) {
      var part = cards.slice(i, i + chunkSize);
      selfCall = true;
      try {
        await postJson(importApi.path, buildImportBody(goodsId, part));
      } finally {
        selfCall = false;
      }
      await sleep(150);
    }
  }

  async function runGenerate(cfg, statusEl) {
    if (!importApi) {
      statusEl.textContent = '还没学到「导入卡密」接口：请先在后台随便给一个商品手动添加 1 条卡密，然后回到这里再点。';
      return;
    }
    statusEl.textContent = '正在获取该分类的商品…';
    var goods;
    try { goods = await fetchAllGoods(cfg.categoryId); }
    catch (e) { statusEl.textContent = '获取商品失败：' + e.message; return; }
    if (!goods.length) { statusEl.textContent = '该分类下没有卡密商品'; return; }

    var used = {};
    var ok = 0, fail = 0, madeTotal = 0;
    for (var i = 0; i < goods.length; i++) {
      var g = goods[i];
      statusEl.textContent = '生成 ' + g.name + '（' + (i + 1) + '/' + goods.length + '）…';
      try {
        var cards = randomStrings(cfg.count, cfg.length, CHARSETS[cfg.charset], cfg.prefix, used);
        await importCards(g.id, cards, 200);
        ok += 1;
        madeTotal += cards.length;
      } catch (e) {
        fail += 1;
        statusEl.textContent = g.name + ' 失败：' + e.message + '，继续…';
        await sleep(600);
      }
    }
    statusEl.textContent = '完成：' + ok + '/' + goods.length + ' 个商品，共写入 ' + madeTotal +
      ' 条卡密' + (fail ? '，失败 ' + fail + ' 个' : '');
  }

  // ===== 面板 UI =====
  var catSelectEl = null;
  var eCatSelectEl = null;
  var gCatSelectEl = null;
  var impHintEl = null;

  function refreshImportHint() {
    if (!impHintEl) return;
    if (importApi) {
      impHintEl.style.color = '#1a7f37';
      impHintEl.textContent = '✓ 导入接口已学到：' + importApi.path;
    } else {
      impHintEl.style.color = '#bf3989';
      impHintEl.textContent = '× 还没学到导入接口：先在后台手动给任意商品添加 1 条卡密';
    }
  }

  function refreshCatSelect() {
    var opts = '';
    categories.forEach(function (c) {
      opts += '<option value="' + c.id + '">' + c.name + '</option>';
    });
    if (catSelectEl) catSelectEl.innerHTML = opts;
    if (gCatSelectEl) gCatSelectEl.innerHTML = opts;
    if (eCatSelectEl) eCatSelectEl.innerHTML = '<option value="">全部分类</option>' + opts;
  }

  function buildUI() {
    var root = document.createElement('div');
    root.style.cssText =
      'position:fixed;right:16px;bottom:16px;' +
      'z-index:2147483647;width:300px;' +
      'max-height:82vh;overflow:auto;' +
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
      '<div style="margin-bottom:6px;">分类 <select id="kf-e-cat" style="' + field + 'background:#fff;"><option value="">全部分类</option></select></div>' +
      '<label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer;">' +
      '<input type="checkbox" id="kf-e-used" style="accent-color:#0a84ff;">' +
      '<span>包含已使用的卡密</span></label>' +
      '<button id="kf-e-go" style="' + btn + '">导出卡密</button>' +
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

      '<div style="' + sub + '">三、批量生成卡密</div>' +
      '<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:8px;">' +
      '<div id="kf-g-hint" style="flex:1;font-size:12px;word-break:break-all;"></div>' +
      '<button id="kf-g-reset" type="button" style="border:none;background:#f0f0f0;color:#57606a;' +
      'border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;white-space:nowrap;">重新学习</button>' +
      '</div>' +
      '<div style="margin-bottom:6px;">分类 <select id="kf-g-cat" style="' + field + 'background:#fff;"></select></div>' +
      '<div style="margin-bottom:6px;">或手动分类ID <input id="kf-g-catid" type="number" placeholder="留空则用上面的分类" style="' + field + '"></div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
      '<span style="flex:1;">每个商品几条 <input id="kf-g-count" type="number" value="10" style="' + field + '"></span>' +
      '<span style="flex:1;">卡密长度 <input id="kf-g-len" type="number" value="16" style="' + field + '"></span>' +
      '</div>' +
      '<div style="margin-bottom:6px;">字符类型 <select id="kf-g-set" style="' + field + 'background:#fff;">' +
      '<option value="upper">大写字母+数字（去易混淆）</option>' +
      '<option value="mixed">大小写字母+数字</option>' +
      '<option value="num">纯数字</option>' +
      '</select></div>' +
      '<div style="margin-bottom:10px;">卡密前缀（可留空） <input id="kf-g-prefix" type="text" placeholder="如 AP-" style="' + field + '"></div>' +
      '<button id="kf-g-go" style="' + btn + '">开始生成卡密</button>' +
      '<div id="kf-g-status" style="margin-top:8px;color:#57606a;font-size:12px;word-break:break-all;"></div>' +

      '</div>';

    document.body.appendChild(root);

    function $(id) { return root.querySelector(id); }

    catSelectEl = $('#kf-c-cat');
    eCatSelectEl = $('#kf-e-cat');
    gCatSelectEl = $('#kf-g-cat');
    impHintEl = $('#kf-g-hint');
    refreshCatSelect();
    refreshImportHint();

    var toggleBtn = $('#kf-toggle');
    var bodyEl = $('#kf-body');
    toggleBtn.addEventListener('click', function () {
      var hidden = bodyEl.style.display === 'none';
      bodyEl.style.display = hidden ? '' : 'none';
      toggleBtn.textContent = hidden ? '收起' : '展开';
    });

    var eGo = $('#kf-e-go'), eUsed = $('#kf-e-used'), eStatus = $('#kf-e-status'), eCat = $('#kf-e-cat');
    eGo.addEventListener('click', function () {
      eGo.disabled = true; eGo.textContent = '导出中…';
      runExport(eUsed.checked, eCat.value, eStatus).finally(function () {
        eGo.disabled = false; eGo.textContent = '导出卡密';
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

    $('#kf-g-reset').addEventListener('click', function () {
      importApi = null;
      try { localStorage.removeItem(IMP_KEY); } catch (e) {}
      refreshImportHint();
    });

    var gGo = $('#kf-g-go');
    gGo.addEventListener('click', function () {
      var gStatus = $('#kf-g-status');
      var categoryId = $('#kf-g-catid').value.trim() || $('#kf-g-cat').value;
      var count = parseInt($('#kf-g-count').value, 10);
      var length = parseInt($('#kf-g-len').value, 10);
      var charset = $('#kf-g-set').value;
      var prefix = $('#kf-g-prefix').value.trim();

      if (!categoryId) { gStatus.textContent = '请选择分类，或填手动分类ID'; return; }
      if (isNaN(count) || count < 1 || count > 2000) { gStatus.textContent = '每个商品条数请填 1–2000'; return; }
      if (isNaN(length) || length < 4 || length > 64) { gStatus.textContent = '卡密长度请填 4–64'; return; }

      gGo.disabled = true; gGo.textContent = '生成中…';
      runGenerate({ categoryId: categoryId, count: count, length: length, charset: charset, prefix: prefix }, gStatus)
        .finally(function () {
          gGo.disabled = false; gGo.textContent = '开始生成卡密';
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
