# 发布前教程

这份清单适用于把 PayID Scout 发布到公开 GitHub 仓库前的最后检查。

## 1. 本地检查

```bash
npm run check
git diff --check
```

确认 `extension/manifest.json` 的版本号与 README 描述一致，并确认 `extension/word-bank.js` 已经被 manifest 在 `candidate-data.js` 之前加载。

## 2. 手动验证

在 Chrome 中加载 `extension` 文件夹，打开 `https://cloudflare.pay/`：

1. 点击扩展按钮，确认面板出现；
2. 点击「载入内置词库」，确认候选词可以直接编辑；
3. 导入一个 TXT、CSV 或 JSON 文件，确认文本框内容被去重；
4. 使用 1—2 个测试名称查询，确认结果写入本地；
5. 再次查询同一批名称，确认显示「没有重复查询」；
6. 导出 CSV，确认包含评分、商标标记、页面状态和查询时间；
7. 点击停止或关闭面板，确认不会触发 Reserve。

## 3. GitHub 发布

1. 创建公开仓库，例如 `payid-scout`；
2. 推送源码、README、LICENSE、CONTRIBUTING 和 SECURITY；
3. 在仓库首页检查宣传图、安装步骤和免责声明是否正常显示；
4. 创建第一个 Release，版本号与 manifest 保持一致；
5. 在 Release 说明中注明这是本地运行的 Chrome 扩展，不是官方 Cloudflare 产品。

## 4. 发布后维护

- 页面结构变化时优先更新选择器和状态识别；
- 发现频率限制时降低默认查询速度；
- 词库更新必须保持去重并重新运行 `npm run check`；
- 不加入自动注册、绕过限制或批量品牌检索功能。
