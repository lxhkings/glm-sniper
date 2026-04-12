/**
 * 工具 L：获取 bizId 并完成完整购买链路验证
 *
 * 已知：
 *   - Authorization: Bearer <bigmodel_token_production cookie>
 *   - isLimitBuy 已返回 200，认证成功
 *   - product/info 需要必填参数（400）
 */
(async function getBizId() {
  'use strict';

  // ── 取 token（同上）─────────────────────────────────────────
  const cookieMatch = document.cookie.match(/bigmodel_token_production=([^;]+)/);
  const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  if (!token) { console.error('未找到 token'); return; }

  const HEADERS = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
    'Referer':       'https://bigmodel.cn/glm-coding',
    'Origin':        'https://bigmodel.cn',
  };
  const BASE = 'https://bigmodel.cn/api';

  async function call(method, path, body) {
    const opts = { method, headers: HEADERS, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(BASE + path, opts);
    const json = await res.json().catch(() => ({}));
    return json;
  }

  // ── 1. 展开 isLimitBuy 的完整响应 ────────────────────────────
  console.log('%c=== isLimitBuy 完整响应 ===', 'color:#0af;font-weight:bold');
  const limitRes = await call('GET', '/biz/product/isLimitBuy');
  console.log(JSON.stringify(limitRes, null, 2));

  // ── 2. 从 Vuex store 找 CodingPlan 相关数据 ──────────────────
  console.log('%c\n=== Vuex Permission.CodingPlan ===', 'color:#f80;font-weight:bold');
  const vuex = document.querySelector('#app')?.__vue__?.$store?.state;
  if (vuex) {
    console.log('Permission.CodingPlan:', JSON.stringify(vuex.Permission?.CodingPlan, null, 2));
    console.log('Pay:', JSON.stringify(vuex.Pay, null, 2));
    console.log('User.userInfo:', JSON.stringify(vuex.User?.userInfo, null, 2));
  }

  // ── 3. 从页面 DOM 找 bizId（数据属性/隐藏字段）────────────────
  console.log('%c\n=== DOM 中的 bizId / productId ===', 'color:#f80;font-weight:bold');
  document.querySelectorAll('[data-bizid],[data-product-id],[data-id]').forEach(el =>
    console.log(el.tagName, el.dataset));

  // ── 4. 尝试各种 product/info 参数 ────────────────────────────
  console.log('%c\n=== 尝试 product/info 参数 ===', 'color:#f80;font-weight:bold');

  // 尝试常见的查询参数名
  for (const [k, v] of [
    ['type', 'coding'],
    ['type', 'CODING_PLAN'],
    ['productType', 'coding'],
    ['category', 'coding'],
    ['scene', 'glm-coding'],
    ['source', 'glm-coding'],
  ]) {
    const r = await call('GET', `/biz/product/info?${k}=${v}`);
    if (r.code === 200) {
      console.log(`%c✅ 成功！?${k}=${v}`, 'color:#0f0', JSON.stringify(r.data, null, 2).slice(0, 400));
      break;
    } else {
      console.log(`  ?${k}=${v} → code=${r.code} msg=${r.msg || r.error}`);
    }
  }

  // ── 5. 直接从 ClaudeCode chunk 的网络请求历史找 bizId ────────
  // 监听接下来 5s 内的所有 XHR/fetch（用户滚动或交互可能触发）
  console.log('%c\n=== 监听 5s 内自动触发的 API 请求（找 bizId）===', 'color:#f80');

  const _fetch = window.fetch;
  const captured = [];
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('bigmodel.cn')) {
      captured.push({ url, method: init?.method || 'GET', body: init?.body });
    }
    return _fetch.apply(this, arguments);
  };

  await new Promise(r => setTimeout(r, 3000));
  window.fetch = _fetch; // 还原

  if (captured.length) {
    console.log(`%c捕获到 ${captured.length} 个请求：`, 'color:#4f4');
    captured.forEach(r => console.log(' ', r.method, r.url.replace('https://bigmodel.cn', ''), r.body ? JSON.parse(r.body) : ''));
  } else {
    console.log('3s 内无自动请求。请手动点击页面套餐卡片，触发产品数据加载。');
  }

  // ── 6. 从 Vue 组件树遍历找 cardData / priceData ───────────────
  console.log('%c\n=== Vue 组件树找 bizId ===', 'color:#f80;font-weight:bold');
  function walkComponents(el, depth = 0) {
    if (depth > 15) return;
    const key = Object.keys(el).find(k => k.startsWith('__vueParentComponent'));
    if (key) {
      const inst = el[key];
      const search = inst?.setupState || inst?.ctx || inst?.data?.() || {};
      const relevant = Object.entries(search).filter(([, v]) => {
        const s = JSON.stringify(v);
        return s && /bizId|priceId|productId|planCode|packag/i.test(s);
      });
      if (relevant.length) {
        console.log(`%c组件 "${inst?.type?.name || '匿名'}" 含相关字段:`, 'color:#4f4');
        relevant.forEach(([k, v]) => console.log(`  ${k}:`, v));
      }
    }
    Array.from(el.children || []).forEach(c => walkComponents(c, depth + 1));
  }
  walkComponents(document.body);

  console.log('%c\n✅ 完成', 'color:#0f0');
})();
