/**
 * 工具 B：从已加载的 JS Bundle 中提取所有 axios.post / fetch POST 调用
 *
 * 核心策略：
 *   1. 拦截 axios/fetch，记录真实调用（运行时）
 *   2. 静态扫描 bundle 文本，用正则提取 URL pattern
 *
 * 使用：DevTools Console 粘贴执行（需要先完成登录）
 */
(function scanBundleApi() {
  'use strict';

  // ── 第一步：运行时拦截 axios（如果页面使用 axios）───────────────
  // axios 通常挂在 window.axios 或通过模块系统暴露
  function patchAxios(axiosInstance, label) {
    if (!axiosInstance || axiosInstance.__patched) return;
    axiosInstance.__patched = true;

    const originalRequest = axiosInstance.request.bind(axiosInstance);
    axiosInstance.request = function (config) {
      const method = (config.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        console.group(`%c[${label}] ${method} ${config.url}`, 'color:#0af;font-weight:bold');
        console.log('%c  完整 config:', 'color:#fa0', JSON.parse(JSON.stringify(config)));
        console.log('%c  headers:', 'color:#fa0', config.headers);
        console.log('%c  data:', 'color:#fa0', config.data);
        console.groupEnd();
      }
      return originalRequest(config);
    };
    console.log(`%c✅ ${label} 已拦截`, 'color:#0f0');
  }

  // 尝试拦截全局 axios
  if (window.axios) patchAxios(window.axios, 'window.axios');

  // ── 第二步：静态扫描 Bundle 寻找 URL 模式 ──────────────────────
  const API_PATTERNS = [
    /['"`](\/(?:api|v\d+)[^\s'"`]{3,80})['"`]/g,  // /api/xxx 或 /v1/xxx
    /axios\.(?:post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /fetch\s*\(\s*['"`]([^'"`]{5,100})['"`]/g,
    /\$http\.(?:post|put|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  const ORDER_KEYWORDS = ['order', 'pay', 'buy', 'subscribe', 'purchase', 'checkout',
                          'apply', 'trade', 'product', 'plan', 'package'];

  async function scanScript(url) {
    let text;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      text = await res.text();
    } catch (e) {
      return;
    }

    const found = new Set();
    for (const pat of API_PATTERNS) {
      let m;
      pat.lastIndex = 0;
      while ((m = pat.exec(text)) !== null) {
        const endpoint = m[1];
        if (ORDER_KEYWORDS.some(k => endpoint.toLowerCase().includes(k))) {
          found.add(endpoint);
        }
      }
    }

    if (found.size) {
      const short = url.split('/').pop().split('?')[0];
      console.group(`%c📦 ${short} — ${found.size} 个相关 API`, 'color:#fa0;font-weight:bold');
      found.forEach(ep => console.log('  ', ep));
      console.groupEnd();
    }
  }

  // ── 第三步：提取页面 inline script 中的所有字符串字面量 ─────────
  function scanInlineScripts() {
    const inlines = Array.from(document.querySelectorAll('script:not([src])'));
    inlines.forEach((s, i) => {
      const text = s.textContent;
      const found = new Set();
      for (const pat of API_PATTERNS) {
        let m;
        pat.lastIndex = 0;
        while ((m = pat.exec(text)) !== null) {
          const ep = m[1];
          if (ORDER_KEYWORDS.some(k => ep.toLowerCase().includes(k))) found.add(ep);
        }
      }
      if (found.size) {
        console.group(`%c📄 inline script[${i}]`, 'color:#fa0');
        found.forEach(ep => console.log('  ', ep));
        console.groupEnd();
      }
    });
  }

  (async () => {
    console.log('%c🔍 开始静态扫描 Bundle…', 'color:#0af;font-weight:bold');

    const urls = Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src).filter(Boolean);

    scanInlineScripts();
    await Promise.all(urls.map(scanScript));

    console.log('%c✅ 扫描完成', 'color:#0f0;font-weight:bold');
    console.log('\n%c📌 下一步：', 'color:#f80');
    console.log('  1. 记录上方输出的 API 路径');
    console.log('  2. 执行 intercept_requests.js 并强制触发按钮，验证实际 URL');
    console.log('  3. 把结果截图/粘贴给 Claude，完成 Go 方案设计');
  })();
})();
