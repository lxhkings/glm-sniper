/**
 * 工具 I：精准扫描 ClaudeCode + SubscribePay chunk 中的购买 API
 *
 * 目标 chunk（从页面已加载列表识别）：
 *   - ClaudeCode.*.js                                    ← 主购买逻辑
 *   - vendors~ClaudeCode~SubscribePay~*.js               ← 支付封装
 *   - ClaudeCode~SpecialArea~subscribe-overview.*.js     ← 特殊活动页
 *   - ClaudeCode~subscribe-overview.*.js                 ← 订阅概览
 */
(async function scanClaudeCodeChunk() {
  'use strict';

  // ── 1. 收集目标 chunk URL ─────────────────────────────────────
  const allScripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);

  const targets = allScripts.filter(u => {
    const name = u.split('/').pop();
    return /ClaudeCode|SubscribePay|subscribe-overview|SpecialArea/i.test(name);
  });

  console.log('%c🎯 目标 chunk：', 'color:#0af;font-weight:bold');
  targets.forEach(u => console.log('  ', u.split('/').pop(), '\n  ', u));

  if (!targets.length) {
    console.error('❌ 未找到目标 chunk，请确认在 bigmodel.cn/glm-coding 页面执行');
    return;
  }

  // ── 2. 搜索模式 ───────────────────────────────────────────────
  const SEARCH = [
    {
      label: '🔴 axios POST/GET 调用',
      re: /\.(post|get|put|patch|delete)\s*\(\s*['"`]([^'"`\n]{4,80})['"`]/g,
      extract: m => ({ method: m[1].toUpperCase(), url: m[2] }),
    },
    {
      label: '🟠 URL 字符串字面量',
      re: /['"`](\/(?:api|v\d+)[^'"`\s]{3,60})['"`]/g,
      extract: m => ({ url: m[1] }),
    },
    {
      label: '🟡 签名/加密字段',
      re: /\b(sign|hmac|sha256|md5|nonce|timestamp|encrypt)\b/g,
      extract: m => ({ keyword: m[1] }),
    },
    {
      label: '🟢 Token/Auth 字段',
      re: /['"`](token|authorization|Bearer|accessToken|refresh_token)['"`]/gi,
      extract: m => ({ field: m[1] }),
    },
  ];

  // ── 3. 逐 chunk 扫描 ──────────────────────────────────────────
  for (const scriptUrl of targets) {
    const chunkName = scriptUrl.split('/').pop();
    let src;
    try {
      src = await fetch(scriptUrl, { cache: 'force-cache' }).then(r => r.text());
    } catch (e) {
      console.warn(`⚠ 无法加载 ${chunkName}:`, e.message);
      continue;
    }

    console.group(`\n%c📦 ${chunkName} (${(src.length/1024).toFixed(0)} KB)`, 'color:#fa0;font-weight:bold');

    for (const { label, re, extract } of SEARCH) {
      const hits = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(src)) !== null) {
        const info = extract(m);
        const ctxStart = Math.max(0, m.index - 200);
        const ctxEnd   = Math.min(src.length, m.index + 400);
        hits.push({ ...info, ctx: src.slice(ctxStart, ctxEnd) });
        if (hits.length >= 20) break; // 防刷屏
      }

      if (hits.length) {
        console.group(`  ${label} — ${hits.length} 处`);
        hits.forEach((h, i) => {
          const desc = h.method ? `${h.method} ${h.url}` : (h.url || h.keyword || h.field);
          console.group(`    [${i}] ${desc}`);
          console.log(h.ctx.replace(/([,;{}()])/g, '$1\n      ').slice(0, 600));
          console.groupEnd();
        });
        console.groupEnd();
      }
    }

    // 额外：找完整函数体（含 subscribe/order/apply/buy）
    console.group('  🔍 含购买语义的函数片段');
    const fnRe = /function\s+\w*(?:subscribe|order|buy|apply|pay)\w*\s*\(|(?:subscribe|order|buy|apply|pay)\w*\s*[:=]\s*(?:async\s*)?(?:function|\()/gi;
    let fm;
    fnRe.lastIndex = 0;
    let fnCount = 0;
    while ((fm = fnRe.exec(src)) !== null && fnCount < 5) {
      const snippet = src.slice(fm.index, fm.index + 600);
      console.log(`  @ ${fm.index}:`, snippet.replace(/([,;{}()])/g, '$1\n  ').slice(0, 500));
      fnCount++;
    }
    console.groupEnd();

    console.groupEnd(); // chunk group
  }

  // ── 4. Token 在哪里 ───────────────────────────────────────────
  console.log('\n%c🔑 Token / Session 检查：', 'color:#f80;font-weight:bold');

  const lsAll = Object.entries(localStorage);
  const ssAll = Object.entries(sessionStorage);

  console.log('localStorage 全部 keys：', lsAll.map(([k]) => k));
  lsAll.filter(([k, v]) => /token|auth|user|session|jwt|login/i.test(k) || String(v).startsWith('ey'))
    .forEach(([k, v]) => console.log(`  %c${k}: %c${String(v).slice(0,100)}`, 'color:#4f4', 'color:#fff'));

  console.log('sessionStorage 全部 keys：', ssAll.map(([k]) => k));
  ssAll.filter(([k, v]) => /token|auth|user|session|jwt|login/i.test(k) || String(v).startsWith('ey'))
    .forEach(([k, v]) => console.log(`  %c${k}: %c${String(v).slice(0,100)}`, 'color:#4f4', 'color:#fff'));

  console.log('相关 Cookie：');
  document.cookie.split(';').forEach(c => {
    if (/token|auth|session|login|user_id/i.test(c)) console.log(' ', c.trim().slice(0, 120));
  });

  console.log('%c✅ 扫描完成', 'color:#0f0;font-weight:bold');
})();
