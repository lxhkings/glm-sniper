# auth.py
import asyncio
from playwright.async_api import Page

LOGIN_URL = "https://bigmodel.cn/login"


async def login(page: Page) -> None:
    """
    使用微信扫码登录智谱 AI。
    打开登录页并展示二维码，等待用户扫码完成。
    登录成功后 page 将持有已登录的 session。
    失败时抛出 RuntimeError。
    """
    await page.goto(LOGIN_URL, wait_until="networkidle")

    # 尝试点击"微信登录"选项卡
    wechat_tab = page.locator("text=微信登录, [class*='wechat'], img[alt*='微信']").first
    if await wechat_tab.count() > 0:
        await wechat_tab.click()
        await page.wait_for_timeout(1000)
    else:
        # 备用：查找包含"微信"的按钮或链接
        fallback = page.locator("button:has-text('微信'), a:has-text('微信')")
        if await fallback.count() > 0:
            await fallback.first.click()
            await page.wait_for_timeout(1000)

    print("[i] 请用微信扫描页面上的二维码登录，等待中...")

    # 等待用户扫码并完成登录（最多 3 分钟）
    try:
        await page.wait_for_url(lambda url: "login" not in url, timeout=180_000)
    except Exception:
        error = page.locator(".error-message, [class*='error'], [class*='Error']")
        if await error.count() > 0:
            msg = await error.first.inner_text()
            raise RuntimeError(f"登录失败：{msg}")
        raise RuntimeError("扫码登录超时（3分钟），页面未跳转")

    print("[✓] 微信扫码登录成功")
