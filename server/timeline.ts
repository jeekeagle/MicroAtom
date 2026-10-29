import type {
  CourseProject,
  CourseSlide,
  CourseTimeline,
  RecordingAsset,
  ScriptSection,
  TimelineShot
} from '../src/types';

export const DEFAULT_LEAD_IN = 2.0;
export const DEFAULT_LEAD_OUT = 2.0;
export const MIN_SHOT_DURATION = 2.5;

export interface BuildTimelineOptions {
  leadInSeconds?: number;
  leadOutSeconds?: number;
  minShotSeconds?: number;
}

const toMs = (seconds: number) => Math.max(0, Math.round((Number(seconds) || 0) * 1000));
const toSeconds = (value: number) => Number((value / 1000).toFixed(3));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const defaultSlideSeconds = (slide: CourseSlide) => {
  if (slide.layout === 'cover') return 4;
  if (slide.layout === 'objectives') return 5;
  if (slide.layout === 'quote' || slide.layout === 'summary') return 5;
  return 7;
};

const slideWeight = (slide: CourseSlide) =>
  Number.isFinite(slide.seconds) && slide.seconds > 0 ? slide.seconds : defaultSlideSeconds(slide);

/**
 * Split an exact integer duration across weights without losing a millisecond.
 * The largest remainder method keeps results stable for identical inputs.
 */
function allocate(totalMs: number, weights: number[]): number[] {
  const count = weights.length;
  if (!count) return [];
  if (totalMs <= 0) return new Array(count).fill(0);
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 1));
  const sum = safe.reduce((acc, value) => acc + value, 0);
  const quota = safe.map((weight) => (weight / sum) * totalMs);
  const parts = quota.map((value) => Math.floor(value));
  let rest = totalMs - parts.reduce((acc, value) => acc + value, 0);
  const order = quota
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (rest > 0) {
    parts[order[cursor % order.length].index] += 1;
    cursor += 1;
    rest -= 1;
  }
  return parts;
}

interface RegionPlan {
  durations: number[];
  exact: boolean;
}

/**
 * A recorded rehearsal already contains the teacher's real page turns. Those
 * timestamps are more trustworthy than estimating slide boundaries from the
 * transcript, so they drive the measured timeline directly.
 */
