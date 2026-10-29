# 模型与 TTS 配置

## 模型服务

系统支持 OpenAI 兼容的 Chat Completions 和 Responses 协议。推荐在“运行设置”中配置，也可以使用环境变量。

### 发行包中的既有设置

本发行包携带了制作者原来的课程数据，其中模型地址是：

```text
http://127.0.0.1:15721/v1
```

这是制作者本机的模型网关，换一台电脑后通常不可用。新电脑第一次启动时，请进入“运行设置”把它改成：

- 新电脑上可访问的 OpenAI 兼容服务地址；
- 或者在新电脑上启动同样的本地模型网关，并保留这个地址。

修改后点“测试连接”，再运行 `kexu.cmd model test`。只改 API Key 而保留旧地址，模型仍然连不上。

环境变量：

```text
KEXU_MODEL_BASE_URL
KEXU_MODEL_NAME
KEXU_MODEL_PROTOCOL       chat 或 responses
KEXU_MODEL_API_KEY
KEXU_MODEL_TIMEOUT_MS
```

示例 `config\kexu.env.cmd`：

```bat
@echo off
set "KEXU_MODEL_BASE_URL=https://your-model-service.example/v1"
set "KEXU_MODEL_NAME=your-model-name"
set "KEXU_MODEL_PROTOCOL=chat"
set "KEXU_MODEL_API_KEY=YOUR_KEY"
set "KEXU_MODEL_TIMEOUT_MS=120000"
```

环境变量优先于界面设置。若调试时发现界面修改“不生效”，先检查 `config\kexu.env.cmd` 是否设置了同名变量。

## API Key

通过界面保存的 Key 会写入：

```text
data\secrets.json
```

该文件不进入发行包，也不进入 `backup-data.cmd` 生成的备份。换电脑后需要重新填写。

检查模型连通性：

```bat
kexu.cmd model test
kexu.cmd doctor
```

## 地址规则

模型地址可以填写：

```text
https://service.example/v1
https://service.example/v1/chat/completions
https://service.example/v1/responses
```

系统会去掉末尾的 `/chat/completions` 或 `/responses`，再按协议拼接请求路径。

地址必须以 `http://` 或 `https://` 开头。

## 模型不可用时

如果模型服务不可达：

- 部分讲稿与结构可以走本地兜底。
- 复杂分析、课件生成、Skill 运行和介质生成会失败。
- 成片仍可使用已有讲稿、课件和录音完成。

不要用本地兜底结果冒充完整 AI 生成结果。正式制作前先运行 `model test`。

## AI 旁白

便携包自带 Python 3.12 与 edge-tts 7.3.1。

使用条件：

- 能够访问 edge-tts 依赖的在线语音服务。
- 系统端口正常。
- 讲稿已经生成并确认。

默认音色：

```text
zh-CN-XiaoxiaoNeural  晓晓 · 温暖女声
zh-CN-XiaoyiNeural    晓伊 · 清亮女声
zh-CN-YunxiNeural     云希 · 沉稳男声
zh-CN-YunjianNeural   云健 · 叙述男声
zh-CN-YunyangNeural   云扬 · 新闻男声
```

修改音色：

```bat
kexu.cmd settings update --tts-voice zh-CN-YunxiNeural
kexu.cmd settings update --tts-rate -5
```

`tts-rate` 是百分比。负值更慢，正值更快。

## 语音失败与 SAPI 兜底

edge-tts 不可用或网络失败时，Windows 版本会尝试系统 SAPI 语音。SAPI 音色取决于新电脑安装的中文语音包，质量通常低于 edge-tts。

如果两条路径都失败，改用教师试讲录音。

## 教师试讲与语音识别

教师试讲使用浏览器麦克风录制。语音转写与页面定位依赖浏览器能力或服务端对齐逻辑。

需要：

- Chrome 或 Edge。
- 麦克风权限。
- 页面保持在前台。
- 试讲过程中不要刷新。

翻页事件会与音频时间线一起保存，用于后续合成。

## Chrome 与 Edge

系统优先使用 Chrome，其次使用 Edge。自动查找路径：

```text
C:\Program Files\Google\Chrome\Application\chrome.exe
C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
C:\Program Files\Microsoft\Edge\Application\msedge.exe
```

自定义：

```bat
set "CHROME_PATH=D:\Browsers\Chrome\chrome.exe"
```

浏览器既用于教师在界面中操作，也用于服务端渲染课件截图。只安装 Firefox 不足以完成成片渲染。
