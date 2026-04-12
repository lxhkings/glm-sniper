// sniper.go - 核心抢购逻辑模块
//
// 功能概述：
//   1. NTP 时间校准 + RTT 补偿，计算最佳开火时刻
//   2. 多 goroutine 并发轮询 isLimitBuy 接口
//   3. sync.Once 保证下单只执行一次
//   4. 成功后打印支付 URL、打开浏览器、播放提示音
package main

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// Sniper 抢购器，封装核心抢购流程
type Sniper struct {
	cfg    *Config
	client *Client
}

// NewSniper 创建抢购器实例
//
// 参数：
//   - cfg: 配置结构体
//   - client: HTTP 客户端
//
// 返回：
//   - *Sniper: 抢购器实例
func NewSniper(cfg *Config, client *Client) *Sniper {
	return &Sniper{
		cfg:    cfg,
		client: client,
	}
}

// Run 执行抢购流程
//
// 核心流程：
//  1. NTP 时间校准
//  2. 计算 saleTime（开售时间）
//  3. 测量 RTT，计算 fireAt（开火时刻）= saleTime - RTT/2
//  4. 等待至 fireAt
//  5. 启动 workers 个 goroutine 并发轮询 IsLimitBuy
//  6. 使用 sync.Once 保证 CreateSign 只调用一次
//  7. 获得支付 URL 后打印、打开浏览器、播放提示音
func (s *Sniper) Run(ctx context.Context) error {
	// 1. NTP 时间校准（必须先执行，确保后续 BeiJingNow() 使用校准时间）
	fmt.Println("[INFO] 正在进行 NTP 时间校准...")
	ntpOffset, err := GetNTPOffset()
	if err != nil {
		fmt.Printf("[WARN] NTP 校准失败，使用本机时间: %v\n", err)
	} else {
		fmt.Printf("[INFO] NTP 偏差: %dms\n", ntpOffset.Milliseconds())
	}

	// 2. 计算开售时间（使用校准后的北京时间）
	now := BeiJingNow()
	fmt.Printf("[INFO] 校准后当前时间: %s\n", now.Format("2006-01-02 15:04:05.000"))

	saleTime := time.Date(
		now.Year(), now.Month(), now.Day(),
		s.cfg.SaleHour, s.cfg.SaleMinute, s.cfg.SaleSecond,
		0, // 纳秒
		now.Location(),
	)

	// 如果开售时间已过，使用明天的时间
	if saleTime.Before(now) {
		saleTime = saleTime.Add(24 * time.Hour)
		fmt.Printf("[INFO] 开售时间已过，使用明天的时间\n")
	}

	fmt.Printf("[INFO] 开售时间: %s\n", saleTime.Format("2006-01-02 15:04:05.000"))

	// 3. 测量 RTT 并计算 fireAt
	fmt.Println("[INFO] 正在测量 RTT...")
	rtt, err := MeasureRTT("bigmodel.cn")
	if err != nil {
		fmt.Printf("[WARN] RTT 测量失败，使用默认值 100ms: %v\n", err)
		rtt = 100 * time.Millisecond
	}
	fireAt := FireAt(saleTime, rtt)

	fmt.Printf("[INFO] RTT: %dms\n", rtt.Milliseconds())
	fmt.Printf("[INFO] RTT 补偿: %dms (提前 %dms 发起请求)\n", rtt.Milliseconds()/2, rtt.Milliseconds()/2)
	fmt.Printf("[INFO] 开火时刻: %s\n", fireAt.Format("2006-01-02 15:04:05.000"))

	// 4. 等待至开火时刻
	waitDuration := time.Until(fireAt)
	if waitDuration > 0 {
		fmt.Printf("[INFO] 等待 %s 后开始轮询...\n", waitDuration.Round(time.Millisecond))

		// 分阶段等待
		// 提前 preloadSeconds 秒开始准备（连接预热已在 main.go 完成）
		preloadTime := time.Duration(s.cfg.PreloadSeconds) * time.Second
		preloadAt := fireAt.Add(-preloadTime)

		// 等待到预热时刻
		preloadWait := time.Until(preloadAt)
		if preloadWait > 0 {
			fmt.Printf("[INFO] 等待 %s 后进入准备状态...\n", preloadWait.Round(time.Millisecond))
			time.Sleep(preloadWait)
		}

		// 等待剩余时间
		remainingWait := time.Until(fireAt)
		if remainingWait > 0 {
			fmt.Printf("[INFO] 准备就绪，等待 %s 后开始轮询...\n", remainingWait.Round(time.Millisecond))
			time.Sleep(remainingWait)
		}
	}

	fmt.Println("[INFO] ===== 开火！开始轮询 =====")

	// 5. 启动 workers 个 goroutine 并发轮询
	var once sync.Once
	var success int32 // 原子标记，表示是否已有成功下单
	var wg sync.WaitGroup
	wg.Add(s.cfg.Workers)

	pollInterval := time.Duration(s.cfg.PollIntervalMs) * time.Millisecond

	for i := 0; i < s.cfg.Workers; i++ {
		go func(workerId int) {
			defer wg.Done()

			for {
				// 检查是否已有成功下单
				if atomic.LoadInt32(&success) == 1 {
					fmt.Printf("[Worker %d] 已有成功下单，停止轮询\n", workerId)
					return
				}

				// 检查上下文是否取消
				select {
				case <-ctx.Done():
					fmt.Printf("[Worker %d] 上下文取消，停止轮询\n", workerId)
					return
				default:
				}

				// 轮询 IsLimitBuy
				isLimitBuy, err := s.client.IsLimitBuy(ctx)
				if err != nil {
					fmt.Printf("[Worker %d] 轮询失败: %v\n", workerId, err)
					time.Sleep(pollInterval)
					continue
				}

				if isLimitBuy {
					fmt.Printf("[Worker %d] ===== 检测到开售！开始下单 =====\n", workerId)

					// 使用 sync.Once 确保只下单一次
					once.Do(func() {
						atomic.StoreInt32(&success, 1)
						s.doOrder(ctx, workerId)
					})
					return
				}

				// 短暂休眠后继续轮询
				time.Sleep(pollInterval)
			}
		}(i)
	}

	// 等待所有 worker 完成
	wg.Wait()

	if atomic.LoadInt32(&success) == 1 {
		fmt.Println("[INFO] ===== 抢购成功！=====")
	} else {
		fmt.Println("[INFO] ===== 抢购结束（未成功）=====")
	}

	return nil
}

