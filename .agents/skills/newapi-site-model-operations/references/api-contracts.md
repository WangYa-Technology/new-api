# New API 操作接口速查

本文件记录当前项目已确认的管理 API 合同。AI 执行常规站点操作时直接按此文件组装请求，不要先搜索代码库。只有线上返回 404、字段校验失败、响应结构明显不同，或用户指定的线上版本不是当前项目版本时，才回到代码库/线上接口文档核对。

## 鉴权与通用响应

- 管理 API 根路径：`{SITE_URL}/api`。
- 使用用户提供的管理员访问令牌。令牌放在运行时环境变量或安全 HTTP 客户端中，不写入 shell 历史、文件、日志和答复。具体 Header 名称以站点现有客户端/令牌类型为准；不能擅自把网页登录密码当 API 令牌。
- JSON 请求使用 `Content-Type: application/json`。
- 常规响应通常包含 `success` 和 `data`；以 HTTP 状态码和响应体共同判断结果。写入后必须再次 GET 回读。
- 分页参数：`page`、`page_size`；搜索参数通常是 `keyword`。不要因为分页结果为空就判断对象不存在，先提高 `page_size` 或精确搜索。

## 供应商元数据（Vendor）

Vendor 只是模型广场的供应商元数据，不含上游凭据，也不等于可调用渠道。

| 用途 | 方法 | 路径 |
|---|---|---|
| 列表/搜索 | GET | `/api/vendors/?keyword={name}&page=1&page_size=100` |
| 单条读取 | GET | `/api/vendors/{id}` |
| 创建 | POST | `/api/vendors/` |
| 更新 | PUT | `/api/vendors/` |
| 删除 | DELETE | `/api/vendors/{id}` |

创建/更新的核心 JSON：

```json
{
  "id": 0,
  "name": "供应商显示名称",
  "description": "中文或用户指定语言的供应商说明",
  "icon": "lobehub-icon-name"
}
```

更新时必须使用真实 `id`；读取到的 `version` 用于并发保护时应原样带回。删除前先确认没有模型引用，服务会拒绝留下孤立模型的删除。

## 上游渠道（Channel）

渠道包含协议类型、端点、凭据和上游模型清单。`Channel.Type` 是项目内部整数，不能凭名称猜；优先从已有同类渠道复制非敏感结构，或由站点界面选择类型后回读确认。

| 用途 | 方法 | 路径 |
|---|---|---|
| 列表/搜索 | GET | `/api/channel/?keyword={name}&page=1&page_size=100` |
| 单条读取 | GET | `/api/channel/{id}` |
| 创建 | POST | `/api/channel/` |
| 更新 | PUT | `/api/channel/` |
| 删除 | DELETE | `/api/channel/{id}` |
| 启用/禁用 | POST | `/api/channel/{id}/status`，body `{"status": 1}` 或 `{"status": 2}`，以线上返回/界面约定为准 |
| 测试单条渠道 | GET | `/api/channel/test/{id}` |
| 获取上游模型 | GET | `/api/channel/fetch_models/{id}` |

创建请求外层：

```json
{
  "mode": "single",
  "channel": {
    "type": 0,
    "name": "统一供应商名称",
    "key": "运行时注入的上游密钥",
    "base_url": "https://upstream.example/v1",
    "models": "model-a,model-b",
    "model_mapping": "{}",
    "group": "default",
    "status": 1,
    "priority": 0,
    "weight": 0
  }
}
```

这是字段形状模板，不是可直接提交的通用 `type` 或价格模板。创建前必须根据已有同协议渠道核对 `type`、`setting`、`other`、`other_info`、`param_override`、`header_override` 和 `model_mapping` 的实际格式。更新使用渠道 `id`，且接口禁止通过更新接口直接修改 `status`，状态用专用状态接口。

`models` 是渠道承载的上游/站点模型清单；`model_mapping` 是 JSON 对象字符串，例如：

```json
{"deepseek-v4-flash":"provider-prefix/deepseek-v4-flash"}
```

映射方向固定为“站点公开模型 ID → 上游真实模型 ID”。增加模型时先读取原值，合并新键，再整体写回，禁止用新 JSON 覆盖既有映射。

## 模型目录元数据（Model）

模型目录控制模型广场描述、标签、供应商归属和可见状态；它与渠道的 `models` 字段分开维护。

