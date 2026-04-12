/**
 * 工具 A：找到灰色按钮绑定的事件处理函数
 *
 * 即使按钮是 disabled，React/Vue 的合成事件或原生 addEventListener
 * 已经挂在 DOM 上。本脚本把它们全部打印出来。
 *
 * 使用：DevTools Console 粘贴执行
 */
(function findButtonHandlers() {
  // ── 1. 找所有订阅/购买相关按钮（含 disabled）──────────────────
  const keywords = ['订阅', '购买', '抢购', 'subscribe', 'buy', 'order'];
  const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a.btn, .btn'));
  const targets = allButtons.filter(el =>
    keywords.some(k => el.textContent.trim().toLowerCase().includes(k.toLowerCase()))
  );

  console.log(`%c🔍 找到 ${targets.length} 个相关按钮：`, 'color:#0af;font-weight:bold');
  targets.forEach((btn, i) => {
    console.log(`  [${i}] text="${btn.textContent.trim()}" disabled=${btn.disabled} class="${btn.className}"`);
  });

  if (!targets.length) {
    console.warn('未找到相关按钮，尝试扩大选择器...');
    // 降级：打印所有按钮
    allButtons.forEach((b, i) =>
      console.log(`  [${i}] text="${b.textContent.trim()}" disabled=${b.disabled}`));
    return;
  }

  // ── 2. 读取 React Fiber 内部事件（React 16-18 通用）──────────
  function getReactHandlers(el) {
    const fiberKey = Object.keys(el).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fiberKey) return null;

    const handlers = {};
    let fiber = el[fiberKey];
    // 向上遍历 Fiber 树，找 onClick
    while (fiber) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props) {
        ['onClick', 'onClickCapture', 'onMouseDown', 'onPointerDown'].forEach(evt => {
          if (typeof props[evt] === 'function') {
            if (!handlers[evt]) handlers[evt] = [];
            handlers[evt].push(props[evt]);
          }
        });
      }
      fiber = fiber.return;
      if (fiber && fiber.stateNode === document) break;
    }
    return handlers;
  }

  // ── 3. 读取原生 addEventListener（Chrome getEventListeners API）
  function getNativeListeners(el) {
    if (typeof getEventListeners === 'function') {
      return getEventListeners(el);
    }
    return null; // 仅在 DevTools Console 中可用
  }

  targets.forEach((btn, i) => {
    console.group(`%c📌 按钮 [${i}] "${btn.textContent.trim()}"`, 'color:#fa0;font-weight:bold');

    // React 内部 handlers
    const reactHandlers = getReactHandlers(btn);
    if (reactHandlers && Object.keys(reactHandlers).length) {
      console.log('%c  React 事件处理函数：', 'color:#4f4');
      Object.entries(reactHandlers).forEach(([evt, fns]) => {
        fns.forEach(fn => {
          console.log(`    ${evt}:`, fn.toString().slice(0, 500));
        });
      });
    } else {
      console.log('  未找到 React 事件（可能是 Vue 或原生）');
    }

    // 原生 listeners（仅在 DevTools Console 有效）
    const native = getNativeListeners(btn);
    if (native) {
      console.log('%c  原生事件监听器：', 'color:#4f4', native);
    }

    console.groupEnd();
  });

  // ── 4. 强制触发点击（忽略 disabled），观察发出什么请求 ────────
  console.log('\n%c💡 提示：如果想强制触发，在 Console 执行：', 'color:#f80');
  console.log("  document.querySelectorAll('button')[X].removeAttribute('disabled')");
  console.log("  document.querySelectorAll('button')[X].click()");
  console.log('  （同时保持 intercept_requests.js 已激活）');
})();
