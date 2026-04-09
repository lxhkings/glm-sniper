# buyer.py
import asyncio
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.async_api import Page, TimeoutError as PlaywrightTimeout

import config
from utils import beijing_now, beep

# 购买按钮可能的文字
BUY_BUTTON_TEXTS = ["立即购买", "立即抢购", "购买", "抢购", "订阅"]

# 售罄文字
SOLD_OUT_TEXTS = ["售罄", "已抢光", "已售完", "库存不足", "暂时缺货"]

# 确认订单页 URL 特征
ORDER_CONFIRM_PATTERNS = ["order", "confirm", "checkout", "pay"]


async def wait_until_ready() -> None:
    """等待至开售前 PRELOAD_SECONDS 秒。"""
    now = beijing_now()
    target = now.replace(
        hour=config.SALE_HOUR,
        minute=config.SALE_MINUTE,
        second=config.SALE_SECOND,
        microsecond=0,
    )
    seconds_left = (target - now).total_seconds() - config.PRELOAD_SECONDS
    if seconds_left > 0:
        print(f"[✓] 等待 {seconds_left:.1f} 秒后开始轮询（北京时间 {target.strftime('%H:%M:%S')} 开售）")
        await asyncio.sleep(seconds_left)


async def poll_and_buy(page: Page) -> None:
    """
    在商品页每 100ms 轮询一次购买按钮。
    按钮可点击时立刻点击并走完下单流程。
    到达确认订单页后停止，提示用户付款。
    """
    print("[→] 开始轮询购买按钮...")
    deadline = time.time() + 30  # 最多轮询 30 秒

    while time.time() < deadline:
        # 刷新页面
        try:
            await page.reload(wait_until="domcontentloaded", timeout=5_000)
        except PlaywrightTimeout:
            pass  # 网络抖动，继续重试

        # 检查是否售罄
        for text in SOLD_OUT_TEXTS:
            if await page.locator(f"text={text}").count() > 0:
                print(f'[✗] 检测到"{text}"，本次未抢到')
                return

        # 查找购买按钮
        for text in BUY_BUTTON_TEXTS:
            btn = page.locator(f"button:has-text('{text}'):not([disabled])")
            if await btn.count() > 0:
                print(f'[✓] 找到按钮"{text}"，立刻点击！')
                await btn.first.click()
                await _proceed_to_order(page)
                return

        await asyncio.sleep(config.POLL_INTERVAL_MS / 1000)

    # 超时：保存截图
    screenshot_path = "timeout_screenshot.png"
    await page.screenshot(path=screenshot_path)
    print(f"[✗] 30 秒内未找到购买按钮，截图已保存：{screenshot_path}")


async def _proceed_to_order(page: Page) -> None:
    """点击购买按钮后，走完下单流程直到确认订单页。"""
    # 等待页面跳转或弹窗
    await asyncio.sleep(1)

    # 如果有"季付"选项，选择它
    season_option = page.locator("text=季, text=季付, [data-period='quarter']")
    if await season_option.count() > 0:
        await season_option.first.click()
        await asyncio.sleep(0.5)

    # 点击"立即购买"或"确认"
    for text in ["立即购买", "确认购买", "确认", "下一步"]:
        btn = page.locator(f"button:has-text('{text}'):not([disabled])")
        if await btn.count() > 0:
            await btn.first.click()
            await asyncio.sleep(1)
            break

    # 检测是否到达确认订单页
    current_url = page.url
    on_order_page = any(p in current_url for p in ORDER_CONFIRM_PATTERNS)
    order_text = page.locator("text=确认订单, text=订单确认, text=支付")
    on_order_page = on_order_page or await order_text.count() > 0

    if on_order_page:
        beep()
        print("\n" + "=" * 50)
        print("已到达确认订单页！请立刻手动完成付款！")
        print("=" * 50 + "\n")
    else:
        screenshot_path = "order_page_screenshot.png"
        await page.screenshot(path=screenshot_path)
        print(f"[?] 未能确认是否到达订单页，截图：{screenshot_path}")
        print("请检查浏览器窗口手动完成操作。")
