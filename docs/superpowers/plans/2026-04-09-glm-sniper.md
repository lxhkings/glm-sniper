# GLM Sniper 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Python 程序，在每天北京时间 10:00:00 自动登录智谱 AI 并抢购 "lite 连接包季" 套餐，到达确认订单页后暂停等待用户手动付款。

**Architecture:** 主程序 `sniper.py` 依次调用 `auth.py` 完成登录、`buyer.py` 负责定时轮询并点击购买按钮直到进入确认订单页。`utils.py` 提供 NTP 时间校准和声音提醒两个工具函数。所有配置通过 `config.py` 从 `.env` 读取。

**Tech Stack:** Python 3.11+, Playwright (有头 Chromium), python-dotenv, ntplib, pytest

---

### Task 1: 初始化项目结构与依赖

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`（追加条目）

- [ ] **Step 1: 写 requirements.txt**

```
playwright==1.43.0
python-dotenv==1.0.1
ntplib==0.4.0
pytest==8.1.1
pytest-asyncio==0.23.6
```

- [ ] **Step 2: 写 .env.example**

```
GLM_PHONE=18600000000
GLM_PASSWORD=your_password_here
```

- [ ] **Step 3: 确认 .gitignore 包含 .env**

打开 `.gitignore`，确认包含以下两行（若无则追加）：
```
.env
*.png
```

- [ ] **Step 4: 安装依赖**

```bash
pip install -r requirements.txt
playwright install chromium
```

期望输出：`Chromium 124.x.x` 安装成功，无报错。

- [ ] **Step 5: 创建真实 .env**

```bash
cp .env.example .env
# 编辑 .env，填入真实账号密码
```

- [ ] **Step 6: 提交**

```bash
git add requirements.txt .env.example .gitignore
git commit -m "chore: 初始化项目依赖和配置模板"
```

---

### Task 2: config.py — 配置加载

**Files:**
- Create: `config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_config.py
import os
import pytest

def test_config_loads_phone_and_password(monkeypatch):
    monkeypatch.setenv("GLM_PHONE", "18600000000")
    monkeypatch.setenv("GLM_PASSWORD", "testpass")
    # 重新导入以触发 load_dotenv
    import importlib
    import config
    importlib.reload(config)
    assert config.GLM_PHONE == "18600000000"
    assert config.GLM_PASSWORD == "testpass"

def test_config_raises_if_phone_missing(monkeypatch):
    monkeypatch.delenv("GLM_PHONE", raising=False)
    monkeypatch.delenv("GLM_PASSWORD", raising=False)
    import importlib
    import config
    with pytest.raises(ValueError, match="GLM_PHONE"):
        importlib.reload(config)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pytest tests/test_config.py -v
```

期望：`ImportError` 或 `ModuleNotFoundError`（config.py 还不存在）

- [ ] **Step 3: 实现 config.py**

```python
# config.py
import os
from dotenv import load_dotenv

load_dotenv()

GLM_PHONE: str = os.getenv("GLM_PHONE", "")
GLM_PASSWORD: str = os.getenv("GLM_PASSWORD", "")

if not GLM_PHONE:
    raise ValueError("GLM_PHONE 未设置，请检查 .env 文件")
if not GLM_PASSWORD:
    raise ValueError("GLM_PASSWORD 未设置，请检查 .env 文件")

# 目标商品页 URL（根据实际页面调整）
PRODUCT_URL = "https://open.bigmodel.cn/console/plan"

# 开售时间：北京时间 10:00:00
SALE_HOUR = 10
SALE_MINUTE = 0
SALE_SECOND = 0

# 提前多少秒开始轮询
PRELOAD_SECONDS = 10

# 轮询间隔（毫秒）
POLL_INTERVAL_MS = 100
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest tests/test_config.py -v
```

期望：2 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
git add config.py tests/test_config.py
git commit -m "feat: 添加配置加载模块"
```

---

### Task 3: utils.py — NTP 校时与声音提醒

**Files:**
- Create: `utils.py`
- Create: `tests/test_utils.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_utils.py
import time
from unittest.mock import patch, MagicMock
from utils import get_ntp_offset, beijing_now

def test_get_ntp_offset_returns_float():
    # 用真实 NTP（需要网络），允许偏差在 ±60 秒内
    offset = get_ntp_offset()
    assert isinstance(offset, float)
    assert -60 < offset < 60

def test_beijing_now_returns_correct_tzinfo():
    import zoneinfo
    now = beijing_now()
    assert now.tzinfo is not None
    assert "Asia/Shanghai" in str(now.tzinfo) or now.utcoffset().seconds == 8 * 3600
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pytest tests/test_utils.py -v
```

期望：`ModuleNotFoundError: No module named 'utils'`

- [ ] **Step 3: 实现 utils.py**

```python
# utils.py
import ntplib
import time
import os
import platform
from datetime import datetime
from zoneinfo import ZoneInfo

_ntp_offset: float = 0.0

def get_ntp_offset() -> float:
    """向 NTP 服务器查询时间偏差（秒），正值表示本机偏快。"""
    global _ntp_offset
    try:
        client = ntplib.NTPClient()
        response = client.request("pool.ntp.org", version=3)
        _ntp_offset = response.offset
    except Exception:
        _ntp_offset = 0.0
    return _ntp_offset

def beijing_now() -> datetime:
    """返回当前北京时间（含 NTP 偏差修正）。"""
    ts = time.time() - _ntp_offset
    return datetime.fromtimestamp(ts, tz=ZoneInfo("Asia/Shanghai"))

def beep():
    """发出系统提示音。"""
    if platform.system() == "Darwin":
        os.system("afplay /System/Library/Sounds/Glass.aiff")
    elif platform.system() == "Windows":
        import winsound
        winsound.Beep(1000, 500)
    else:
        print("\a")
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pytest tests/test_utils.py -v
```

