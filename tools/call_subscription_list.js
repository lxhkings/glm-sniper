/**
 * 工具 N：直接调用 subscriptionListFn，捕获 bizId
 *
 * subscriptionListFn 在登录后自动调用，会请求产品列表（含 bizId）
 * 我们直接从 Vue 实例调用它，拦截器会捕获请求。
 */
(async function callSubscriptionList() {
  'use strict';

  // ── 拦截所有 fetch/XHR（先于函数调用启动）─────────────────────
  const _fetch = window.fetch;
  const captured = [];
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (/bigmodel/.test(url)) {
      let body = init.body;
      try { body = JSON.parse(body); } catch(_) {}
      const entry = { url: url.replace('https://bigmodel.cn',''), method: (init.method||'GET').toUpperCase(), body };
      captured.push(entry);
      console.log('%c[请求]', 'color:#0af', entry.method, entry.url, body||'');
    }
    const resp = await _fetch.apply(this, arguments);
    // 克隆响应以便读取
    const clone = resp.clone();
    clone.json().then(json => {
      if (/bigmodel/.test(url)) {
        console.log('%c[响应]', 'color:#4f4', url.replace('https://bigmodel.cn',''), JSON.stringify(json).slice(0, 300));
      }
    }).catch(()=>{});
    return resp;
  };

  // ── 找 Vue 实例并调用 subscriptionListFn ─────────────────────
  function findAndCall() {
    // 从根组件向下找包含 subscriptionListFn 的组件
    function walk(el, depth = 0) {
      if (depth > 20) return null;
      // Vue 2
      const v2 = el.__vue__;
      if (v2 && typeof v2.subscriptionListFn === 'function') return v2;

      // Vue 3
      const key = Object.keys(el).find(k => k.startsWith('__vueParentComponent'));
      if (key) {
        const inst = el[key];
        const ctx = inst?.setupState || inst?.ctx || {};
        if (typeof ctx.subscriptionListFn === 'function') return ctx;
      }

      for (const child of el.children || []) {
        const r = walk(child, depth + 1);
        if (r) return r;
      }
      return null;
    }

    return walk(document.body);
  }

  const comp = findAndCall();
  if (comp) {
    console.log('%c✅ 找到组件，调用 subscriptionListFn()', 'color:#0f0');
    try {
      await comp.subscriptionListFn();
    } catch(e) {
      console.error('调用出错:', e);
    }
  } else {
    console.warn('未找到 subscriptionListFn，尝试从 Vuex 触发...');
    // 备用：直接触发页面的 created/mounted 钩子重新加载
    const vue2Root = document.querySelector('#app')?.__vue__;
    if (vue2Root) {
      const methods = Object.keys(vue2Root.$options?.methods || {});
      console.log('根组件 methods:', methods);
      // 找所有子组件
      function listChildren(vm, depth = 0) {
        if (depth > 5) return;
        const ms = Object.keys(vm.$options?.methods || {});
        if (ms.includes('subscriptionListFn')) {
          console.log('%c找到！调用中...', 'color:#0f0');
          vm.subscriptionListFn();
        }
        (vm.$children || []).forEach(c => listChildren(c, depth + 1));
      }
      listChildren(vue2Root);
    }
  }

  // ── 等待请求完成 ──────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 3000));
  window.fetch = _fetch;

  // ── 汇报 ─────────────────────────────────────────────────────
  console.log('%c\n=== 捕获到的请求汇总 ===', 'color:#f80;font-weight:bold');
  if (!captured.length) {
    console.warn('没有捕获到请求。');
    console.log('改用 Network 面板方式：');
    console.log('1. DevTools → Network → Fetch/XHR → Preserve log');
    console.log('2. 手动刷新页面（F5），登录后页面自动调用 subscriptionListFn');
    console.log('3. 找到 /biz/ 开头的请求，查看 Payload');
    return;
  }
  captured.forEach((r, i) => console.log(`[${i}]`, r.method, r.url, r.body));

  // 找含 bizId 的响应
  console.log('%c\n找 bizId…', 'color:#0af');
  // 再直接请求一次，打印完整响应
  const token = decodeURIComponent(document.cookie.match(/bigmodel_token_production=([^;]+)/)?.[1] || '');
  if (!token) return;
  const H = { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` };

  // 根据捕获到的 URL 尝试重放
  for (const req of captured) {
    if (req.url.includes('/biz/')) {
      const r = await fetch('https://bigmodel.cn' + req.url, {
        method: req.method,
        headers: H,
        body: req.body ? JSON.stringify(req.body) : undefined,
        credentials: 'include',
      });
      const json = await r.json();
      console.log(`重放 ${req.method} ${req.url}:`, JSON.stringify(json, null, 2).slice(0, 600));
    }
  }
})();
