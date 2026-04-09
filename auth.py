# auth.py
import asyncio
from playwright.async_api import Page

LOGIN_URL = "https://bigmodel.cn/login"

async def login(page: Page, phone: str, password: str) -> None:
    """
    使用手机号+密码登录智谱 AI。
    登录成功后 page 将持有已登录的 session。
    失败时抛出 RuntimeError。
    """
    await page.goto(LOGIN_URL, wait_until="networkidle")

    # 点击"密码登录"标签（如果页面默认是验证码登录）
    password_tab = page.locator("text=密码登录")
    if await password_tab.count() > 0:
        await password_tab.click()

    # 填写手机号
    await page.locator("input[placeholder*='手机号'], input[type='tel']").first.fill(phone)

    # 填写密码
    await page.locator("input[type='password']").first.fill(password)

    # 点击登录
    await page.locator("button:has-text('登录'), button[type='submit']").first.click()

    # 等待跳转，最多 10 秒
    try:
        await page.wait_for_url(lambda url: "login" not in url, timeout=10_000)
    except Exception:
        # 检查是否有错误提示
        error = page.locator(".error-message, [class*='error'], [class*='Error']")
        if await error.count() > 0:
            msg = await error.first.inner_text()
            raise RuntimeError(f"登录失败：{msg}")
        raise RuntimeError("登录超时，页面未跳转")

    print(f"[✓] 登录成功")
