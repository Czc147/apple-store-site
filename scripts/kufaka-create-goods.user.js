// ==UserScript==
// @name         酷发卡 · 商品批量创建
// @namespace    kufaka.create
// @version      1.0.0
// @description  选择分类、输入前缀，按 起始编号~结束编号 批量创建卡密商品（重名自动跳过）
// @author       you
// @match        https://www.kufaka.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const API = 'https://www.kufaka.com/merchantApi';

  function getToken() {
    const m = document.cookie.match(/(?:^|;\s*)merchant-token=([^;]+)/);
    if (m && m[1]) return m[1];
    try {
      const t = localStorage.getItem('merchant-token');
      if (t) return t;
    } catch (e) {}
    return '';
  }

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

  // 拉取已有商品名（用于重名跳过）
  async function fetchExistingNames() {
    const names = new Set();
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
      for (const it of list) if (it.name) names.add(String(it.name));
      if (list.length < pageSize || names.size >= (data.total || 0)) break;
      current += 1;
    }
    return names;
  }

  function buildPayload(name, categoryId, price) {
    return {
      goods_type: 'card',
      id: 0,
      name: name,
      image: '',
      category_id: Number(categoryId) || 0,
      price: Number(price) || 0,
      market_price: 0,
      description: '',
      sort: 0,
      coupon_status: 1,
      status: 1,
      fee_payer: -1,
      show: 1,
      contact_format: 'any',
      agent_status: 0,
      agent_price1: 0,
      agent_price2: 0,
      agent_price3: 0,
      agent_price_limit: 0,
      description_sync: 0,
      name_sync: 0,
      parent_id: 0,
      cost_price: 0,
      add_type: 1,
      add_rate: 0,
      add_price: 0,
      extend: {
        instructions: '<p><br></p>',
        stock_notice: 0,
        lock_card: 0,
        limit_count: 1,
        limit_count_max: 0,
        show_stock_type: 0,
        send_order: 0,
        query_password_status: 0,
      },
    };
  }

  function pad(num, width) {
    let s = String(num);
    while (s.length < width) s = '0' + s;
    return s;
  }

  async function run(cfg, statusEl) {
    statusEl.textContent = '正在读取已有商品名…';
    let existing;
    try {
      existing = await fetchExistingNames();
    } catch (e) {
      statusEl.textContent = '读取商品失败：' + e.message + '（请确认已登录，并在商品列表页运行）';
      return;
    }

    const total = cfg.end - cfg.start + 1;
    let ok = 0, dup = 0, fail = 0;
    for (let n = cfg.start; n <= cfg.end; n++) {
      const name = cfg.prefix + (cfg.padWidth > 0 ? pad(n, cfg.padWidth) : String(n));
      const idx = n - cfg.start + 1;
      if (existing.has(name)) {
        dup++;
        statusEl.textContent = '跳过 ' + name + '（已存在） ' + idx + '/' + total;
        continue;
      }
      statusEl.textContent = '创建 ' + name + '（' + idx + '/' + total + '）…';
      try {
        await postJson('/Goods/update', buildPayload(name, cfg.categoryId, cfg.price));
        existing.add(name);
        ok++;
      } catch (e) {
        fail++;
        statusEl.textContent = '创建 ' + name + ' 失败：' + e.message + '，继续…';
      }
    }
    statusEl.textContent = '完成：成功 ' + ok + ' · 跳过(重名) ' + dup + ' · 失败 ' + fail;
  }

  function buildUI() {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;left:16px;bottom:16px;' +
      'z-index:2147483647;width:280px;' +
      'background:#fff;border:1px solid #d0d7de;' +
      'border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.15);' +
      'padding:14px;' +
      'font:13px/1.5 "Microsoft YaHei",sans-serif;' +
      'color:#1f2328;';

    root.innerHTML =
      '<div style="font-weight:600;margin-bottom:10px;font-size:14px;">酷发卡 · 商品批量创建</div>' +
      '<div style="margin-bottom:6px;">分类 <select id="kf-cat" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;background:#fff;">' +
      '<option value="3818">2026.8</option>' +
      '</select></div>' +
      '<div style="margin-bottom:6px;">前缀 <input id="kf-prefix" type="text" placeholder="如 M" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;"></div>' +
      '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
      '<span style="flex:1;">起始 <input id="kf-start" type="number" value="1" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;"></span>' +
      '<span style="flex:1;">结束 <input id="kf-end" type="number" value="10" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;"></span>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
      '<span style="flex:1;">补零 <input id="kf-pad" type="number" value="0" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;"></span>' +
      '<span style="flex:1;">价格 <input id="kf-price" type="number" value="0" ' +
      'style="width:100%;box-sizing:border-box;padding:5px;border:1px solid #d0d7de;border-radius:5px;"></span>' +
      '</div>' +
      '<button id="kf-go" style="width:100%;padding:8px;border:none;border-radius:6px;' +
      'background:#0a84ff;color:#fff;font-weight:600;cursor:pointer;">开始批量创建</button>' +
      '<div id="kf-status" style="margin-top:10px;color:#57606a;font-size:12px;word-break:break-all;"></div>';

    document.body.appendChild(root);

    const $ = (id) => root.querySelector(id);
    const statusEl = $('#kf-status');
    const goBtn = $('#kf-go');

    goBtn.addEventListener('click', async () => {
      const prefix = $('#kf-prefix').value.trim();
      const start = parseInt($('#kf-start').value, 10);
      const end = parseInt($('#kf-end').value, 10);
      const padWidth = parseInt($('#kf-pad').value, 10) || 0;
      const price = $('#kf-price').value;
      const categoryId = $('#kf-cat').value;

      if (!prefix) { statusEl.textContent = '请先填写前缀'; return; }
      if (isNaN(start) || isNaN(end) || start > end) {
        statusEl.textContent = '起始/结束编号不对（起始须 ≤ 结束）';
        return;
      }
      if (end - start + 1 > 500) {
        statusEl.textContent = '一次最多 500 个，请缩小范围';
        return;
      }

      goBtn.disabled = true;
      goBtn.textContent = '创建中…';
      try {
        await run({ prefix, start, end, padWidth, price, categoryId }, statusEl);
      } finally {
        goBtn.disabled = false;
        goBtn.textContent = '开始批量创建';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
