/**
 * 工具 C：强制触发灰色按钮 + 拦截请求
 *
 * 前置条件：
 *   1. 已在同一控制台执行 intercept_requests.js（拦截器激活）
 *   2. 已登录（Cookie 有效），否则服务端会返回 401
 *
 * 本脚本做三件事：
 *   A. 移除所有订阅/购买按钮的 disabled 属性
 *   B. 模拟真实用户点击（含 MouseEvent 细节），绕过 React 合成事件检查
 *   C. 15 秒内监控 XHR/fetch 活动，汇总结果
 */
(function forceTrigger() {
  'use strict';

  const KEYWORDS = ['订阅', '购买', '抢购', 'subscribe', 'buy'];

  // ── A. 找目标按钮 ─────────────────────────────────────────────
  const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
  const targets = allBtns.filter(b =>
    KEYWORDS.some(k => b.textContent.trim().includes(k))
  );

  if (!targets.length) {
    console.error('❌ 未找到购买相关按钮，请检查页面是否完全加载');
    return;
  }

  console.log(`%c找到 ${targets.length} 个按钮：`, 'color:#0af');
  targets.forEach((b, i) =>
    console.log(`  [${i}] "${b.textContent.trim()}" disabled=${b.disabled}`));

  // ── B. 解锁并触发第一个按钮 ───────────────────────────────────
  // 注意：这不会触发真实下单（服务端会因为活动未开始而拒绝），
  // 目的只是让浏览器发出请求，从而抓到 URL / Header / Body 模板。
  const btn = targets[0];

  // 移除 disabled（React controlled component 会在下次 render 时恢复，无副作用）
  btn.removeAttribute('disabled');
  btn.disabled = false;

  // 构造真实 MouseEvent，触发 React 合成事件
  const evt = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: btn.getBoundingClientRect().left + 10,
    clientY: btn.getBoundingClientRect().top + 10,
  });
  btn.dispatchEvent(evt);

  console.log(`%c✅ 已触发点击："${btn.textContent.trim()}"`, 'color:#0f0');
  console.log('%c⏳ 监控 5 秒内的网络请求…', 'color:#fa0');

  // ── C. 5 秒后汇报是否有新请求 ─────────────────────────────────
  // （依赖 intercept_requests.js 的拦截器已运行）
  setTimeout(() => {
    console.log('%c📋 请查看上方 [Intercept] 输出，应包含完整请求信息', 'color:#0af;font-weight:bold');
    console.log('   如果没有输出：');
    console.log('   → 说明按钮点击事件被 React 内部条件（isActive/isSaleOpen）阻断');
    console.log('   → 需要进一步 patch React 组件状态，或直接分析 Bundle 找 API 路径');
  }, 5000);
})();
