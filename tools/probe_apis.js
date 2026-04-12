/**
 * 工具 J：直接探测购买链路 API 的真实参数结构
 *
 * 已知：
 *   baseURL = /api
 *   Auth    = Cookie bigmodel_token_production（浏览器会自动带上）
 *
 * 调用顺序：
 *   1. GET  /api/biz/product/isLimitBuy   → 检查是否可购买（返回限购状态）
 *   2. POST /api/biz/pay/preview           → 传入产品参数，返回 bizId + 价格
 *   3. POST /api/biz/pay/create-sign       → 传入 bizId，返回支付 URL + orderId
 */
(async function probeApis() {
  'use strict';

  const BASE = 'https://bigmodel.cn/api';

  // 打印响应的辅助函数
  async function call(method, path, body) {
    const opts = {
      method,
      credentials: 'include',          // 自动携带 Cookie
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    console.group(`%c${method} ${path}`, 'color:#0af;font-weight:bold');
    if (body) console.log('%c请求 Body:', 'color:#fa0', body);

    try {
      const res = await fetch(BASE + path, opts);
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (_) { json = text; }

      console.log('%c状态码:', 'color:#fa0', res.status);
      console.log('%c响应:', 'color:#4f4', json);

      // 打印所有响应 Header（找 Set-Cookie、X-Request-Id 等）
      const hdrs = {};
      res.headers.forEach((v, k) => { hdrs[k] = v; });
      console.log('%c响应 Headers:', 'color:#aaa', hdrs);

      console.groupEnd();
      return json;
    } catch (e) {
      console.error('请求失败:', e);
      console.groupEnd();
      return null;
    }
  }

  // ── Step 1: 检查限购状态 ──────────────────────────────────────
  console.log('%c\n=== Step 1: 检查限购状态 ===', 'color:#f80;font-size:14px');
  const limitRes = await call('GET', '/biz/product/isLimitBuy');

  // ── Step 2: 获取产品信息（找 bizId）──────────────────────────
  // 尝试几种常见参数组合
  console.log('%c\n=== Step 2a: 获取产品列表 ===', 'color:#f80;font-size:14px');
  await call('GET', '/biz/product/info', null);

  // 带参数版本（可能需要 productCode）
  console.log('%c\n=== Step 2b: 带参数获取产品 ===', 'color:#f80;font-size:14px');
  for (const code of ['glm-coding', 'coding-plan', 'lite', 'coding_plan_lite']) {
    await call('GET', `/biz/product/info?productCode=${code}`, null);
  }

  // ── Step 3: preview 接口（摸参数格式）────────────────────────
  console.log('%c\n=== Step 3: pay/preview（探测参数）===', 'color:#f80;font-size:14px');

  // 尝试空 body，看报错信息确认必填字段
  await call('POST', '/biz/pay/preview', {});

  // 常见字段猜测
  await call('POST', '/biz/pay/preview', {
    productCode: 'glm-coding',
    priceId: '',
    period: 'month',
  });

  // ── Step 4: 直接从 Vue 组件 data 里找真实 bizId ────────────
  console.log('%c\n=== Step 4: 从 Vue 组件找 priceData.bizId ===', 'color:#f80;font-size:14px');

  // 遍历页面所有 Vue 3 组件实例，找含 bizId / priceData 的
  function walkVue3(el, depth = 0) {
    if (depth > 10) return;
    const key = Object.keys(el).find(k => k.startsWith('__vueParentComponent'));
    if (key) {
      const inst = el[key];
      const ctx  = inst?.setupState || inst?.ctx || {};
      const data = inst?.data || {};

      // 检查是否含 bizId / priceData
      const allData = { ...ctx, ...data };
      if (allData.bizId || allData.priceData || allData.cardData) {
        console.log('%c发现含 bizId/priceData 的组件：', 'color:#4f4', {
          componentName: inst?.type?.name || inst?.type?.__name,
          bizId:     allData.bizId,
          priceData: allData.priceData,
          cardData:  allData.cardData,
          planType:  allData.planType,
          period:    allData.period,
        });
        window.__glmPriceData = allData; // 暴露到全局
      }
    }
    Array.from(el.children || []).forEach(child => walkVue3(child, depth + 1));
  }
  walkVue3(document.querySelector('#app') || document.body);

  if (window.__glmPriceData) {
    console.log('%c✅ 找到 priceData，尝试真实 preview 调用：', 'color:#0f0');
    const d = window.__glmPriceData;
    const previewBody = {
      bizId:       d.bizId || d.priceData?.bizId,
      productCode: d.productCode || 'glm-coding',
      period:      d.period || d.cardData?.unitText,
    };
    console.log('preview body:', previewBody);
    const previewRes = await call('POST', '/biz/pay/preview', previewBody);

    // 如果 preview 成功，立刻探测 create-sign
    if (previewRes?.code === 200 || previewRes?.data?.bizId) {
      console.log('%c\n=== Step 5: 真实 create-sign 调用 ===', 'color:#f80;font-size:14px');
      await call('POST', '/biz/pay/create-sign', {
        bizId:      previewRes.data?.bizId || previewBody.bizId,
        payType:    'alipay',
        agreementNo: '',
      });
    }
  }

  console.log('%c\n✅ 探测完成！把上方输出（含报错的字段提示）截图给 Claude。', 'color:#0f0;font-weight:bold');
})();