function buildTrialTimeline(
  slides: CourseSlide[],
  audioAsset: RecordingAsset,
  audioMs: number,
  warnings: string[]
): CourseTimeline | null {
  const slideById = new Map(slides.map((slide) => [slide.id, slide]));
  const visits: Array<{ slide: CourseSlide; at: number }> = [];
  const ordered = [...(audioAsset.slideEvents ?? [])].sort((a, b) => a.atSeconds - b.atSeconds);

  for (const event of ordered) {
    const slide = slideById.get(event.slideId);
    if (!slide || !Number.isFinite(event.atSeconds)) continue;
    const at = clamp(Math.round(event.atSeconds * 1000), 0, audioMs);
    const last = visits[visits.length - 1];
    if (!last) {
      visits.push({ slide, at: 0 });
      continue;
    }
    if (last.slide.id === slide.id) continue;
    if (audioMs - at < 200) continue;
    visits.push({ slide, at: Math.max(at, last.at + 200) });
  }

  if (!visits.length || audioMs <= 0) return null;

  const shots: TimelineShot[] = visits.map((visit, index) => {
    const end = index + 1 < visits.length ? visits[index + 1].at : audioMs;
    return {
      slideId: visit.slide.id,
      slideOrder: visit.slide.order,
      slideTitle: visit.slide.title,
      layout: visit.slide.layout,
      sectionId: visit.slide.sectionId,
      startSeconds: toSeconds(visit.at),
      endSeconds: toSeconds(end),
      durationSeconds: toSeconds(end - visit.at),
      audioRole: index === 0 ? 'intro' : 'narration'
    };
  });

  const unshown = slides.filter(
    (slide) => !visits.some((visit) => visit.slide.id === slide.id)
  );
  if (unshown.length) {
    warnings.push(`试讲中有 ${unshown.length} 页课件没有翻到，这些页面不会进入成片`);
  }

  return {
    shots,
    totalSeconds: toSeconds(audioMs),
    audioDuration: toSeconds(audioMs),
    leadInSeconds: 0,
    leadOutSeconds: 0,
    audioMode: 'teacher',
    method: 'measured',
    warnings,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Convert recorded timestamps into contiguous section durations that cover
 * exactly [spanStart, spanEnd]. Gaps are absorbed by the previous section so
 * the picture never jumps or leaves an unfilled hole.
 */
function planRegions(
  sections: ScriptSection[],
  segments: Array<{ sectionId: string; start: number; end: number }>,
  spanStart: number,
  spanEnd: number
): RegionPlan {
  const span = spanEnd - spanStart;
  if (span <= 0 || !sections.length) return { durations: [], exact: false };
  const byId = new Map(segments.map((segment) => [segment.sectionId, segment]));
  const allPresent = sections.every((section) => byId.has(section.id));

  if (allPresent) {
    const boundaries: Array<{ start: number; end: number }> = [];
    let cursor = spanStart;
    for (let index = 0; index < sections.length; index += 1) {
      const segment = byId.get(sections[index].id)!;
      const start = Math.max(cursor, Math.min(segment.start, spanEnd));
      const end = Math.max(start, Math.min(segment.end, spanEnd));
      boundaries.push({ start, end });
      cursor = end;
    }
    for (let index = 1; index < boundaries.length; index += 1) {
      if (boundaries[index].start > boundaries[index - 1].end) {
        boundaries[index - 1].end = boundaries[index].start;
      }
    }
    boundaries[0].start = spanStart;
    boundaries[boundaries.length - 1].end = spanEnd;
    const durations = boundaries.map((item) => Math.max(0, item.end - item.start));
    const total = durations.reduce((acc, value) => acc + value, 0);
    if (total > 0) {
      durations[durations.length - 1] += span - total;
      return { durations, exact: durations.every((value) => value >= 0) };
    }
  }

  const weights = sections.map((section) => {
    const segment = byId.get(section.id);
    if (segment && segment.end > segment.start) return segment.end - segment.start;
    return Math.max(1000, toMs(section.durationSeconds || 30));
  });
  return { durations: allocate(span, weights), exact: false };
}

function fallbackSections(project: CourseProject, contentSlides: CourseSlide[]): ScriptSection[] {
  const fromScript = [...(project.script?.sections ?? [])].sort((a, b) => a.order - b.order);
  const known = new Set(fromScript.map((section) => section.id));
  const orphans: ScriptSection[] = [];
  for (const slide of contentSlides) {
    if (known.has(slide.sectionId)) continue;
    known.add(slide.sectionId);
    orphans.push({
      id: slide.sectionId || `slide-section-${slide.order}`,
      order: fromScript.length + orphans.length + 1,
      role: 'body',
      title: slide.title,
      purpose: '',
      narration: '',
      slideBrief: '',
      valueNote: '',
      durationSeconds: slideWeight(slide)
    });
  }
  if (fromScript.length) return [...fromScript, ...orphans];
  return contentSlides.map((slide, index) => ({
    id: slide.sectionId || `slide-section-${index + 1}`,
    order: index + 1,
    role: 'body',
    title: slide.title,
    purpose: '',
    narration: '',
    slideBrief: '',
    valueNote: '',
    durationSeconds: slideWeight(slide)
  }));
}

function buildShots(
  introSlides: CourseSlide[],
  outroSlides: CourseSlide[],
  sections: ScriptSection[],
  contentSlides: CourseSlide[],
  introMs: number,
  sectionMs: number[],
  outroMs: number
): { shots: TimelineShot[]; warnings: string[] } {
  const warnings: string[] = [];
  const shots: TimelineShot[] = [];
  let cursor = 0;

  const push = (slide: CourseSlide, durationMs: number, role: TimelineShot['audioRole']) => {
    const duration = Math.max(0, Math.round(durationMs));
    if (duration <= 0) return;
    shots.push({
      slideId: slide.id,
      slideOrder: slide.order,
      slideTitle: slide.title,
      layout: slide.layout,
      sectionId: slide.sectionId,
      startSeconds: toSeconds(cursor),
      endSeconds: toSeconds(cursor + duration),
      durationSeconds: toSeconds(duration),
      audioRole: role
    });
    cursor += duration;
  };

  if (introSlides.length && introMs > 0) {
    const parts = allocate(introMs, introSlides.map(slideWeight));
    introSlides.forEach((slide, index) => push(slide, parts[index], 'intro'));
  }

  let pending = 0;
  sections.forEach((section, index) => {
    const slides = contentSlides
      .filter((slide) => slide.sectionId === section.id)
      .sort((a, b) => a.order - b.order);
    const duration = (sectionMs[index] ?? 0) + pending;
    if (!slides.length) {
      pending = duration;
      return;
    }
    pending = 0;
    const parts = allocate(duration, slides.map(slideWeight));
    slides.forEach((slide, slideIndex) => push(slide, parts[slideIndex], 'narration'));
  });

  if (pending > 0) {
    const placed = new Set(shots.map((shot) => shot.slideId));
    const leftovers = contentSlides.filter((slide) => !placed.has(slide.id));
    if (leftovers.length) {
      const parts = allocate(pending, leftovers.map(slideWeight));
      leftovers.forEach((slide, index) => push(slide, parts[index], 'narration'));
      pending = 0;
    }
  }

  if (outroSlides.length && outroMs > 0) {
    const parts = allocate(outroMs, outroSlides.map(slideWeight));
    outroSlides.forEach((slide, index) => push(slide, parts[index], 'outro'));
  }

  const covered = new Set(shots.map((shot) => shot.slideId));
  const unplaced = [...contentSlides, ...outroSlides].filter((slide) => !covered.has(slide.id));
  if (unplaced.length) {
    warnings.push(`有 ${unplaced.length} 个课件页没有对应的讲稿段落`);
  }
  if (pending > 0 && shots.length) {
    const last = shots[shots.length - 1];
    last.endSeconds = toSeconds(toMs(last.endSeconds) + pending);
    last.durationSeconds = toSeconds(toMs(last.endSeconds) - toMs(last.startSeconds));
  } else if (pending > 0 && !shots.length && contentSlides.length) {
    const parts = allocate(pending, contentSlides.map(slideWeight));
    contentSlides.forEach((slide, index) => push(slide, parts[index], 'narration'));
  }

  return { shots, warnings };
}

export function buildCourseTimeline(
  project: CourseProject,
  audioAsset: RecordingAsset | undefined,
  options: BuildTimelineOptions = {}
): CourseTimeline {
  const minShotMs = toMs(options.minShotSeconds ?? MIN_SHOT_DURATION);
  const slides = [...project.slides].sort((a, b) => a.order - b.order);
  const warnings: string[] = [];
  const audioMode: 'tts' | 'teacher' = audioAsset?.kind === 'tts' ? 'tts' : 'teacher';

  if (!slides.length) {
    return {
      shots: [],
      totalSeconds: 0,
      audioDuration: 0,
      leadInSeconds: 0,
      leadOutSeconds: 0,
      audioMode,
      method: 'estimated',
      warnings: ['课件页面为空，无法生成时间轴'],
      generatedAt: new Date().toISOString()
    };
  }

  const introSlides = slides.filter((slide) => slide.layout === 'cover' || slide.layout === 'objectives');
  const outroSlides = slides.filter((slide) => slide.layout === 'quote' || slide.layout === 'summary');
  const contentSlides = slides.filter(
    (slide) => !introSlides.includes(slide) && !outroSlides.includes(slide)
  );
  const sections = fallbackSections(project, contentSlides);

  const preview = (): CourseTimeline => {
    const shots: TimelineShot[] = [];
    let cursor = 0;
    for (const slide of slides) {
      const duration = Math.max(minShotMs, toMs(slideWeight(slide)));
      const role: TimelineShot['audioRole'] =
        slide.layout === 'cover' || slide.layout === 'objectives'
          ? 'intro'
          : slide.layout === 'quote' || slide.layout === 'summary'
            ? 'outro'
            : 'narration';
      shots.push({
        slideId: slide.id,
        slideOrder: slide.order,
        slideTitle: slide.title,
        layout: slide.layout,
        sectionId: slide.sectionId,
        startSeconds: toSeconds(cursor),
        endSeconds: toSeconds(cursor + duration),
        durationSeconds: toSeconds(duration),
        audioRole: role
      });
      cursor += duration;
    }
    warnings.unshift('尚未生成或上传音轨，时间轴为页面预估');
    return {
      shots,
      totalSeconds: toSeconds(cursor),
      audioDuration: 0,
      leadInSeconds: 0,
      leadOutSeconds: 0,
      audioMode,
      method: 'estimated',
      warnings,
      generatedAt: new Date().toISOString()
    };
  };

  if (!audioAsset || !(audioAsset.durationSeconds > 0)) return preview();

  const audioMs = toMs(audioAsset.durationSeconds);
  if (audioAsset.kind !== 'tts' && (audioAsset.slideEvents?.length ?? 0) > 0) {
    const trialTimeline = buildTrialTimeline(slides, audioAsset, audioMs, warnings);
    if (trialTimeline) return trialTimeline;
  }
  const segments = (audioAsset.segments ?? [])
    .map((segment) => ({
      sectionId: segment.sectionId,
      start: Math.max(0, toMs(segment.startSeconds)),
      end: Math.max(0, toMs(segment.endSeconds))
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);
  const hasSegments = segments.length > 0;
  const measured =
    (audioAsset.kind === 'tts' && hasSegments) ||
    (audioAsset.kind !== 'tts' && hasSegments && audioAsset.alignmentMethod === 'segment');

  if (!hasSegments) {
    warnings.push(
      audioAsset.kind === 'tts'
        ? 'TTS 音轨缺少分段信息，画面边界按讲稿时长估算'
        : '录音缺少逐句时间戳，画面边界按段落时长估算'
    );
  } else if (!measured) {
    warnings.push('录音使用文本匹配定位，画面边界为估算值');
  }

  const introWeightMs = introSlides.reduce((sum, slide) => sum + toMs(slideWeight(slide)), 0);
  const outroWeightMs = outroSlides.reduce((sum, slide) => sum + toMs(slideWeight(slide)), 0);
  const introLimit = Math.min(Math.round(audioMs * 0.25), 12_000);
  const outroLimit = Math.min(Math.round(audioMs * 0.2), 10_000);
  const introTarget = introSlides.length
    ? clamp(introWeightMs, minShotMs, Math.max(minShotMs, introLimit))
    : 0;
  const outroTarget = outroSlides.length
    ? clamp(outroWeightMs, minShotMs, Math.max(minShotMs, outroLimit))
    : 0;

  let introMs = 0;
  let outroMs = 0;
  const sectionMs: number[] = [];

  if (audioMode === 'tts') {
    introMs = introTarget;
    outroMs = outroTarget;
    const plan = planRegions(sections, segments, 0, audioMs);
    sectionMs.push(...plan.durations);
    if (hasSegments && !plan.exact) warnings.push('部分段落缺少时间戳，已按讲稿时长补齐');
  } else {
    const plan = planRegions(sections, segments, 0, audioMs);
    sectionMs.push(...plan.durations);
    if (!sectionMs.length) sectionMs.push(audioMs);
    introMs = Math.min(introTarget, Math.round(sectionMs[0] * 0.5));
    sectionMs[0] = Math.max(0, sectionMs[0] - introMs);
    const lastIndex = sectionMs.length - 1;
    outroMs = Math.min(outroTarget, Math.round(sectionMs[lastIndex] * 0.5));
    sectionMs[lastIndex] = Math.max(0, sectionMs[lastIndex] - outroMs);
    if (hasSegments && !plan.exact) warnings.push('部分段落缺少时间戳，已按讲稿时长补齐');
  }

  const built = buildShots(introSlides, outroSlides, sections, contentSlides, introMs, sectionMs, outroMs);
  warnings.push(...built.warnings);
  const shots = built.shots;

  const targetMs = audioMode === 'tts' ? introMs + audioMs + outroMs : audioMs;
  if (!shots.length) {
    return {
      shots: [],
      totalSeconds: 0,
      audioDuration: toSeconds(audioMs),
      leadInSeconds: toSeconds(introMs),
      leadOutSeconds: toSeconds(outroMs),
      audioMode,
      method: measured ? 'measured' : 'estimated',
      warnings: [...warnings, '没有可用的课件镜头'],
      generatedAt: new Date().toISOString()
    };
  }

  const actual = toMs(shots[shots.length - 1].endSeconds);
  if (actual !== targetMs) {
    const last = shots[shots.length - 1];
    const newEnd = toMs(last.startSeconds) + Math.max(0, toMs(last.durationSeconds) + targetMs - actual);
    last.endSeconds = toSeconds(newEnd);
    last.durationSeconds = toSeconds(newEnd - toMs(last.startSeconds));
  }

  const totalMs = toMs(shots[shots.length - 1].endSeconds);
  return {
    shots,
    totalSeconds: toSeconds(totalMs),
    audioDuration: toSeconds(audioMs),
    leadInSeconds: toSeconds(introMs),
    leadOutSeconds: toSeconds(outroMs),
    audioMode,
    method: measured ? 'measured' : 'estimated',
    warnings,
    generatedAt: new Date().toISOString()
  };
}
