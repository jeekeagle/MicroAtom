# Codex 与任意 Agent 接入

## 接入原则

Agent 不需要理解前端实现，也不需要直接改 `data\store.json`。统一通过 `kexu.cmd` 调用本地 API。

这样得到三个好处：

- 所有写操作经过服务端校验。
- Agent 可以使用稳定的 JSON 契约。
- 人类界面和 Agent 看到的是同一条课程生产链。

## 启动顺序

1. 双击 `start-kexu.cmd`。
2. Agent 执行 `kexu.cmd doctor --json`。
3. 确认 `ok` 为 `true`。
4. 读取 `kexu.cmd schema --json` 获取能力清单。
5. 开始查询或创建课程。

## 给 Codex 的系统提示

可以把下面这段作为任务上下文：

```text
你在操作本机的课序微课制作系统。
工作目录：D:\KEXU\kexu-portable-win-x64
唯一操作入口：.\kexu.cmd

规则：
1. 先运行 .\kexu.cmd health --json，失败时停止。
2. 需要不确定命令时运行 .\kexu.cmd schema --json，不要猜参数。
3. 所有自动化调用都加 --json。
4. 创建课程后保存返回的 project id，不要从文本表格推断。
5. 写讲稿、课件或录音前先读取当前项目状态。
6. 渲染可能耗时，使用 render start --wait 或 render wait。
7. 不修改 data\store.json，不删除用户课程，不重置系统。
8. 失败时报告 stderr、退出码和 API 错误，不要静默重试破坏性操作。
```

## 推荐 Agent 循环

```text
health
  -> projects list --json
  -> projects create ... --json
  -> script generate <id> --json
  -> script show <id> --json
  -> 人工确认或 Agent 提交修改意见
  -> script save
  -> script confirm
  -> slides generate
  -> audio tts 或等待教师录音
  -> render start --wait
  -> render download
  -> render publish
```

如果是口语稿或 PPT 模式，Agent 应停在“等待教师录音”，不要伪造录音或跳过验证。

## 命令规格

`schema --json` 的顶层结构包含：

```json
{
  "name": "kexu",
  "version": "0.1.0",
  "baseUrl": "http://127.0.0.1:8787",
  "environment": [],
  "commands": []
}
```

每个命令包含：

- `path`
- `summary`
- `args`
- `options`
- `api`
- `examples`

Agent 应先按 `path` 查找命令，再按 `options` 组装参数。

## JSON 与退出码

```bat
kexu.cmd projects list --json
```

成功：

```text
exit code 0
stdout: JSON
stderr: 可选进度
```

参数错误：

```text
exit code 2
```

运行错误：

```text
exit code 1
```

自动化时应同时检查退出码与 JSON 中的错误字段。

## 安全边界

- 本地 API 只监听 `127.0.0.1`。
- 没有面向公网的登录层，不要把端口映射到公网。
- Agent 不得把 API Key 写入日志、课程内容或提交到仓库。
- `--json` 输出可能包含课程内容，分享日志前先检查。
- 批量删除课程或重置数据不属于默认 Agent 操作。

## 支持其他 Agent 的方式

任何能执行命令的 Agent 都可以接入：

- Claude Code / 其他 CLI Agent
- 自建 Python / Node 调度器
- n8n、Dify、Coze 等支持本地命令或 HTTP 的编排器
- 教室内的批处理脚本

最小接入只需要三件事：

```text
kexu.cmd health --json
kexu.cmd schema --json
kexu.cmd <command> --json
```
