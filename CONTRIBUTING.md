# 贡献职业 Mod

这个项目靠真实从业者把自己的岗位经验做成可玩的职业 Mod。

## 投稿方式

1. Fork 仓库。
2. 从 `templates/mod-template/` 复制一份到 `career-mods/{your-mod-id}/`。
3. 按 `docs/职业Mod规范说明.md` 补完整。
4. 运行校验：

```bash
npm run validate:mods
```

5. 本地试玩：

```bash
npm start
```

6. 提交 Pull Request。

## Mod 命名

目录名和 `mod.json` 的 `id` 必须一致，使用小写英文和连字符。

推荐：

```text
automotive-quality-engineer
mechanical-designer
supplier-quality-engineer
production-supervisor
```

不推荐：

```text
mechanical
engineer
job-001
my-mod
```

## 质量标准

一个可合并的 Mod 至少需要：

- 具体岗位，不是泛行业。
- 3 个以上有目标和压力的 NPC。
- 1 条可玩的主线任务。
- 5 个以上能推动剧情的事件。
- 4 个以上评分维度。
- 清晰的系统提示词。
- 已脱敏，没有真实公司、客户、供应商、同事和商业机密。

## PR 说明模板

```text
Mod 名称：
职业岗位：
作者从业背景：
主要玩法：
已脱敏内容：
本地校验结果：
希望别人重点反馈：
```

## 不会合并的内容

- 真实客户、供应商、公司内部资料。
- 真实报价、图纸、工艺参数、合同、邮件、聊天记录。
- 违法、危险或误导性操作指导。
- 只像职业百科，没有玩家行动和后果。
- 过度营销、引流或广告内容。
