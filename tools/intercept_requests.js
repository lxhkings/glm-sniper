/**
 * GLM 抢购请求拦截器
 * 使用方法：打开 bigmodel.cn/glm-coding 页面后，
 * 在 Chrome DevTools Console 面板粘贴并回车执行。
 * 之后点击"立即订阅"按钮，所有相关请求会打印到控制台。
 */
(function () {
  'use strict';

  // ── 1. 拦截 fetch ──────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (input, init = {}) {
    const url    = typeof input === 'string' ? input : input.url;
    const method = (init.method || (input.method) || 'GET').toUpperCase();

    // 只关心写操作（POST / PUT / PATCH）
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      console.group(`%c[Intercept] fetch ${method} ${url}`, 'color:#0af;font-weight:bold');

      // 请求头
      const headers = {};
      if (init.headers) {
        const h = new Headers(init.headers);
        h.forEach((v, k) => { headers[k] = v; });
      }
      console.log('%c Headers:', 'color:#fa0', headers);

      // 请求体
      let body = init.body;
      if (body) {
        try { body = JSON.parse(body); } catch (_) {}
      }
      console.log('%c Body:', 'color:#fa0', body ?? '(empty)');

      // 打印可直接复用的 curl 命令
      const curlHeaders = Object.entries(headers)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' \\\n     ');
      const curlBody = init.body
        ? `--data-raw '${typeof init.body === 'string' ? init.body : JSON.stringify(init.body)}'`
        : '';
      console.log('%c curl 模板:', 'color:#4f4',
        `curl -X ${method} '${url}' \\\n     ${curlHeaders} \\\n     ${curlBody}`);

      console.groupEnd();
    }

    return _fetch.apply(this, arguments);
  };

  // ── 2. 拦截 XMLHttpRequest ──────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._interceptMethod  = method.toUpperCase();
    this._interceptUrl     = url;
    this._interceptHeaders = {};
    return _open.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._interceptHeaders) {
      this._interceptHeaders[name] = value;
    }
    return _setRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const method = this._interceptMethod;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const url = this._interceptUrl;
      console.group(`%c[Intercept] XHR ${method} ${url}`, 'color:#f80;font-weight:bold');
      console.log('%c Headers:', 'color:#fa0', this._interceptHeaders);

      let parsedBody = body;
      if (typeof body === 'string') {
        try { parsedBody = JSON.parse(body); } catch (_) {}
      }
      console.log('%c Body:', 'color:#fa0', parsedBody ?? '(empty)');

      // curl 模板
      const curlHeaders = Object.entries(this._interceptHeaders || {})
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' \\\n     ');
      const curlBody = body ? `--data-raw '${body}'` : '';
      console.log('%c curl 模板:', 'color:#4f4',
        `curl -X ${method} '${url}' \\\n     ${curlHeaders} \\\n     ${curlBody}`);
      console.groupEnd();
    }
    return _send.apply(this, arguments);
  };

  // ── 3. 监听 Cookie 变化（登录态/Token 刷新） ────────────────────
  let _lastCookie = document.cookie;
  setInterval(() => {
    if (document.cookie !== _lastCookie) {
      console.log('%c[Cookie 变化]', 'color:#f0f',
        '\n旧:', _lastCookie,
        '\n新:', document.cookie);
      _lastCookie = document.cookie;
    }
  }, 500);

  console.log('%c✅ 请求拦截器已启动，请点击"立即订阅"按钮', 'color:#0f0;font-size:14px;font-weight:bold');
})();
