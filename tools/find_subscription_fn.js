/**
 * 工具 O：从 ClaudeCode~subscribe-overview.js 找 subscriptionListFn 的完整实现
 */
(async function() {
  const urls = Array.from(document.querySelectorAll('script[src]'))
    .map(s => s.src)
    .filter(u => /subscribe-overview|ClaudeCode/.test(u.split('/').pop()));

  for (const url of urls) {
    const src = await fetch(url, {cache:'force-cache'}).then(r => r.text());
    const name = url.split('/').pop();

    // 找 subscriptionListFn
    let idx = src.indexOf('subscriptionListFn');
    if (idx === -1) continue;

    console.group(`%c📦 ${name}`, 'color:#0af;font-weight:bold');
    while (idx !== -1) {
      const chunk = src.slice(Math.max(0, idx-100), idx+1000)
        .replace(/([,;{}()])/g, '$1\n  ');
      console.log(`位置 ${idx}:\n`, chunk.slice(0, 800));
      idx = src.indexOf('subscriptionListFn', idx + 1);
      if (idx > 0) console.log('---');
    }
    console.groupEnd();

    // 同时找 product/info 的参数构造
    idx = src.indexOf('product/info');
    while (idx !== -1) {
      console.log(`product/info 位置 ${idx}:`,
        src.slice(Math.max(0,idx-400), idx+400).replace(/([,;{}])/g,'$1\n  ').slice(0,700));
      idx = src.indexOf('product/info', idx+1);
    }
  }
})();
