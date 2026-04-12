/**
 * 工具 K：提取 Authorization token 并发起正确认证的 API 请求
 *
 * 问题：服务端要 Authorization Header，不是 Cookie
 * 来源：axios interceptors.request.use 会注入，token 存在 Vuex/localStorage
 */
(async function getTokenAndCall() {
  'use strict';

  // ── 1. 从所有可能位置找 token ─────────────────────────────────

  let token = null;

  // 方法 A：从 Vue 2 Vuex store
  const vue2 = document.querySelector('#app')?.__vue__;
  if (vue2?.$store?.state) {
    const stateStr = JSON.stringify(vue2.$store.state);
    const m = stateStr.match(/"(?:token|accessToken|Authorization)"\s*:\s*"([^"]{20,})"/);
    if (m) { token = m[1]; console.log('✅ Vuex state 里找到 token'); }

    // 也直接打印 state 结构
    console.log('Vuex state keys:', Object.keys(vue2.$store.state));
    Object.keys(vue2.$store.state).forEach(k => {
      const v = vue2.$store.state[k];
      if (v && typeof v === 'object') console.log(` module[${k}]:`, Object.keys(v));
    });
  }

  // 方法 B：从 Vue 3 Pinia
  const vue3app = document.querySelector('#app')?.__vue_app__;
  if (!token && vue3app) {
    const pinia = vue3app.config?.globalProperties?.$pinia;
    if (pinia) {
      console.log('Pinia stores:', Object.keys(pinia.state.value));
      const stateStr = JSON.stringify(pinia.state.value);
      const m = stateStr.match(/"(?:token|accessToken|Authorization)"\s*:\s*"([^"]{20,})"/);
      if (m) { token = m[1]; console.log('✅ Pinia 里找到 token'); }
    }
  }

  // 方法 C：遍历 localStorage 的 605ea188... 系列 key（看起来是 hash 后的 key）
  if (!token) {
    const candidates = Object.entries(localStorage).filter(([k, v]) =>
      (k.startsWith('605ea188') || /^[0-9a-f]{16}$/.test(k)) &&
      String(v).length > 20
    );
    console.log('%c localStorage 候选条目：', 'color:#fa0');
    candidates.forEach(([k, v]) => console.log(`  ${k}: ${String(v).slice(0, 150)}`));

    // 找 JWT（以 eyJ 开头）
    const jwtEntry = candidates.find(([, v]) => String(v).startsWith('eyJ') || String(v).includes('"token"'));
    if (jwtEntry) {
      let val = jwtEntry[1];
      try { val = JSON.parse(val)?.token || JSON.parse(val)?.accessToken || val; } catch (_) {}
      if (val.startsWith('eyJ')) { token = val; console.log('✅ localStorage 找到 JWT token'); }
    }
  }

  // 方法 D：直接用 Cookie 里的 bigmodel_token_production 作为 Bearer
  if (!token) {
    const cookieMatch = document.cookie.match(/bigmodel_token_production=([^;]+)/);
    if (cookieMatch) {
      token = decodeURIComponent(cookieMatch[1]);
      console.log('✅ 使用 Cookie bigmodel_token_production 作为 token');
    }
  }

  // 方法 E：找 axios 实例配置（最直接）
  if (!token) {
    // 在全局对象上找 axios 实例
    for (const key of Object.keys(window)) {
      const val = window[key];
      if (val?.defaults?.headers?.common?.Authorization) {
        token = val.defaults.headers.common.Authorization.replace('Bearer ', '');
        console.log(`✅ window.${key}.defaults.headers.common.Authorization 找到 token`);
        break;
      }
    }
  }

  if (!token) {
    console.error('❌ 未找到 token，请手动执行：');
    console.log("  document.querySelector('#app').__vue__.$store.state");
    return;
  }

  console.log('%c\n🔑 Token（前 60 字符）:', 'color:#4f4', token.slice(0, 60) + '…');

  // ── 2. 用正确的 Authorization Header 重新发请求 ───────────────
  const BASE = 'https://bigmodel.cn/api';
  const HEADERS = {
    'Content-Type':  'application/json',
    'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'Referer':       'https://bigmodel.cn/glm-coding',
    'Origin':        'https://bigmodel.cn',
  };

  async function call(method, path, body) {
    const opts = { method, headers: HEADERS, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    console.group(`%c${method} ${path}`, 'color:#0af;font-weight:bold');
    if (body) console.log('Body:', body);
    const res  = await fetch(BASE + path, opts);
    const json = await res.json().catch(() => ({}));
    console.log('响应:', json);
    console.groupEnd();
    return json;
  }

  // Step 1：检查限购
  const s1 = await call('GET', '/biz/product/isLimitBuy');

  // Step 2：产品信息
  const s2 = await call('GET', '/biz/product/info');
  console.log('产品列表 data:', s2?.data);

  // Step 3：找 bizId（从产品信息里）
  let bizId = s2?.data?.bizId || s2?.data?.[0]?.bizId;
  if (!bizId && Array.isArray(s2?.data)) {
    const item = s2.data.find(p => /lite|coding/i.test(JSON.stringify(p)));
    bizId = item?.bizId || item?.id;
  }
  console.log('%c\nbizId:', 'color:#f80;font-weight:bold', bizId || '未找到，需要查看 s2.data 结构');

  // Step 4：preview（价格预览）
  if (bizId) {
    const s4 = await call('POST', '/biz/pay/preview', { bizId });
    const finalBizId = s4?.data?.bizId || bizId;
    console.log('preview data:', s4?.data);

    // Step 5：create-sign（创建订单）
    await call('POST', '/biz/pay/create-sign', {
      bizId:       finalBizId,
      payType:     'alipay',
      agreementNo: '',
    });
  }

  console.log('%c\n✅ 全部完成。如果 create-sign 返回 orderId，Go 方案可以直接实现！', 'color:#0f0;font-weight:bold');
  // 把 headers 暴露出来方便复制
  window.__glmHeaders = HEADERS;
  console.log('%c请复制 window.__glmHeaders 给 Claude（含真实 token）', 'color:#fa0');
})();
