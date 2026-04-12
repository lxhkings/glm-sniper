/**
 * 工具 F：精准提取 /apikey/coding-plan-ent 周围的完整代码上下文
 *
 * 目标：找出
 *   - 完整 URL（含 baseURL 前缀）
 *   - HTTP Method（GET / POST）
 *   - 请求 Headers（Authorization 格式）
 *   - 请求 Body 字段名
 *   - 是否有签名/加密
 *
 * 使用：DevTools Console 粘贴执行
 */
(function extractApiContext() {
  'use strict';

  const TARGET_ENDPOINT = '/apikey/coding-plan-ent';

  // ── 1. 找到包含目标 endpoint 的 script ──────────────────────
  const scriptUrl = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src)
    .find(u => u.includes('app.'));

  if (!scriptUrl) {
    console.error('未找到 app.*.js，请确认页面已完全加载');
    return;
  }
  console.log('%c📦 分析文件：', 'color:#0af', scriptUrl);

  fetch(scriptUrl, { cache: 'force-cache' })
    .then(r => r.text())
    .then(src => {
      // ── 2. 找到 endpoint 在源码中的所有位置 ────────────────
      const positions = [];
      let idx = 0;
      while ((idx = src.indexOf(TARGET_ENDPOINT, idx)) !== -1) {
        positions.push(idx);
        idx += 1;
      }
      console.log(`%c找到 ${positions.length} 处引用 "${TARGET_ENDPOINT}"`, 'color:#fa0;font-weight:bold');

      // ── 3. 每处取前后 800 字符（足够看清一个函数体）──────────
      positions.forEach((pos, n) => {
        const start = Math.max(0, pos - 600);
        const end   = Math.min(src.length, pos + 800);
        const chunk = src.slice(start, end);

        // 美化：把逗号/分号后插入换行（minified 代码近似展开）
        const pretty = chunk
          .replace(/([,;{])/g, '$1\n  ')
          .replace(/\n\s*\n/g, '\n');

        console.group(`%c引用 #${n + 1}（位置 ${pos}）`, 'color:#4f4;font-weight:bold');
        console.log(pretty);
        console.groupEnd();
      });

      // ── 4. 专项扫描：axios baseURL 配置 ─────────────────────
      const baseUrlMatch = src.match(/baseURL\s*[:=]\s*['"`]([^'"`]+)['"`]/);
      if (baseUrlMatch) {
        console.log('%c🌐 axios baseURL:', 'color:#f80;font-weight:bold', baseUrlMatch[1]);
        console.log('%c完整 endpoint URL 可能是：', 'color:#f80',
          baseUrlMatch[1].replace(/\/$/, '') + TARGET_ENDPOINT);
      }

      // ── 5. 专项扫描：Authorization / token 注入方式 ─────────
      const authPatterns = [
        /Authorization['"]\s*[:+]\s*(['"`][^'"`]*['"`]|\w+)/g,
        /headers\s*\[['"]Authorization['"]\]\s*=\s*([^;,\n]{1,100})/g,
        /Bearer\s*\$?\{?([^}'"`\s]{1,60})/g,
        /interceptors\.request\.use/g,
      ];
      console.group('%c🔑 Authorization / Token 注入:', 'color:#f80;font-weight:bold');
      authPatterns.forEach(re => {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(src)) !== null) {
          const ctxStart = Math.max(0, m.index - 200);
          const ctxEnd   = Math.min(src.length, m.index + 300);
          console.log('  匹配：', m[0]);
          console.log('  上下文：', src.slice(ctxStart, ctxEnd)
            .replace(/([,;{])/g, '$1\n    ').slice(0, 500));
        }
      });
      console.groupEnd();

      // ── 6. 专项扫描：请求方法（get/post/put）──────────────────
      const methodRe = /\.(get|post|put|patch|delete)\s*\(\s*[^,)]*coding-plan[^)]{0,200}\)/g;
      let mm;
      console.group('%c📮 HTTP Method 检测:', 'color:#f80;font-weight:bold');
      while ((mm = methodRe.exec(src)) !== null) {
        console.log(`  Method: ${mm[1].toUpperCase()}`);
        console.log('  代码：', mm[0].slice(0, 300));
      }
      console.groupEnd();
    })
    .catch(e => console.error('fetch 失败:', e));
})();