期望：2 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
git add utils.py tests/test_utils.py
git commit -m "feat: 添加 NTP 校时和提醒工具"
```

---

### Task 4: auth.py — 登录逻辑

**Files:**
- Create: `auth.py`

> 注意：Playwright 页面交互不做单元测试，通过 Task 6 手动端到端验证。

- [ ] **Step 1: 实现 auth.py**

```python
# auth.py
import asyncio
from playwright.async_api import Page

LOGIN_URL = "https://open.bigmodel.cn/login"

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
```

- [ ] **Step 2: 提交**

```bash
git add auth.py
git commit -m "feat: 添加登录模块"
```

---

### Task 5: buyer.py — 定时轮询与下单

**Files:**
- Create: `buyer.py`

- [ ] **Step 1: 实现 buyer.py**

```python
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
                print(f"[✗] 检测到"{text}"，本次未抢到")
                return

        # 查找购买按钮
        for text in BUY_BUTTON_TEXTS:
            btn = page.locator(f"button:has-text('{text}'):not([disabled])")
            if await btn.count() > 0:
                print(f"[✓] 找到按钮"{text}"，立刻点击！")
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
        print("🎉 已到达确认订单页！请立刻手动完成付款！")
        print("=" * 50 + "\n")
    else:
        screenshot_path = "order_page_screenshot.png"
        await page.screenshot(path=screenshot_path)
        print(f"[?] 未能确认是否到达订单页，截图：{screenshot_path}")
        print("请检查浏览器窗口手动完成操作。")
```

- [ ] **Step 2: 提交**

```bash
git add buyer.py
git commit -m "feat: 添加定时轮询与下单模块"
```

---

### Task 6: sniper.py — 主入口串联

**Files:**
- Create: `sniper.py`

- [ ] **Step 1: 实现 sniper.py**

```python
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
        print(f"\n[→] 正在登录账号 {config.GLM_PHONE}...")
        await login(page, config.GLM_PHONE, config.GLM_PASSWORD)

        # 导航到商品页
        print(f"[→] 导航到商品页：{config.PRODUCT_URL}")
        await page.goto(config.PRODUCT_URL, wait_until="networkidle")

        # 等待开售时间
        await wait_until_ready()

        # 开始轮询抢购
        await poll_and_buy(page)

        # 保持浏览器打开，让用户完成付款
        print("\n[i] 浏览器保持打开，请完成付款后手动关闭程序（Ctrl+C）")
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: 提交**

```bash
git add sniper.py
git commit -m "feat: 添加主入口，串联登录与抢购流程"
```

---

### Task 7: 端到端冒烟测试

> 在实际开售前验证程序可正常运行，不必等到 10 点。

- [ ] **Step 1: 验证登录流程**

```bash
python - <<'EOF'
import asyncio
from playwright.async_api import async_playwright
import config
from auth import login
from utils import get_ntp_offset, beijing_now

async def test():
    get_ntp_offset()
    print(f"北京时间：{beijing_now()}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        await login(page, config.GLM_PHONE, config.GLM_PASSWORD)
        print(f"当前 URL：{page.url}")
        await browser.close()

asyncio.run(test())
EOF
```

期望：打印"登录成功"且 URL 不含"login"

- [ ] **Step 2: 验证商品页可以打开**

```bash
python - <<'EOF'
import asyncio
from playwright.async_api import async_playwright
import config
from auth import login

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        await login(page, config.GLM_PHONE, config.GLM_PASSWORD)
        await page.goto(config.PRODUCT_URL, wait_until="networkidle")
        print(f"商品页标题：{await page.title()}")
        await browser.close()

asyncio.run(test())
EOF
```

期望：打印商品页标题，无报错

- [ ] **Step 3: 若 PRODUCT_URL 不正确，更新 config.py**

手动查看商品页真实 URL，更新 `config.py` 中的 `PRODUCT_URL`，重新提交：

```bash
git add config.py
git commit -m "fix: 更新商品页 URL"
```

- [ ] **Step 4: 运行单元测试套件**

```bash
pytest tests/ -v
```

期望：所有测试 PASS

- [ ] **Step 5: 提交最终状态**

```bash
git add -A
git commit -m "chore: 冒烟测试通过，程序就绪"
```

---

## 注意事项

1. **首次运行**：建议提前 30 分钟启动 `python sniper.py`，确保登录成功并停在商品页。
2. **网络要求**：需要能访问 `pool.ntp.org`（NTP 校时）和 `open.bigmodel.cn`。
3. **选择器可能需要调整**：智谱 AI 页面结构可能更新，若按钮找不到，用浏览器开发者工具查看实际选择器，更新 `buyer.py` 中的 `BUY_BUTTON_TEXTS`。
4. **凭据安全**：`.env` 已在 `.gitignore` 中，不要直接在代码中硬编码密码。
