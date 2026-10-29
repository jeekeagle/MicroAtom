# 故障排查

## 先做这三步

1. 保持 `start-kexu.cmd` 窗口打开，查看是否有红色错误。
2. 运行 `check-env.cmd`。
3. 运行：

```bat
kexu.cmd doctor --json
```

## 页面打不开

### 浏览器没有自动打开

手动访问：

```text
http://127.0.0.1:8787
```

### 端口被占用

启动窗口出现 `EADDRINUSE` 表示 8787 已被占用。

处理：

1. 关闭旧的课序窗口。
2. 或修改端口：

```bat
set "PORT=8790"
set "KEXU_BASE_URL=http://127.0.0.1:8790"
start-kexu.cmd
```

然后访问 `http://127.0.0.1:8790`。

### 窗口一闪而过

在文件资源管理器地址栏输入 `cmd` 回车，再执行：

```bat
start-kexu.cmd
```

这样错误会留在窗口中。

## API 在线但模型不可用

运行：

```bat
kexu.cmd settings show
kexu.cmd model test
```

检查：

- 模型地址是否多写了路径
- 协议是否选错
- API Key 是否有效
- 新电脑能否访问该模型服务
- 是否设置了两套配置导致环境变量覆盖界面

## TTS 失败

先测试内置 Python：

```bat
runtime\python\python.exe -c "import importlib.metadata as m; print(m.version('edge-tts'))"
```

应输出 `7.3.1`。

再测试网络与语音服务。若 edge-tts 持续失败，系统可能使用 Windows SAPI 兜底。SAPI 没有合适中文音色时，直接使用教师试讲录音。

常见原因：

- 新电脑无法访问在线语音服务
- 代理或防火墙阻断
- 音频目录没有写入权限
- 讲稿为空

## MP4 无法播放

先确认文件完整：

```bat
runtime\ffmpeg\bin\ffprobe.exe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type -of json "路径\course.mp4"
```

正常情况下应看到：

- 一个视频流
- 一个音频流
- 时长大于 0
- 文件大小大于 0
- 视频流与音频流时长基本一致（差值在 1 秒内）

若视频流是 H.264、音频流是 AAC，Windows 自带播放器、Chrome、Edge、VLC 通常都能播放。

处理顺序：

1. 重新下载 MP4，排除下载中断。
2. 检查文件大小是否为 0 或只有几 KB。
3. 用 VLC 打开。
4. 查看渲染窗口和服务窗口中的 FFmpeg 错误。
5. 运行 `check-env.cmd` 确认 FFmpeg 可用。
6. 重新渲染。

如果旧课程是在修复前生成，重新渲染一次。

## 渲染很慢或卡住

- 渲染会启动 Chrome 和 FFmpeg，CPU 占用升高是正常的。
- 课程越长、页面越多，耗时越长。
- 不要在渲染时关闭服务窗口。
- 用 `kexu.cmd render status <id>` 查看进度。
- 超过预期时可增加等待时间：

```bat
kexu.cmd render start <id> --wait --wait-timeout 3600
```

## 课件截图失败

确认 Chrome 或 Edge 已安装：

```bat
where chrome
where msedge
```

也可以设置：

```bat
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
```

然后重启系统。

## 教师画面没有录制

先确认系统级开关：在“运行设置 → 生产环境”打开“试讲时录制教师画面”。开关关闭时，试讲台不会出现画面预览。

打开后仍然没有画面，按顺序检查：

1. 试讲台右下角是否出现画面预览。没有预览说明浏览器没有拿到摄像头。
2. 浏览器地址栏的摄像头权限是否允许。
3. 其他软件是否占用了摄像头。
4. 局域网访问时，普通 HTTP 页面拿不到摄像头和麦克风，必须使用 HTTPS 地址（端口 8788）并信任本机证书。

试讲过程中点画面预览右上角的小按钮可以临时关闭画面，本次只保存声音，不影响已经录好的音频。

### 摄像头能打开但没有画面

试讲台右下角出现“摄像头没有画面”时，说明浏览器拿到了摄像头权限，但设备没有真正输出画面。按顺序检查：

1. 是否有别的程序正在占用摄像头（会议软件、录制工具、另一个浏览器标签页）。
2. Windows 设置 → 隐私和安全性 → 摄像头里，当前桌面应用是否被允许。
3. 设备管理器里摄像头是否被禁用。
4. 换用另一台摄像头或用系统自带相机应用确认设备本身正常。

画面恢复后重新进入试讲台即可。也可以点画面右上角的小按钮关闭画面，本次只保存声音。

## 麦克风不可用

- 检查 Windows 隐私设置中的麦克风权限。
- 浏览器地址栏的麦克风权限改为允许。
- 确认输入设备不是禁用状态。
- 关闭占用麦克风的其他软件。
- 使用 Chrome 或 Edge，不建议使用内置 WebView。

## 教师试讲后没有对齐

检查：

- 录音是否存在
- 转写文本是否为空
- 翻页事件是否记录
- 课程是否有课件页面

在声音与录制模块查看录音、转写与对齐状态。必要时重新试讲。

## 中文路径与权限

系统支持中文路径，但为减少第三方进程问题，建议解压到：

```text
D:\KEXU
```

不要把程序放在 `C:\Program Files` 下直接运行。该目录通常需要管理员权限，媒体写入会失败。

## Windows 阻止 ZIP 文件

如果解压后的 `.cmd` 无法运行：

1. 右键 ZIP 文件。
2. 属性。
3. 勾选“解除锁定”。
4. 重新解压。

## 数据损坏

先关闭系统，复制一份 `data` 留存，再尝试：

- 从最近的 `backups` 恢复
- 检查 `data\store.json` 是否为有效 JSON
- 检查 `data\media` 是否完整

不要在生产目录中直接编辑 `store.json`。优先通过界面或 CLI 修改。

## 收集诊断信息

反馈问题时提供：

- `check-env.cmd` 输出
- `kexu.cmd doctor --json` 输出
- 服务窗口最后 30 行
- 课程 ID 与出问题的环节
- MP4 的 `ffprobe` 输出
- 操作系统版本与 Chrome / Edge 版本

不要附带 API Key 或 `data\secrets.json`。
