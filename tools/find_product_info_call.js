/**
 * 工具 M：从 ClaudeCode.js 找 product/info 的完整调用及 bizId 硬编码值
 */
(async function findProductInfoCall() {
  const scriptUrl = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src).find(u => u.includes('ClaudeCode.'));
  if (!scriptUrl) { console.error('未找到 ClaudeCode.js'); return; }

  const src = await fetch(scriptUrl, { cache: 'force-cache' }).then(r => r.text());
  console.log(`%c ClaudeCode.js: ${(src.length/1024).toFixed(0)} KB`, 'color:#0af');

  // ── 1. 找 product/info 调用的上下文（±500 字符）─────────────
  console.group('%c=== /biz/product/info 调用位置 ===', 'color:#fa0;font-weight:bold');
  let idx = 0;
  while ((idx = src.indexOf('product/info', idx)) !== -1) {
    const chunk = src.slice(Math.max(0, idx-300), idx+500)
      .replace(/([,;{}])/g, '$1\n  ');
    console.log(`\n位置 ${idx}:\n`, chunk.slice(0, 700));
    idx += 1;
  }
  console.groupEnd();

  // ── 2. 找所有 bizId 字面量（可能是硬编码的产品 ID）─────────
  console.group('%c=== bizId / priceId 字面量 ===', 'color:#fa0;font-weight:bold');
  const bizRe = /bizId\s*[:=]\s*['"`]?([a-zA-Z0-9_\-]{4,60})['"`]?/g;
  let m;
  while ((m = bizRe.exec(src)) !== null) {
    const ctx = src.slice(Math.max(0, m.index-100), m.index+200);
    console.log(`  bizId = "${m[1]}"\n  ctx: ${ctx.slice(0, 200)}\n`);
  }
  console.groupEnd();

  // ── 3. 找 queryAllDelayInfosFn 函数体（含产品请求逻辑）──────
  console.group('%c=== queryAllDelayInfosFn 函数体 ===', 'color:#fa0;font-weight:bold');
  const fnIdx = src.indexOf('queryAllDelayInfosFn');
  if (fnIdx !== -1) {
    console.log(src.slice(fnIdx, fnIdx + 1200).replace(/([,;{}()])/g, '$1\n  '));
  }
  console.groupEnd();

  // ── 4. 找所有 axios/request 调用中含 bizId 参数的 ───────────
  console.group('%c=== 含 bizId 的 request 调用 ===', 'color:#fa0;font-weight:bold');
  const reqRe = /Object\(i\["a"\]\)\(\s*\{[^}]*bizId[^}]*\}/g;
  while ((m = reqRe.exec(src)) !== null) {
    console.log(`位置 ${m.index}:`, m[0].slice(0, 300));
  }
  console.groupEnd();

  // ── 5. 找产品 code 枚举（LITE / PRO / MAX 等）───────────────
  console.group('%c=== 套餐 code 枚举 ===', 'color:#fa0;font-weight:bold');
  const enumRe = /['"`](LITE|PRO|MAX|lite|pro|max|CODING[_A-Z]*)['"`]/g;
  const found = new Set();
  while ((m = enumRe.exec(src)) !== null) found.add(m[1]);
  console.log([...found]);

  // 找 priceData 对象定义
  const priceDataIdx = src.indexOf('priceData');
  if (priceDataIdx !== -1) {
    console.log('priceData 附近:', src.slice(priceDataIdx-50, priceDataIdx+400)
      .replace(/([,;{}])/g, '$1\n  ').slice(0, 500));
  }
  console.groupEnd();

  // ── 6. Network 拦截：监听接下来滚动/点击时的请求 ─────────────
  const _fetch = window.fetch;
  const log = [];
  window.fetch = function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (/bigmodel/.test(url)) {
      log.push({ url: url.replace('https://bigmodel.cn',''), method: (init.method||'GET').toUpperCase(), body: init.body });
      console.log('%c[拦截]', 'color:#0f0', (init.method||'GET').toUpperCase(), url.replace('https://bigmodel.cn',''), init.body||'');
    }
    return _fetch.apply(this, arguments);
  };
  console.log('%c✅ 已启动请求拦截，请点击页面套餐卡片 / 滚动到套餐区域', 'color:#0f0;font-size:13px');
  console.log('   5 秒后自动关闭拦截并汇报结果');
  await new Promise(r => setTimeout(r, 8000));
  window.fetch = _fetch;
  if (log.length) {
    console.log('%c捕获请求：', 'color:#fa0', log);
  } else {
    console.log('8s 无请求。请手动在 Network > Fetch/XHR 面板观察点击套餐卡片时的请求。');
  }
})();
