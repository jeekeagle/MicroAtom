import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const apiBase = 'http://127.0.0.1:8787';
const ffprobe = 'C:\\Users\\wyg\\AppData\\Roaming\\LobsterAI\\huashu-motion\\tools\\ffmpeg\\bin\\ffprobe.exe';
const ffmpeg = 'C:\\Users\\wyg\\AppData\\Roaming\\LobsterAI\\huashu-motion\\tools\\ffmpeg\\bin\\ffmpeg.exe';

async function request(url, options = {}) {
  const response = await fetch(`${apiBase}${url}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} -> ${response.status}: ${text}`);
  }
  return payload;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${command} exited ${code}`));
    });
    child.on('error', reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
let projectId = '';

try {
  const project = await request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: '系统验收：水循环',
      topic: '水循环',
      subject: '地理',
      grade: '七年级',
      durationMinutes: 3,
      mode: 'auto',
      idea: '从一杯水放几天变少切入，追问水去了哪里，再建立蒸发、凝结、降水、径流的循环模型。',
      valueGuide: '用证据解释现象，理解自然系统的相互联系',
      learnerProfile: '已经知道水的三态变化，但容易把水循环记成四个孤立名词。',
      style: '清晰、口语化、问题驱动'
    })
  });
  projectId = project.id;
  console.log('project', project.id);

  const generated = await request(`/api/projects/${projectId}/script/generate`, {
    method: 'POST',
    body: JSON.stringify({
      topic: '水循环',
      idea: '从一杯水放几天变少切入，追问水去了哪里，再建立蒸发、凝结、降水、径流的循环模型。',
      valueGuide: '用证据解释现象，理解自然系统的相互联系',
      learnerProfile: '已经知道水的三态变化，但容易把水循环记成四个孤立名词。',
      subject: '地理',
      grade: '七年级',
      durationMinutes: 3,
      style: '清晰、口语化、问题驱动'
    })
  });
  if (!generated.project?.script?.sections?.length) throw new Error('script not generated');
  console.log('script', generated.project.script.sections.length, 'sections');

  const confirmed = await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'confirm-script' })
  });
  if (!confirmed.script?.confirmed) throw new Error('script not confirmed');

  const withSlides = await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'generate-slides' })
  });
  if (!withSlides.slides?.length) throw new Error('slides not generated');
  console.log('slides', withSlides.slides.length);

  const withTts = await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'generate-tts' })
  });
  const tts = withTts.recordings?.find((asset) => asset.kind === 'tts');
  if (!tts?.audioUrl) throw new Error('TTS asset missing');
  console.log('tts', tts.source, tts.durationSeconds, tts.audioUrl);

  const ttsPath = path.resolve('data', 'media', tts.audioUrl.replace(/^\/media\//, ''));
  if (!fs.existsSync(ttsPath)) throw new Error(`TTS file missing: ${ttsPath}`);
  const ttsProbe = JSON.parse(
    (
      await run(ffprobe, [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size:stream=codec_type,codec_name,sample_rate,channels',
        '-of',
        'json',
        ttsPath
      ])
    ).stdout
  );
  console.log('tts probe', JSON.stringify(ttsProbe));

  await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'enter-render' })
  });
  const renderStart = await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'assemble', audioAssetId: tts.id })
  });
  if (renderStart.render?.status !== 'running') {
    throw new Error(`assemble did not enter running: ${JSON.stringify(renderStart.render)}`);
  }

  let current = renderStart;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(2000);
    current = await request(`/api/projects/${projectId}`);
    console.log('render', current.render?.status, current.render?.progress, current.render?.stageMessage ?? '');
    if (current.render?.status === 'done' || current.render?.status === 'error') break;
  }
  if (current.render?.status !== 'done') {
    throw new Error(`render failed: ${JSON.stringify(current.render)}`);
  }

  const videoPath = path.resolve('data', 'media', projectId, 'render', 'course.mp4');
  if (!fs.existsSync(videoPath)) throw new Error(`video missing: ${videoPath}`);
  const videoProbe = JSON.parse(
    (
      await run(ffprobe, [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size,format_name:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
        '-of',
        'json',
        videoPath
      ])
    ).stdout
  );
  const volume = await run(ffmpeg, ['-hide_banner', '-i', videoPath, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', 'NUL']);
  const mean = volume.stderr.match(/mean_volume:\s*([-\d.]+) dB/)?.[1];
  const max = volume.stderr.match(/max_volume:\s*([-\d.]+) dB/)?.[1];
  console.log('video probe', JSON.stringify(videoProbe));
  console.log('audio levels', { mean, max });

  const download = await fetch(`${apiBase}${current.render.downloadUrl}`);
  if (download.status !== 200) throw new Error(`download failed ${download.status}`);
  const range = await fetch(`${apiBase}${current.render.downloadUrl}`, {
    headers: { range: 'bytes=0-1023' }
  });
  if (range.status !== 206) throw new Error(`range request returned ${range.status}`);
  console.log('download', download.status, download.headers.get('content-type'), range.status);

  const published = await request(`/api/projects/${projectId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action: 'publish' })
  });
  if (published.status !== 'done') throw new Error('publish failed');

  const streams = videoProbe.streams ?? [];
  const hasVideo = streams.some((stream) => stream.codec_type === 'video' && stream.width === 1920 && stream.height === 1080);
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
  if (!hasVideo || !hasAudio) throw new Error('video/audio stream missing');
  if (!mean || Number(mean) < -50) throw new Error(`audio track appears silent: mean ${mean}`);

  console.log(
    JSON.stringify({
      ok: true,
      projectId,
      sections: generated.project.script.sections.length,
      slides: withSlides.slides.length,
      ttsSource: tts.source,
      durationSeconds: current.render.durationSeconds,
      sizeBytes: current.render.sizeBytes,
      meanVolume: mean,
      maxVolume: max,
      elapsedSeconds: Math.round((Date.now() - started) / 1000)
    })
  );
} catch (error) {
  console.error('SMOKE_FAILED', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (projectId && process.env.KEEP_SMOKE_PROJECT !== '1') {
    await fetch(`${apiBase}/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    console.log('deleted', projectId);
  }
}