// doOrder 执行下单流程
//
// 流程：
//  1. 调用 PayPreview 获取 bizId
//  2. 调用 CreateSign 获取支付 URL
//  3. 打印支付 URL 和订单 ID
//  4. 打开浏览器
//  5. 播放提示音
func (s *Sniper) doOrder(ctx context.Context, workerId int) {
	fmt.Printf("[Worker %d] 开始执行下单流程...\n", workerId)

	// 1. 调用 PayPreview 获取 bizId
	fmt.Printf("[Worker %d] 正在获取 bizId...\n", workerId)
	bizId, err := s.client.PayPreview(ctx, s.cfg.PlanCode, s.cfg.PayType)
	if err != nil {
		fmt.Printf("[Worker %d] PayPreview 失败: %v\n", workerId, err)
		return
	}
	fmt.Printf("[Worker %d] 获取到 bizId: %s\n", workerId, bizId)

	// 2. 调用 CreateSign 获取支付 URL
	fmt.Printf("[Worker %d] 正在创建订单...\n", workerId)
	payURL, orderId, err := s.client.CreateSign(ctx, bizId, s.cfg.PayType, "")
	if err != nil {
		fmt.Printf("[Worker %d] CreateSign 失败: %v\n", workerId, err)
		return
	}

	// 3. 打印支付 URL 和订单 ID
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println("           抢购成功！")
	fmt.Println("========================================")
	fmt.Printf("订单 ID:  %s\n", orderId)
	fmt.Printf("支付 URL: %s\n", payURL)
	fmt.Println("========================================")
	fmt.Println()

	// 4. 打开浏览器
	s.openBrowser(payURL)

	// 5. 播放提示音
	s.playSound()
}

// openBrowser 在浏览器中打开 URL
//
// 支持 macOS、Windows、Linux
func (s *Sniper) openBrowser(url string) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("start", "", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		fmt.Printf("[WARN] 不支持的操作系统: %s，请手动打开: %s\n", runtime.GOOS, url)
		return
	}

	if err := cmd.Start(); err != nil {
		fmt.Printf("[WARN] 打开浏览器失败: %v，请手动打开: %s\n", err, url)
	} else {
		fmt.Println("[INFO] 已在浏览器中打开支付页面")
	}
}

// playSound 播放系统提示音
//
// 使用终端响铃或系统命令播放提示音
func (s *Sniper) playSound() {
	// 方法 1：终端响铃（跨平台）
	fmt.Print("\a")

	// 方法 2：macOS 使用 say 命令播放语音
	if runtime.GOOS == "darwin" {
		go func() {
			cmd := exec.Command("say", "抢购成功，请尽快支付")
			cmd.Run()
		}()
	}

	// 方法 3：播放系统声音文件（可选）
	// macOS: /System/Library/Sounds/
	// Windows: C:\Windows\Media\
	// Linux: /usr/share/sounds/

	fmt.Println("[INFO] 已播放提示音")
}