/**
 * 工具 E：直接调用 Vue 组件的订阅方法（最干净的方式）
 *
 * 前置：先运行 intercept_requests.js + extract_vue_handler.js
 *       等 window.__glmVue3 或 __glmVue2 被挂载
 *
 * 作用：
 *   - 直接从 Vue 实例调用 handleSubscribe/subscribe/onBuy 等方法
 *   - 拦截器会记录其中的 axios/fetch 请求
 */
(function vueDirectCall() {
  const inst3 = window.__glmVue3;
  const inst2 = window.__glmVue2;

  // 常见的订阅方法名（按优先级排列）
  const METHOD_NAMES = [
    'handleSubscribe', 'onSubscribe', 'subscribe',
    'handleBuy', 'onBuy', 'buy',
    'handleOrder', 'createOrder', 'submitOrder',
    'handleClick', 'onClick',
    'apply', 'handleApply',
  ];

  if (inst3) {
    const ctx = inst3.setupState || inst3.ctx || {};
    console.log('%c🔍 Vue3 ctx 中的方法：', 'color:#0af',
      Object.keys(ctx).filter(k => typeof ctx[k] === 'function'));

    for (const name of METHOD_NAMES) {
      if (typeof ctx[name] === 'function') {
        console.log(`%c✅ 找到 ctx.${name}，调用中…`, 'color:#0f0');
        try { ctx[name](); } catch(e) { console.error(e); }
        break;
      }
    }
  }

  if (inst2) {
    const methods = Object.keys(inst2.$options.methods || {});
    console.log('%c🔍 Vue2 methods：', 'color:#0af', methods);

    for (const name of METHOD_NAMES) {
      if (typeof inst2[name] === 'function') {
        console.log(`%c✅ 找到 $vm.${name}，调用中…`, 'color:#0f0');
        try { inst2[name](); } catch(e) { console.error(e); }
        break;
      }
    }
  }

  if (!inst3 && !inst2) {
    console.error('先运行 extract_vue_handler.js 挂载实例');
  }
})();
