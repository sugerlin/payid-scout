# PayID Scout — 本地优先的 PayID 候选扫描器

![PayID Scout](assets/payid-scout-banner.png)

![PayID Scout AI workflow](assets/payid-scout-ai-cloud-card.png)

一个运行在 `cloudflare.pay` 页面上的 Chrome Manifest V3 扩展，用来逐个查询候选 PayID，并按字符串本身的通用价值排序。

PayID Scout 只负责发现、分类、查询和本地统计：不会点击 Reserve，不会自动注册，也不会因为一个单词存在品牌关联就把它直接删除。

## 功能

- 在真实 Cloudflare Wallet 输入框中逐个查询候选名称；
- 记录 `AVAILABLE`、`ALREADY RESERVED`、`UNKNOWN`、`RATE LIMITED`；
- 按稀缺性、真实单词、品牌感、易记、易读、适用范围和商业价值评分；
- 保留 `NONE`、`GENERIC_BRAND`、`STRONG_BRAND`、`BRAND_ONLY` 商标参考标记；
- 查询结果保存在当前网站的本地缓存中，重复扫描会跳过已有结果；
- 内置 3000 条去重候选词，以真实单词为主，只保留少量有意义组合词；
- 支持导入、编辑和导出自己的 TXT、CSV、JSON 词库；
- 导出完整 CSV 结果，方便本地分析。

## 快速开始

1. 在 Chrome 的 `chrome://extensions` 中打开「开发者模式」，加载本仓库的 `extension` 文件夹；
2. 打开 `https://cloudflare.pay/`，点击右下角 `PayID Scout`；
3. 点击「载入内置词库」或「导入 TXT / CSV / JSON」，编辑候选词后点击「开始逐个查询」。

## 安装和更新

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择仓库中的 `extension` 文件夹。
6. 打开或刷新 `https://cloudflare.pay/`，点击右下角 `PayID Scout`，或点击工具栏中的扩展图标。

如果更新了代码，在扩展管理页点击「重新加载」，再刷新 `cloudflare.pay` 页面。

## 导入和编辑词库

打开 PayID Scout 后：

1. 点击「导入 TXT / CSV / JSON」；
2. 导入后直接在文本框中增删、调整顺序或粘贴新候选；
3. 点击「导出当前词库」可以保存编辑后的纯文本词库；
4. 点击「开始逐个查询」。

支持的格式示例：

```text
cove
silverline
riverstone
```

```json
["cove", "silverline", "riverstone"]
```

JSON 也可以使用对象数组，例如 `[{"word":"cove"}]`。导入时会自动去重，并只保留 2—32 位连续字母或数字。词库只在浏览器本地保存，不会上传到本项目或第三方服务。

## 评分原则

核心原则是：商标不是过滤器，通用价值才是主要排序依据。

单个英文词会优先参考长度、词典意义、读写难度、品牌感、跨行业适用范围和潜在终端使用价值。商标标记只是参考信息，不进入总分；著名品牌关联名称仍然可以进入可用性检测，但最终是否保留由用户决定。

## 隐私和安全

- 扩展只匹配 `https://cloudflare.pay/*`；
- 词库和查询结果使用当前网站的 `localStorage` 保存；
- 不要求账号密码、Cookie 或钱包私钥；
- 不点击 Reserve，不执行注册或购买；
- 品牌标记来自扩展内置的少量参考信号，不进行批量品牌搜索；
- 页面频率限制时应停止扫描并等待，不要连续高速请求。

## 本地开发

项目不需要构建步骤。修改后运行：

```bash
npm run check
```

然后在 `chrome://extensions` 重新加载扩展并刷新页面。

目录结构：

```text
extension/       Chrome 扩展源码和本地词库
assets/          项目宣传素材
docs/            发布和维护教程
.github/         Issue 模板
```

## 开源协议

本项目使用 MIT License。详见 [LICENSE](LICENSE)。欢迎提交问题、改进评分规则或贡献更好的通用词库，但请不要提交公司名单、批量商标清单或自动注册逻辑。

## 免责声明

Cloudflare 页面结构、可用性规则和服务条款可能变化。页面显示 `AVAILABLE` 不等于最终一定可以保留或预订；使用前请自行确认目标服务的最新规则，并自行承担最终操作决定。
