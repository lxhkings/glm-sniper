// main.go - GLM Sniper Go 版本入口
//
// 功能概述：
//   1. 加载配置文件
//   2. 初始化 HTTP 客户端（TLS JA3 伪装）
//   3. 预热 TLS 连接
//   4. 执行抢购流程（包含 NTP 校准、RTT 补偿、并发轮询）
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/net/http2"
)

// 版本信息（由构建时注入）
var (
	version   = "dev"
	buildTime = "unknown"
)

func main() {
	// 解析命令行参数
	configPath := flag.String("config", "config.yaml", "配置文件路径")
	showVersion := flag.Bool("version", false, "显示版本信息")
	flag.Parse()

	// 显示版本信息
	if *showVersion {
		fmt.Printf("GLM Sniper Go %s (built %s)\n", version, buildTime)
		os.Exit(0)
	}

	// 打印启动信息
	fmt.Println("========================================")
	fmt.Println("        GLM Sniper Go")
	fmt.Println("========================================")
	fmt.Printf("版本: %s\n", version)
	fmt.Printf("构建时间: %s\n", buildTime)
	fmt.Println("========================================")
	fmt.Println()

	// 1. 加载配置文件
	fmt.Printf("[INFO] 加载配置文件: %s\n", *configPath)
	cfg, err := LoadConfig(*configPath)
	if err != nil {
		fmt.Printf("[ERROR] 加载配置失败: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("[INFO] 配置加载成功:\n")
	fmt.Printf("  - 套餐: %s\n", cfg.PlanCode)
	fmt.Printf("  - 支付方式: %s\n", cfg.PayType)
	fmt.Printf("  - 开售时间: %02d:%02d:%02d\n", cfg.SaleHour, cfg.SaleMinute, cfg.SaleSecond)
	fmt.Printf("  - 预热时间: %d 秒\n", cfg.PreloadSeconds)
	fmt.Printf("  - 轮询间隔: %d 毫秒\n", cfg.PollIntervalMs)
	fmt.Printf("  - 并发数: %d\n", cfg.Workers)
	fmt.Println()

	// 2. 创建 HTTP Transport（TLS JA3 伪装）
	fmt.Println("[INFO] 初始化 HTTP/2 Transport...")
	transport := NewTransport()

	// 3. 创建 HTTP 客户端
	fmt.Println("[INFO] 初始化 HTTP 客户端...")
	client := NewClient(cfg, transport)

	// 4. 预热连接
	fmt.Println("[INFO] 预热 TLS 连接...")
	httpClient := &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}

	pool, keepaliveCancel, err := PreWarmConnections(
		transport,
		client.GetBaseURL(),
		httpClient,
		cfg.PreloadSeconds,
		cfg.Workers,
	)
	if err != nil {
		fmt.Printf("[WARN] 连接预热失败: %v（将继续执行）\n", err)
	} else {
		defer keepaliveCancel()
		defer pool.Close()
		fmt.Printf("[INFO] 连接预热成功，已建立 %d 条连接\n", pool.Size())
	}
	fmt.Println()

	// 5. 创建抢购器
	sniper := NewSniper(cfg, client)

	// 6. 设置信号处理（支持 Ctrl+C 取消）
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\n[INFO] 收到退出信号，正在停止...")
		cancel()
	}()

	// 7. 执行抢购流程
	if err := sniper.Run(ctx); err != nil {
		fmt.Printf("[ERROR] 抢购失败: %v\n", err)
		os.Exit(1)
	}
}