package main

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config 配置结构体，包含抢购所需的所有参数
type Config struct {
	// Token JWT 认证令牌，从浏览器 Cookie 中 bigmodel_token_production 导出
	Token string `yaml:"token"`

	// PlanCode 套餐代码: lite / pro / max
	PlanCode string `yaml:"plan_code"`

	// PayType 支付方式: alipay / wechat
	PayType string `yaml:"pay_type"`

	// BizId 业务 ID，留空则运行时自动从 product/info 接口获取
	BizId string `yaml:"biz_id"`

	// SaleHour 开售时间 - 小时 (北京时间)
	SaleHour int `yaml:"sale_hour"`

	// SaleMinute 开售时间 - 分钟 (北京时间)
	SaleMinute int `yaml:"sale_minute"`

	// SaleSecond 开售时间 - 秒 (北京时间)
	SaleSecond int `yaml:"sale_second"`

	// PreloadSeconds 提前多少秒开始轮询和连接预热
	PreloadSeconds int `yaml:"preload_seconds"`

	// PollIntervalMs 轮询间隔 (毫秒)
	PollIntervalMs int `yaml:"poll_interval_ms"`

	// Workers 并发 goroutine 数
	Workers int `yaml:"workers"`
}

// LoadConfig 从 YAML 文件读取配置
// path: 配置文件路径
// 返回填充好的 Config 结构体指针和可能的错误
func LoadConfig(path string) (*Config, error) {
	// 读取配置文件
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	// 解析 YAML
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}

	// 设置默认值
	if cfg.PreloadSeconds == 0 {
		cfg.PreloadSeconds = 30
	}
	if cfg.PollIntervalMs == 0 {
		cfg.PollIntervalMs = 50
	}
	if cfg.Workers == 0 {
		cfg.Workers = 5
	}

	// 验证必填字段
	if cfg.Token == "" {
		return nil, fmt.Errorf("token 不能为空")
	}
	if cfg.PlanCode == "" {
		return nil, fmt.Errorf("plan_code 不能为空")
	}
	if cfg.PayType == "" {
		return nil, fmt.Errorf("pay_type 不能为空")
	}

	// 验证套餐代码
	validPlanCodes := map[string]bool{"lite": true, "pro": true, "max": true}
	if !validPlanCodes[cfg.PlanCode] {
		return nil, fmt.Errorf("无效的 plan_code: %s，必须是 lite/pro/max", cfg.PlanCode)
	}

	// 验证支付方式
	validPayTypes := map[string]bool{"alipay": true, "wechat": true}
	if !validPayTypes[cfg.PayType] {
		return nil, fmt.Errorf("无效的 pay_type: %s，必须是 alipay/wechat", cfg.PayType)
	}

	// 验证时间范围
	if cfg.SaleHour < 0 || cfg.SaleHour > 23 {
		return nil, fmt.Errorf("sale_hour 必须在 0-23 之间")
	}
	if cfg.SaleMinute < 0 || cfg.SaleMinute > 59 {
		return nil, fmt.Errorf("sale_minute 必须在 0-59 之间")
	}
	if cfg.SaleSecond < 0 || cfg.SaleSecond > 59 {
		return nil, fmt.Errorf("sale_second 必须在 0-59 之间")
	}

	return &cfg, nil
}