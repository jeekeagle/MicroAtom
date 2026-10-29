# 课序 · Agent 微课制作系统

Windows x64 便携版。系统把讲稿、课件、教师试讲、AI 旁白、介质工坊、成片渲染和 Agent / Skill 调度放在同一条课程生产链上。

## 三步启动

1. 将整个压缩包解压到本机目录，例如 `D:\KEXU`。不要直接在 ZIP 内运行。
2. 双击 `start-kexu.cmd`。保持打开的命令行窗口不要关闭。
3. 浏览器会自动打开 `http://127.0.0.1:8787`。没有自动打开时，手动访问这个地址。

首次使用 AI 生成前，请在系统的“运行设置”中填写模型服务地址、模型名称与 API Key。随包课程数据里的模型地址 `http://127.0.0.1:15721/v1` 只适用于制作者本机，换电脑后必须重填。配置细节见 `docs/05-model-and-tts.md`。

## 环境自检

先启动系统，再双击 `check-env.cmd`。它会检查 Node、内置 Python / edge-tts、FFmpeg、Chrome / Edge、API、模型与 TTS。

命令行诊断也可以直接执行：

```bat
kexu.cmd doctor
kexu.cmd health --json
```

## 目录说明

```text
kexu-portable-win-x64/
  app/                 程序、前端构建产物、Node 依赖
  data/                教师课程、讲稿、课件、录音、成片与介质
  runtime/node/        便携 Node.js
  runtime/python/      便携 Python 与 edge-tts
  runtime/ffmpeg/bin/  FFmpeg / FFprobe
  config/              可选的环境配置模板
  docs/                中文说明
  backups/             数据备份脚本的默认输出目录
  start-kexu.cmd       启动系统
  check-env.cmd        环境诊断
  kexu.cmd             CLI 包装器
  backup-data.cmd      备份课程数据
```

始终备份整个 `data` 目录。API Key 不随发行包提供，也不会被 `backup-data.cmd` 写入备份。

## 三种默认工作流

| 模式 | 适用场景 | 默认路径 |
| --- | --- | --- |
| 全自动 | 只给主题，希望 AI 推进到底 | 主题 -> 讲稿 -> 确认 -> 课件 -> AI 旁白 -> 成片 |
| 口语稿驱动 | 教师先自由讲一遍，系统按语音定位页面 | 口述 -> 转写/对齐 -> 课件 -> 合成 |
| PPT 驱动 | 教师围绕课件试讲并录屏录音 | 讲稿 -> 课件 -> 试讲录制 -> 对齐 -> 成片 |

这些工作流是可配置的，模块、生产引擎和 Skill 也按同样思路解耦。详见 `docs/02-system-and-workflows.md`。

## CLI 与 Agent

先启动 `start-kexu.cmd`，再打开新的命令行窗口执行：

```bat
kexu.cmd projects list
kexu.cmd projects create --topic "为什么天空是蓝色的" --grade 初中 --subject 物理
kexu.cmd run project-xxx --json
kexu.cmd render download project-xxx --out .\course.mp4
```

`kexu.cmd schema --json` 会把全部命令、参数和输入输出契约交给 Agent。Codex 或其他 Agent 可以按“读取 schema -> 查询项目 -> 执行动作 -> 检查状态”的方式驱动系统。详见 `docs/03-cli.md` 和 `docs/04-agent-integration.md`。

## 新电脑的最低要求

- Windows 10 或 Windows 11，x64。
- 已安装 Google Chrome 或 Microsoft Edge。系统用浏览器渲染课件画面与运行浏览器语音识别。
- 使用 edge-tts 时需要联网。
- AI 生成需要一个可访问的 OpenAI 兼容模型服务，或通过系统支持的模型端点接入。
- 不要求预装 Node.js、Python、FFmpeg。

## 数据与端口

- 数据根目录：`<解压目录>\data`。
- 默认端口：`8787`。
- 默认只监听 `127.0.0.1`。需要局域网访问时执行 `npm run start:lan`，详见 `docs/09-lan-access.md`。
- 修改端口：复制 `config\kexu.env.example.cmd` 为 `config\kexu.env.cmd`，取消 `PORT` 一行的注释并修改。

## 文档索引

- `docs/01-quick-start.md`：首次启动与最短操作路径
- `docs/02-system-and-workflows.md`：模块、三种模式、引擎、Skill、介质与交付
- `docs/03-cli.md`：CLI 命令与自动化示例
- `docs/04-agent-integration.md`：Codex / 任意 Agent 接入
- `docs/05-model-and-tts.md`：模型、TTS、浏览器语音识别
- `docs/06-data-migration.md`：换电脑、备份、恢复与升级
- `docs/07-troubleshooting.md`：端口、模型、TTS、MP4、麦克风等问题
- `docs/08-security-and-licenses.md`：密钥、本地服务、第三方许可证
- `docs/09-lan-access.md`：局域网访问、防火墙、局域网录音与 HTTPS 证书

## 结束与移动

关闭 `start-kexu.cmd` 的命令行窗口或按 `Ctrl+C` 即可停止服务。移动系统前先执行 `backup-data.cmd`，再把整个目录复制到新电脑；只迁移课程数据时，复制 `data` 目录即可。

本包不包含私人 API Key。不要把 `data\secrets.json`、`config\kexu.env.cmd` 或含密钥的日志发给他人。
