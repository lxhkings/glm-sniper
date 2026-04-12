# sniper.py
import asyncio
from playwright.async_api import async_playwright

import config
from auth import login
from buyer import wait_until_ready, poll_and_buy
from utils import get_ntp_offset, beijing_now


async def main():
    print("=" * 50)
    print("GLM Sniper 启动")
    print("=" * 50)

    # NTP 校时
    offset = get_ntp_offset()
    now = beijing_now()
    print(f"[✓] NTP 校时完成，本机偏差：{offset:+.3f}s")
    print(f"[✓] 当前北京时间：{now.strftime('%Y-%m-%d %H:%M:%S')}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        # 登录
        print("\n[→] 打开登录页，请用微信扫码...")
        await login(page)

        # 登录成功后暂停，让用户导出 token
        print("\n[✓] 登录成功！")
        print("[!] 请在浏览器 Console 执行以下命令复制 token：")
        print("    copy(decodeURIComponent(document.cookie.match(/bigmodel_token_production=([^;]+)/)[1]))")
        print("[!] 然后粘贴到 glm-sniper-go/config.yaml 的 token 字段")
        print("[!] 如果只要导出 token，现在可以 Ctrl+C 退出")
        await asyncio.sleep(10)  # 暂停 10 秒让用户有时间操作
        print("[→] 继续...")

        # 导航到商品页
        print(f"[→] 导航到商品页：{config.PRODUCT_URL}")
        await page.goto(config.PRODUCT_URL, wait_until="domcontentloaded")

        # 等待开售时间
        await wait_until_ready()

        # 开始轮询抢购
        await poll_and_buy(page)

        # 保持浏览器打开，让用户完成付款
        print("\n[i] 浏览器保持打开，请完成付款后手动关闭程序（Ctrl+C）")
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
