// api.go - API 调用封装模块
//
// 功能概述：
//   1. IsLimitBuy - 轮询是否开售，用于确定抢购时机
//   2. PayPreview - 价格预览，获取下单所需的 bizId
//   3. CreateSign - 创建订单，获取支付跳转 URL 和订单 ID
//
// 认证方式：
//   所有 API 请求通过 client.Do() 发送，自动注入 Authorization、Content-Type 等头部
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// LimitBuyResponse 轮询开售接口响应
// GET /api/biz/product/isLimitBuy
// 当 data.isLimitBuy 为 true 时表示已开售
type LimitBuyResponse struct {
	Code    int    `json:"code"`
	Msg     string `json:"msg"`
	Data    struct {
		IsWhiteList bool `json:"isWhiteList"` // 是否在白名单
		IsLimitBuy  bool `json:"isLimitBuy"`  // 是否开售（关键字段）
	} `json:"data"`
	Success bool `json:"success"`
}

// PreviewResponse 价格预览接口响应
// POST /api/biz/pay/preview
// 返回 bizId，用于后续创建订单
type PreviewResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		BizId string `json:"bizId"` // 业务 ID（关键字段）
		// 其他字段根据实际 API 可添加
	} `json:"data"`
	Success bool `json:"success"`
}

// CreateSignResponse 创建订单接口响应
// POST /api/biz/pay/create-sign
// 返回支付跳转 URL 和订单 ID
type CreateSignResponse struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
	Data struct {
		Sign    string `json:"sign"`    // 支付跳转 URL
		OrderId string `json:"orderId"`  // 订单 ID
	} `json:"data"`
	Success bool `json:"success"`
}

// previewRequest 价格预览请求体
type previewRequest struct {
	PlanCode string `json:"planCode"` // 套餐代码: lite / pro / max
	PayType  string `json:"payType"`  // 支付方式: alipay / wechat
}

// createSignRequest 创建订单请求体
type createSignRequest struct {
	BizId       string `json:"bizId"`       // 业务 ID，从 PayPreview 获取
	PayType     string `json:"payType"`     // 支付方式: alipay / wechat
	AgreementNo string `json:"agreementNo"` // 协议编号，可为空
}

// IsLimitBuy 轮询是否开售
//
// 调用 GET /api/biz/product/isLimitBuy 接口，
// 当 data.isLimitBuy 为 true 时表示商品已开售，可以开始抢购流程。
//
// 参数：
//   - ctx: 上下文，用于取消请求
//
// 返回：
//   - bool: true 表示已开售，false 表示未开售
//   - error: 请求失败或解析错误
func (c *Client) IsLimitBuy(ctx context.Context) (bool, error) {
	// 构建请求 URL
	url := fmt.Sprintf("%s/api/biz/product/isLimitBuy", c.baseURL)

	// 创建请求
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, fmt.Errorf("创建请求失败: %w", err)
	}

	// 发送请求（client.Do 会自动注入头部）
	resp, err := c.Do(req)
	if err != nil {
		return false, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Errorf("读取响应失败: %w", err)
	}

	// 解析响应
	var result LimitBuyResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return false, fmt.Errorf("解析响应失败: %w (body: %s)", err, string(body))
	}

	// 检查业务状态码
	if result.Code != 0 && !result.Success {
		return false, fmt.Errorf("API 返回错误: code=%d, msg=%s", result.Code, result.Msg)
	}

	return result.Data.IsLimitBuy, nil
}

// PayPreview 价格预览，获取下单所需的 bizId
//
// 调用 POST /api/biz/pay/preview 接口，
// 返回 bizId，该 ID 用于后续 CreateSign 接口创建订单。
//
// 参数：
//   - ctx: 上下文，用于取消请求
//   - planCode: 套餐代码，可选值: lite / pro / max
//   - payType: 支付方式，可选值: alipay / wechat
//
// 返回：
//   - string: bizId，用于 CreateSign 接口
//   - error: 请求失败或解析错误
func (c *Client) PayPreview(ctx context.Context, planCode, payType string) (string, error) {
	// 构建请求 URL
	url := fmt.Sprintf("%s/api/biz/pay/preview", c.baseURL)

	// 构建请求体
	reqBody := previewRequest{
		PlanCode: planCode,
		PayType:  payType,
	}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("序列化请求体失败: %w", err)
	}

	// 创建请求
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	// 发送请求
	resp, err := c.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	// 解析响应
	var result PreviewResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析响应失败: %w (body: %s)", err, string(body))
	}

	// 检查业务状态码
	if result.Code != 0 && !result.Success {
		return "", fmt.Errorf("API 返回错误: code=%d, msg=%s", result.Code, result.Msg)
	}

	// 检查 bizId
	if result.Data.BizId == "" {
		return "", fmt.Errorf("响应中缺少 bizId (body: %s)", string(body))
	}

	return result.Data.BizId, nil
}

// CreateSign 创建订单，获取支付跳转 URL
//
// 调用 POST /api/biz/pay/create-sign 接口，
// 使用 PayPreview 返回的 bizId 创建订单，
// 返回支付跳转 URL 和订单 ID。
//
// 参数：
//   - ctx: 上下文，用于取消请求
//   - bizId: 业务 ID，从 PayPreview 获取
//   - payType: 支付方式，可选值: alipay / wechat
//   - agreementNo: 协议编号，可为空字符串
//
// 返回：
//   - string: payURL，支付跳转地址
//   - string: orderId，订单 ID
//   - error: 请求失败或解析错误
func (c *Client) CreateSign(ctx context.Context, bizId, payType, agreementNo string) (string, string, error) {
	// 构建请求 URL
	url := fmt.Sprintf("%s/api/biz/pay/create-sign", c.baseURL)

	// 构建请求体
	reqBody := createSignRequest{
		BizId:       bizId,
		PayType:     payType,
		AgreementNo: agreementNo,
	}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", fmt.Errorf("序列化请求体失败: %w", err)
	}

	// 创建请求
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", "", fmt.Errorf("创建请求失败: %w", err)
	}

	// 发送请求
	resp, err := c.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("读取响应失败: %w", err)
	}

	// 解析响应
	var result CreateSignResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", fmt.Errorf("解析响应失败: %w (body: %s)", err, string(body))
	}

	// 检查业务状态码
	if result.Code != 0 && !result.Success {
		return "", "", fmt.Errorf("API 返回错误: code=%d, msg=%s", result.Code, result.Msg)
	}

	// 检查关键字段
	if result.Data.Sign == "" {
		return "", "", fmt.Errorf("响应中缺少 sign (payURL) (body: %s)", string(body))
	}
	if result.Data.OrderId == "" {
		return "", "", fmt.Errorf("响应中缺少 orderId (body: %s)", string(body))
	}

	return result.Data.Sign, result.Data.OrderId, nil
}