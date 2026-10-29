# 安全与许可证

## 本地服务

系统默认监听：

```text
http://127.0.0.1:8787
```

`127.0.0.1` 只允许本机访问。不要把该端口直接映射到公网，也不要在没有认证层的情况下改为 `0.0.0.0`。

如果团队需要局域网访问，应在前面增加反向代理、身份认证、访问控制和 HTTPS，而不是直接暴露 Node 服务。

## API Key

Key 可能存在于两个位置：

- `data\secrets.json`：界面保存
- `config\kexu.env.cmd`：环境变量配置

保护要求：

- 不进入版本控制。
- 不放入通用发行包。
- 不通过聊天或截图公开。
- 不写进课程讲稿、Agent 日志或前端代码。
- 换电脑时重新填写，而不是复制整个含密钥目录给他人。

## 教师与学生数据

`data` 可能包含：

- 教师姓名与学校
- 教学记忆
- 课程讲稿
- 教师声音与试讲视频
- 学生学情描述

备份、共享和删除都应按真实教学数据管理。对外发送前先移除不必要的个人信息。

## 发行包内容

正式包不应包含：

- `data\secrets.json`
- `data\ui-check`
- `data\shot-test`
- `data\tts-test`
- 浏览器临时目录
- 私人日志

构建脚本按这些规则排除测试目录和密钥。

## 校验

发行目录中的 `SHA256SUMS.txt` 包含 ZIP 的 SHA-256。复制到新电脑后可校验：

```powershell
Get-FileHash .\kexu-portable-win-x64-*.zip -Algorithm SHA256
```

与文件中的值一致后再解压。

## 第三方组件

发行包包含：

- Node.js
- Python embeddable
- edge-tts 与其依赖
- FFmpeg / FFprobe

对应许可证随包放在 `licenses` 目录或运行时目录中。使用与再分发时应遵守各自许可证。

### FFmpeg

FFmpeg 是独立开源项目：

- 官网：https://ffmpeg.org/
- 法律信息：https://ffmpeg.org/legal.html
- 源码：https://ffmpeg.org/download.html#get-sources

当前随包的 FFmpeg 构建包含 `--enable-gpl`。如果将包含该二进制的包对外分发，需要遵守 GNU GPL 的相应义务，包括提供对应源码或有效的书面提供方式。`licenses\FFmpeg-NOTICE.txt` 是提示文件，不替代许可证正文。

### Node.js

Node.js 使用 MIT 风格许可证，详见 `licenses\Node.js-LICENSE.txt`。

### Python

Python 使用 PSF License，随 embedded 包保留 Python 自带许可文件。

### edge-tts

edge-tts 及其 Python 依赖保留各自包元数据与许可证。它们通过在线服务合成语音，使用时还需遵守服务提供方的条款。

## 不要公开分发私人课程包

“程序发行包”和“教师课程数据包”是两类东西：

- 程序发行包可以给团队安装。
- 课程数据包含教师内容、声音与学校信息，只应发给授权人员。

`backup-data.cmd` 生成的是课程数据包，默认不含 Key，但仍可能含个人信息。
