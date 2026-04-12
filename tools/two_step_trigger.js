/**
 * 工具 G：两段式触发 —— 即刻订阅 → 等弹窗 → 继续订阅
 *
 * 前置：intercept_requests.js 必须已经运行（拦截器激活）
 *
 * 流程：
 *   1. 点击"即刻订阅"（触发确认弹窗）
 *   2. 等待 800ms（弹窗渲染）
 *   3. 点击"继续订阅"（发出真实 API 请求）
 *   4. 再等 3s，打印已捕获的请求摘要
 */
(async function twoStepTrigger() {
  'use strict';

  function findBtn(text) {
    return Array.from(document.querySelectorAll('button, [role="button"]'))
      .find(b => b.textContent.trim().includes(text) && !b.closest('[style*="display: none"]'));
  }

  function clickBtn(btn) {
    btn.removeAttribute('disabled');
    btn.disabled = false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    console.log(`%c✅ 点击："${btn.textContent.trim()}"`, 'color:#0f0');
  }

  // ── 步骤 1：点击"即刻订阅" ────────────────────────────────────
  const subscribeBtn = findBtn('即刻订阅');
  if (!subscribeBtn) { console.error('❌ 未找到"即刻订阅"按钮'); return; }
  clickBtn(subscribeBtn);

  // ── 步骤 2：等弹窗出现 ───────────────────────────────────────
  console.log('%c⏳ 等待弹窗渲染（800ms）…', 'color:#fa0');
  await new Promise(r => setTimeout(r, 800));

  // ── 步骤 3：找并点击"继续订阅" ───────────────────────────────
  const confirmBtn = findBtn('继续订阅');
  if (!confirmBtn) {
    // 弹窗可能还没出现，再等 1s 重试
    await new Promise(r => setTimeout(r, 1000));
    const retryBtn = findBtn('继续订阅');
    if (!retryBtn) {
      console.warn('⚠ 未找到"继续订阅"，弹窗可能未出现。当前所有按钮：');
      Array.from(document.querySelectorAll('button')).forEach((b, i) =>
        console.log(`  [${i}] "${b.textContent.trim()}" display=${getComputedStyle(b).display}`));
      return;
    }
    clickBtn(retryBtn);
  } else {
    clickBtn(confirmBtn);
  }

  // ── 步骤 4：等网络请求返回 ────────────────────────────────────
  console.log('%c⏳ 等待 3s，拦截器应打印请求信息…', 'color:#fa0');
  await new Promise(r => setTimeout(r, 3000));

  console.log('%c📋 完成。请查看上方 [Intercept] 输出。', 'color:#0af;font-weight:bold');
  console.log('   如果仍无输出，说明"继续订阅"走的是 Vue 内部路由跳转（非 API）');
  console.log('   此时请手动在 Network 面板勾选 "XHR" + "Fetch"，重复操作并观察');
})();
