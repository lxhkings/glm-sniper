/**
 * 工具 D：从 Vue 组件实例提取"即刻订阅"的点击处理函数及 API 调用
 *
 * 支持 Vue 2 (__vue__) 和 Vue 3 (__vue_app__ / _vei)
 * 使用：DevTools Console 粘贴执行
 */
(function extractVueHandler() {
  'use strict';

  // ── 1. 找"即刻订阅"按钮 DOM ──────────────────────────────────
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim().includes('即刻订阅'));

  if (!btn) { console.error('未找到"即刻订阅"按钮'); return; }
  console.log('%c✅ 找到按钮：', 'color:#0f0', btn.outerHTML.slice(0, 200));

  // ── 2. 提取原生 click 处理函数（getEventListeners 仅 DevTools 可用）
  if (typeof getEventListeners === 'function') {
    const listeners = getEventListeners(btn);
    console.group('%c原生 click 监听器（来自 getEventListeners）:', 'color:#fa0;font-weight:bold');
    (listeners.click || []).forEach((l, i) => {
      console.log(`  [${i}] once=${l.once} passive=${l.passive}`);
      console.log('  函数体：', l.listener.toString());
    });
    console.groupEnd();
  }

  // ── 3. Vue 3：通过 _vei 拿合成事件 handler ────────────────────
  // Vue 3 把事件缓存在 el._vei 上
  const vei = btn._vei;
  if (vei) {
    console.group('%cVue 3 _vei 合成事件:', 'color:#4f4;font-weight:bold');
    Object.entries(vei).forEach(([evt, handler]) => {
      console.log(`  事件: ${evt}`);
      const fn = handler.value || handler;
      console.log('  handler:', typeof fn === 'function' ? fn.toString() : fn);
    });
    console.groupEnd();
  }

  // ── 4. 向上爬 DOM 树，找到 Vue 3 组件实例 ─────────────────────
  function getVue3Instance(el) {
    const key = Object.keys(el).find(k => k.startsWith('__vueParentComponent'));
    if (key) return el[key];
    // 向上爬
    let cur = el.parentElement;
    while (cur) {
      const k = Object.keys(cur).find(kk => kk.startsWith('__vueParentComponent'));
      if (k) return cur[k];
      cur = cur.parentElement;
    }
    return null;
  }

  // ── 5. Vue 2：通过 __vue__ 找实例 ────────────────────────────
  function getVue2Instance(el) {
    let cur = el;
    while (cur) {
      if (cur.__vue__) return cur.__vue__;
      cur = cur.parentElement;
    }
    return null;
  }

  const vue3inst = getVue3Instance(btn);
  const vue2inst = getVue2Instance(btn);

  // ── 6. 打印组件 setup / methods / data ────────────────────────
  if (vue3inst) {
    console.group('%c✅ Vue 3 组件实例找到', 'color:#0af;font-weight:bold');
    const ctx = vue3inst.setupState || vue3inst.ctx || {};

    console.log('%c  组件名:', 'color:#fa0', vue3inst.type?.name || vue3inst.type?.__name || '匿名');

    // 打印所有方法（函数类型的属性）
    console.group('  方法列表（含 setup 函数）:');
    Object.entries(ctx).forEach(([k, v]) => {
      if (typeof v === 'function') {
        const src = v.toString().replace(/\s+/g, ' ').slice(0, 400);
        console.log(`    ${k}: ${src}`);
      }
    });
    console.groupEnd();

    // 打印 data/state
    console.group('  响应式数据（可能含 isOnSale / canBuy 等控制字段）:');
    Object.entries(ctx).forEach(([k, v]) => {
      if (typeof v !== 'function') {
        console.log(`    ${k}:`, v);
      }
    });
    console.groupEnd();

    // 暴露到全局，方便进一步调试
    window.__glmVue3 = vue3inst;
    console.log('%c  已挂载到 window.__glmVue3，可直接调用 __glmVue3.ctx.xxx()', 'color:#4f4');
    console.groupEnd();
  }

  if (vue2inst) {
    console.group('%c✅ Vue 2 组件实例找到', 'color:#0af;font-weight:bold');
    console.log('  $options.methods:', Object.keys(vue2inst.$options.methods || {}));
    // 打印所有方法源码
    Object.entries(vue2inst.$options.methods || {}).forEach(([k, fn]) => {
      console.log(`  ${k}:`, fn.toString().slice(0, 400));
    });
    console.log('  $data:', JSON.parse(JSON.stringify(vue2inst.$data)));
    window.__glmVue2 = vue2inst;
    console.log('%c  已挂载到 window.__glmVue2，可直接调用 __glmVue2.methodName()', 'color:#4f4');
    console.groupEnd();
  }

  if (!vue3inst && !vue2inst) {
    console.warn('未找到 Vue 实例，可能是 Web Components 或自定义框架');
    console.log('尝试手动触发并拦截：先运行 intercept_requests.js，再执行：');
    console.log("  getEventListeners(document.querySelectorAll('button')[0]).click[0].listener()");
  }

  // ── 7. 直接调用第一个 click handler（拦截器会记录请求）─────────
  console.log('\n%c🚀 尝试直接调用原生 click handler[0]（不触发 UI 副作用）:', 'color:#f80');
  if (typeof getEventListeners === 'function') {
    const listeners = getEventListeners(btn);
    const clickHandlers = listeners.click || [];
    if (clickHandlers.length) {
      console.log('  调用 handler[0]...');
      try {
        clickHandlers[0].listener.call(btn, new MouseEvent('click', { bubbles: true }));
        console.log('%c  ✅ 调用成功，检查上方 [Intercept] 输出', 'color:#0f0');
      } catch(e) {
        console.error('  调用失败:', e);
      }
    }
  }
})();
