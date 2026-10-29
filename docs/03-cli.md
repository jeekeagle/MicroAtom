# CLI 使用

## 前提

CLI 通过本地 API 工作。先双击 `start-kexu.cmd`，再打开新的命令行窗口：

```bat
cd /d D:\KEXU\kexu-portable-win-x64
kexu.cmd health
```

不要关闭服务窗口。

## 帮助与自描述

```bat
kexu.cmd --help
kexu.cmd schema --json
kexu.cmd doctor --json
```

`schema --json` 是给 Agent 的完整命令规格。它包含命令、参数、选项、API 映射与示例。

## 全局约定

- `--json`：stdout 只输出 JSON，进度信息写入 stderr。
- `--quiet`：抑制进度信息。
- `--base-url`：覆盖 API 地址，默认 `http://127.0.0.1:8787`。
- `KEXU_BASE_URL`：环境变量形式的 API 地址。
- `KEXU_JSON=1`：强制 JSON 输出。
- `KEXU_QUIET=1`：强制安静模式。
- 退出码：`0` 成功，`1` 运行错误，`2` 参数错误。

## 常用命令

### 项目

```bat
kexu.cmd projects list
kexu.cmd projects list --json
kexu.cmd projects show project-xxx
kexu.cmd projects create --topic "杠杆原理" --grade 初中 --subject 物理 --mode ppt
kexu.cmd projects advance project-xxx
```

新建课程的关键参数：

```text
--topic            课程主题
--title            课程标题
--subject          学科
--grade            学段
--duration         时长，分钟
--mode             auto / oral / ppt
--idea             想法草稿
--idea-file        从文件读取想法，- 表示 stdin
--value-guide      价值引领
--learner-profile  学情说明
--style            表达风格
```

### 讲稿

```bat
kexu.cmd script show project-xxx
kexu.cmd script generate project-xxx
kexu.cmd script save project-xxx --file script.json
kexu.cmd script confirm project-xxx
kexu.cmd script comment project-xxx --note "开场再口语一些"
kexu.cmd script comments project-xxx
```

带段落与引用：

```bat
kexu.cmd script comment project-xxx --section section-2 --quote "原文片段" --note "换一个更贴近学情的例子"
```

`script save` 接受讲稿 JSON。推荐先用 `script show --json` 获取当前结构，修改后再保存。

### 课件

```bat
kexu.cmd slides list project-xxx
kexu.cmd slides generate project-xxx
kexu.cmd slides update project-xxx slide-xxx --file slide.json
```

### 声音与录音

```bat
kexu.cmd audio list project-xxx
kexu.cmd audio tts project-xxx
kexu.cmd audio upload project-xxx --file take.webm --transcript "转写文本"
kexu.cmd audio transcript project-xxx rec-xxx --file transcript.json
```

上传录音时可以同时提交翻页事件：

```bat
kexu.cmd audio upload project-xxx --file take.webm --events events.json
```

`events.json` 是翻页事件数组，具体字段可通过 `kexu.cmd schema --json` 查看 `audio upload` 与 API 契约。

### 渲染与下载

```bat
kexu.cmd render start project-xxx --wait
kexu.cmd render status project-xxx
kexu.cmd render wait project-xxx
kexu.cmd render download project-xxx --out .\course.mp4
kexu.cmd render publish project-xxx
```

长时间渲染建议使用 `--wait-timeout 3600`。

### Agent 与 Skill

```bat
kexu.cmd agents list
kexu.cmd agents show agent-xxx
kexu.cmd agents run agent-xxx --input "分析这段讲稿"
kexu.cmd skills list
kexu.cmd skills show skill-xxx
kexu.cmd skills run skill-xxx --input "讲稿内容"
```

### 设置与模型

```bat
kexu.cmd settings show
kexu.cmd settings update --tts-voice zh-CN-YunxiNeural
kexu.cmd model test
```

写入 Key 时优先使用界面，避免命令历史泄露：

```bat
kexu.cmd settings update --api-key "YOUR_KEY"
```

## 一键推进

```bat
kexu.cmd run project-xxx --json
kexu.cmd run project-xxx --until slides
kexu.cmd run project-xxx --skip-audio --publish
```

`run` 会按工作流寻找下一个未完成动作。口语稿或 PPT 模式在缺少教师录音时会停在等待录音的状态。

## PowerShell 自动化示例

```powershell
$env:KEXU_BASE_URL = 'http://127.0.0.1:8787'

$project = (& .\kexu.cmd projects create --topic '光合作用的能量转换' --grade 初中 --subject 生物 --mode auto --json | ConvertFrom-Json)
$id = $project.id

& .\kexu.cmd run $id --json
if ($LASTEXITCODE -ne 0) { throw 'Course production failed.' }

& .\kexu.cmd render download $id --out ".\$id.mp4" --json
```

## 机器可读输出

Agent 应以 `--json` 调用，并读取：

- `id`：项目或资源 ID
- `stage`：当前生产阶段
- `status`：项目状态
- `render`：渲染信息
- `delivery`：交付包信息
- `error`：错误信息

不要从人类可读表格中解析 ID。
