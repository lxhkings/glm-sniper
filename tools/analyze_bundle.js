/**
 * GLM JS Bundle 函数分析器
 * 在 DevTools Console 执行，扫描页面已加载的所有 JS 源码，
 * 寻找 createOrder / apply / sign / encrypt 等关键函数，
 * 并判断是否存在动态签名逻辑。
 *
 * 使用方法：
 *   1. 打开 bigmodel.cn/glm-coding
 *   2. DevTools → Console，粘贴本脚本回车
 */
(function () {
  'use strict';

  // ── 1. 收集所有已加载的 JS 资源 URL ───────────────────────────
  const scriptUrls = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src)
    .filter(Boolean);

  console.log(`%c📦 共发现 ${scriptUrls.length} 个外部 Script：`, 'color:#0af;font-weight:bold');
  scriptUrls.forEach(u => console.log(' ', u));

  // ── 2. 扫描关键词的辅助函数 ────────────────────────────────────
  const PATTERNS = [
    // 下单 / 申请
    { label: '下单 API 调用',   re: /createOrder|placeOrder|submitOrder|apply|subscribe/gi },
    // 签名 / 加密
    { label: '签名/加密迹象',   re: /sign\s*[:=(]|hmac|sha256|md5|encrypt|crypto\s*\./gi },
    // 动态 timestamp / nonce
    { label: 'Timestamp/Nonce', re: /timestamp|nonce|nonceStr/gi },
    // Authorization Header 构造
    { label: 'Auth Header 构造', re: /Authorization|Bearer|token\s*[:=]/gi },
    // 关键 URL 片段
    { label: '关键 URL',        re: /\/order|\/pay|\/checkout|\/subscribe|\/purchase/gi },
  ];

  async function analyzeUrl(url) {
    let src;
    try {
      const res = await fetch(url);
      src = await res.text();
    } catch (e) {
      console.warn(`  ⚠ 无法拉取 ${url}:`, e.message);
      return;
    }

    const lines = src.split('\n');
    const findings = {};

    for (const { label, re } of PATTERNS) {
      const matched = [];
      lines.forEach((line, idx) => {
        re.lastIndex = 0;
        if (re.test(line)) {
          // 截取匹配行，最多 200 字符，避免 minified 单行太长
          matched.push({ line: idx + 1, snippet: line.trim().slice(0, 200) });
        }
      });
      if (matched.length) findings[label] = matched;
    }

    if (Object.keys(findings).length) {
      console.group(`%c🔍 ${url.split('/').pop()}`, 'color:#fa0;font-weight:bold');
      for (const [label, hits] of Object.entries(findings)) {
        console.group(`  📌 ${label} (${hits.length} 处)`);
        hits.slice(0, 5).forEach(h =>  // 最多展示 5 行，避免刷屏
          console.log(`    L${h.line}: %c${h.snippet}`, 'color:#aaa'));
        if (hits.length > 5) console.log(`    … 还有 ${hits.length - 5} 处`);
        console.groupEnd();
      }
      console.groupEnd();
    }
  }

  // ── 3. 并行拉取并分析所有 Bundle ──────────────────────────────
  (async () => {
    console.log('\n%c🔬 开始分析 Bundle，请稍候…', 'color:#0f0;font-weight:bold');
    await Promise.all(scriptUrls.map(analyzeUrl));
    console.log('%c✅ 分析完毕', 'color:#0f0;font-weight:bold');

    // ── 4. 在运行时全局对象上寻找 createOrder 函数 ─────────────
    console.log('\n%c🔎 扫描运行时全局对象中的 createOrder / apply…', 'color:#0af');
    const targets = ['createOrder', 'placeOrder', 'submitOrder', 'applySubscribe'];
    targets.forEach(name => {
      if (typeof window[name] === 'function') {
        console.log(`%c  ✅ 发现 window.${name}:`, 'color:#4f4', window[name].toString().slice(0, 300));
      }
    });

    // ── 5. 检查 Webpack/Vite chunk 暴露的模块 ──────────────────
    const webpackKey = Object.keys(window).find(k =>
      k.startsWith('webpackChunk') || k.startsWith('__vite'));
    if (webpackKey) {
      console.log(`%c  📦 检测到模块系统：${webpackKey}`, 'color:#0af');
      console.log('  可在 Console 输入以下命令遍历模块：');
      console.log(`  %cObject.keys(window["${webpackKey}"])`, 'color:#fa0');
    } else {
      console.log('  未检测到 Webpack/Vite 全局模块暴露');
    }
  })();
})();