| 用途 | 方法 | 路径 |
|---|---|---|
| 列表/搜索 | GET | `/api/models/?keyword={model_id}&vendor={vendor_id}&page=1&page_size=100&include_channel_models=true` |
| 单条读取 | GET | `/api/models/{id}` |
| 创建 | POST | `/api/models/` |
| 更新 | PUT | `/api/models/` |
| 删除 | DELETE | `/api/models/{id}?remove_from_channels=false&remove_pricing=false` |

创建/更新核心 JSON：

```json
{
  "model_name": "站点公开模型 ID",
  "description": "中文模型描述",
  "icon": "",
  "tags": "对话,编程,快速",
  "vendor_id": 12,
  "endpoints": "{\"openai\":true}",
  "status": 1,
  "sync_official": 0,
  "name_rule": 0
}
```

`name_rule`：`0` 精确、`1` 前缀、`2` 包含、`3` 后缀。除非用户明确要规则匹配，新增单模型使用 `0`。描述/标签语言遵循用户要求；本项目近期约定是模型描述和标签使用中文。

## 模型定价

当前项目提供模型定价快照和版本化更新，不应直接盲改完整的 `ModelRatio`/`CompletionRatio` 全量选项。

| 用途 | 方法 | 路径 |
|---|---|---|
| 读取公开站点版本/计费单位信息 | GET | `/api/status`（含 `version`、`quota_per_unit`、币种显示设置等公开状态） |
| 读取目标模型定价 | GET | `/api/option/model_pricing?model={model_id}` |
| 预览普通配置的有效价格 | POST | `/api/option/model_pricing/preview` |
| 预览旧倍率转表达式 | POST | `/api/option/model_pricing/convert` |
| 写入定价 | PATCH | `/api/option/model_pricing` |
| 公共价格展示 | GET | `/api/pricing` |

预览请求：

```json
{
  "model_name": "模型 ID",
  "pricing": {
    "ModelRatio": 0.0375,
    "CompletionRatio": 3.0,
    "CacheRatio": 0.15,
    "CreateCacheRatio": 1.0,
    "ImageRatio": 1.0,
    "billing_setting.billing_mode": "ratio"
  }
}
```

写入请求使用读取结果中的版本，避免覆盖并发修改：

```json
{
  "changes": [
    {
      "model_name": "模型 ID",
      "expected_version": "读取快照中的 version",
      "pricing": {
        "ModelRatio": 0.0375,
        "CompletionRatio": 3.0,
        "CacheRatio": 0.15,
        "CreateCacheRatio": 1.0,
        "ImageRatio": 1.0,
        "billing_setting.billing_mode": "ratio"
      }
    }
  ]
}
```

普通 token 价格换算仅在站点确认使用 legacy ratio 且已读取 `quota_per_unit` 后进行。当前项目公式为：

```text
ModelRatio = 输入价(USD/1M) × QuotaPerUnit / 1,000,000
CompletionRatio = 输出价 / 输入价
```

不要将公式用于 RMB、固定请求价、图片数量、视频秒数、音频、任务插件、输入价为 0 或动态阶梯价格。此类价格必须使用站点支持的对应表达式/用量字段；线上接口不支持时停止，不猜写。

## 推荐执行序列

1. GET 目标站点 `/api/status` 确认站点可达、版本和公开的 `quota_per_unit`/币种显示信息，再 GET 目标对象。
2. 依据本文件确定是 Vendor、Channel、Model 还是 Pricing 对象；保存变更前的非敏感快照。
3. 先写 Vendor（如需要），再写 Channel，再写 Model 元数据，最后写 Pricing；只执行用户授权的步骤。
4. 每次写入立即 GET 回读；不要把“渠道模型列表”“模型广场条目”“模型价格”混为一项。
5. 最终验证：模型公开 ID、渠道模型/映射、渠道状态、目录描述/标签、币种/计价单位/缓存规则分别符合要求。所有测试请求都要确认不会产生未授权费用。

## 常见错误处理

- `404`：先确认是否缺少 `/api`、路径末尾 `/` 或线上版本不同；不要立即换成猜测路径。
- `401/403`：停止写操作，要求正确的管理员令牌/权限；不要反复重试。
- `409` 或版本冲突：重新 GET 目标对象，合并用户目标后再提交；不要强行覆盖。
- 成功响应但回读不一致：停止后续步骤，报告响应和实际状态差异。
- 渠道测试失败：区分端点、凭据、模型映射和上游模型不可用，不要通过删除旧渠道来“修复”。
