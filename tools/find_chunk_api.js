/**
 * 工具 H：分析懒加载 chunk "apikey-coding-plan-enterprise"
 *
 * 已知信息：
 *   - axios baseURL = /api
 *   - 购买逻辑在 webpack chunk "ab70"（apikey-coding-plan-enterprise）
 *   - 拦截器会自动注入 token（withToken:true）
 *
 * 目标：找到真实的后端 API endpoint + 请求 Body 字段
 */
(async function findChunkApi() {
  'use strict';

  // ── 1. 找到所有已加载的 chunk script ─────────────────────────
  const allScripts = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src);

  // 找包含 "ab70" 或 "coding-plan" 或 "enterprise" 的 chunk
  const targetChunks = allScripts.filter(u =>
    /ab70|coding.?plan|enterprise|coding/i.test(u.split('/').pop())
  );

  console.log('%c已加载的所有 JS chunk：', 'color:#0af');
  allScripts.forEach(u => console.log('  ', u.split('/').pop()));

  console.log('%c\n目标 chunk 候选：', 'color:#fa0;font-weight:bold');
  targetChunks.forEach(u => console.log('  ', u));

  // ── 2. 如果目标 chunk 尚未加载（懒加载），强制触发加载 ────────
  // 导航到 /apikey/coding-plan-ent 会触发加载
  if (!targetChunks.length) {
    console.log('%c⏳ 目标 chunk 未加载，尝试触发懒加载…', 'color:#f80');

    // 方式一：用 Vue Router 导航
    const vueApp = document.querySelector('#app')?.__vue_app__;
    const router = vueApp?.config?.globalProperties?.$router;
    if (router) {
      await router.push('/apikey/coding-plan-ent').catch(() => {});
      console.log('%c✅ Router 导航完成，等待 chunk 加载…', 'color:#0f0');
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.warn('未找到 Vue Router，请手动访问 bigmodel.cn/apikey/coding-plan-ent 再重跑此脚本');
      return;
    }
  }

  // ── 3. 重新收集脚本（懒加载后可能有新 chunk）──────────────────
  const allScripts2 = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
  const chunks = allScripts2.filter(u =>
    /ab70|coding.?plan|enterprise/i.test(u.split('/').pop())
  );
  console.log('\n%c分析目标 chunk：', 'color:#4f4;font-weight:bold', chunks);

  // ── 4. 扫描目标 chunk ─────────────────────────────────────────
  const API_RE = [
    // axios 调用
    /\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    // 字符串 URL 字面量
    /['"`](\/[a-z][a-z0-9/_\-]{4,80})['"`]/g,
  ];

  const KEYWORDS = ['order', 'pay', 'buy', 'subscribe', 'purchase',
                    'apply', 'coding', 'plan', 'package', 'product'];

  for (const url of chunks) {
    const src = await fetch(url, { cache: 'force-cache' }).then(r => r.text());
    const found = new Map(); // endpoint → 上下文片段

    for (const re of API_RE) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(src)) !== null) {
        const ep = m[2] || m[1];
        if (ep && KEYWORDS.some(k => ep.toLowerCase().includes(k))) {
          const ctxStart = Math.max(0, m.index - 300);
          const ctxEnd   = Math.min(src.length, m.index + 500);
          found.set(ep, src.slice(ctxStart, ctxEnd));
        }
      }
    }

    if (found.size) {
      console.group(`%c📦 ${url.split('/').pop()} — ${found.size} 个相关 API`, 'color:#fa0;font-weight:bold');
      for (const [ep, ctx] of found.entries()) {
        console.group(`  📌 ${ep}`);
        console.log(ctx.replace(/([,;{}])/g, '$1\n  ').slice(0, 800));
        console.groupEnd();
      }
      console.groupEnd();
    }
  }

  // ── 5. 同时从 Vuex/Pinia store 找 token ──────────────────────
  console.log('\n%c🔑 查找 Token 存储位置：', 'color:#f80;font-weight:bold');

  // Vuex (Vue 2)
  const vue2 = document.querySelector('#app')?.__vue__;
  if (vue2?.$store) {
    const state = vue2.$store.state;
    console.log('Vuex state keys:', Object.keys(state));
    JSON.stringify(state, (k, v) => {
      if (/token|auth|jwt|session/i.test(k) && typeof v === 'string') {
        console.log(`  %cVuex state.${k}: ${v.slice(0,50)}…`, 'color:#4f4');
      }
      return v;
    });
  }

  // Vue 3 Pinia / 全局 properties
  const vue3 = document.querySelector('#app')?.__vue_app__;
  if (vue3) {
    const g = vue3.config?.globalProperties;
    if (g?.$store) {
      console.log('Pinia/Vuex4 store state keys:', Object.keys(g.$store.state || {}));
    }
  }

  // localStorage
  const lsTokens = Object.entries(localStorage)
    .filter(([k]) => /token|auth|jwt|session|user/i.test(k));
  if (lsTokens.length) {
    console.log('%c  localStorage 中的 token 字段：', 'color:#4f4');
    lsTokens.forEach(([k, v]) => console.log(`    ${k}: ${String(v).slice(0, 80)}`));
  }

  // Cookie
  const authCookies = document.cookie.split(';')
    .filter(c => /token|auth|session|login/i.test(c));
  if (authCookies.length) {
    console.log('%c  Cookie 中的认证字段：', 'color:#4f4');
    authCookies.forEach(c => console.log('   ', c.trim().slice(0, 100)));
  }

  console.log('%c\n✅ 分析完成', 'color:#0f0;font-weight:bold');
})();
