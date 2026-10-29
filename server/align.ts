import type { AlignmentMethod, CourseScript, TranscriptSegment } from '../src/types';

export interface SectionSegment {
  sectionId: string;
  startSeconds: number;
  endSeconds: number;
}

export interface AlignmentResult {
  segments: SectionSegment[];
  alignment: number;
  method: AlignmentMethod;
  confidence: number;
  warnings: string[];
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s，。！？、；：“”‘’（）《》〈〉【】,.!?;:'"()\[\]<>·—…\-]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

const bigrams = (value: string) => {
  const set = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    set.add(value.slice(index, index + 2));
  }
  return set;
};

const scoreWindow = (needleSet: Set<string>, window: string) => {
  if (!needleSet.size || window.length < 2) return 0;
  let hits = 0;
  for (let index = 0; index < window.length - 1; index += 1) {
    if (needleSet.has(window.slice(index, index + 2))) hits += 1;
  }
  return Math.min(1, hits / needleSet.size);
};

const findApproxPosition = (
  haystack: string,
  rawNeedle: string,
  from: number,
  to: number
): { position: number; score: number } => {
  const needle = normalize(rawNeedle);
  if (!needle) return { position: from, score: 0 };
  const start = Math.max(0, Math.min(from, haystack.length - 1));
  const end = Math.max(start + 1, Math.min(to, haystack.length));
  const probe = needle.slice(0, Math.min(24, needle.length));

  if (probe.length >= 4) {
    const exact = haystack.indexOf(probe, start);
    if (exact >= 0 && exact < end) {
      return { position: exact, score: 1 };
    }
  }

  const needleSet = bigrams(needle);
  const windowLength = Math.max(6, Math.min(needle.length, haystack.length - start));
  const stride = Math.max(1, Math.floor(windowLength / 5));
  let best = { position: start, score: 0 };

  for (let position = start; position < end; position += stride) {
    const window = haystack.slice(position, position + windowLength);
    const score = scoreWindow(needleSet, window);
    if (score > best.score) best = { position, score };
    if (score >= 0.92) break;
  }

  if (best.score > 0.2) {
    const refineStart = Math.max(start, best.position - stride);
    const refineEnd = Math.min(end, best.position + stride + 1);
    for (let position = refineStart; position < refineEnd; position += 1) {
      const window = haystack.slice(position, position + windowLength);
      const score = scoreWindow(needleSet, window);
      if (score > best.score) best = { position, score };
    }
  }

  return best;
};

const mapPositionToSection = (position: number, sectionLengths: number[]) => {
  let cursor = 0;
  for (let index = 0; index < sectionLengths.length; index += 1) {
    cursor += sectionLengths[index];
    if (position < cursor || index === sectionLengths.length - 1) return index;
  }
  return sectionLengths.length - 1;
};

export function estimateSegments(script: CourseScript | undefined, totalSeconds: number): SectionSegment[] {
  if (!script?.sections.length) return [];
  const weight = script.sections.reduce((sum, section) => sum + Math.max(1, section.durationSeconds), 0);
  let cursor = 0;
  return script.sections.map((section) => {
    const duration = (Math.max(1, section.durationSeconds) / weight) * totalSeconds;
    const segment = {
      sectionId: section.id,
      startSeconds: Number(cursor.toFixed(2)),
      endSeconds: Number((cursor + duration).toFixed(2))
    };
    cursor += duration;
    return segment;
  });
}

const roundSegments = (segments: SectionSegment[]) =>
  segments.map((segment) => ({
    sectionId: segment.sectionId,
    startSeconds: Number(segment.startSeconds.toFixed(2)),
    endSeconds: Number(segment.endSeconds.toFixed(2))
  }));

const fillGaps = (
  script: CourseScript,
  ranges: Array<{ start: number; end: number } | null>,
  totalSeconds: number
) => {
  const count = ranges.length;
  let lastEnd = 0;
  for (let index = 0; index < count; index += 1) {
    const range = ranges[index];
    if (range) {
      range.start = Math.max(range.start, lastEnd);
      range.end = Math.max(range.end, range.start + 0.4);
      lastEnd = range.end;
      continue;
    }
    let next = index + 1;
    while (next < count && !ranges[next]) next += 1;
    const limit = next < count ? Math.max(lastEnd + 0.4, ranges[next]!.start) : Math.max(totalSeconds, lastEnd + 0.4);
    const span = Math.max(0.4, limit - lastEnd);
    const gapCount = Math.max(1, next - index);
    const duration = span / gapCount;
    ranges[index] = { start: lastEnd, end: lastEnd + duration };
    lastEnd += duration;
  }
  return ranges as Array<{ start: number; end: number }>;
};

function alignWithTimestamps(
  script: CourseScript,
  segments: TranscriptSegment[],
  totalSeconds: number
): AlignmentResult {
  const sectionTexts = script.sections.map((section) => normalize(section.narration));
  const expected = sectionTexts.join('');
  const sectionLengths = sectionTexts.map((value) => Math.max(1, value.length));
  const ranges: Array<{ start: number; end: number } | null> = script.sections.map(() => null);
  let lastPosition = 0;
  let coveredChars = 0;
  let matchedSegments = 0;

  const ordered = [...segments]
    .filter((segment) => normalize(segment.text).length >= 2)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  for (const segment of ordered) {
    const needle = normalize(segment.text);
    if (!needle) continue;
    const match = findApproxPosition(expected, segment.text, lastPosition, expected.length);
    if (match.score < 0.18) continue;
    const sectionIndex = mapPositionToSection(match.position, sectionLengths);
    const start = Math.max(0, Math.min(totalSeconds, segment.startSeconds));
    const end = Math.max(start + 0.2, Math.min(totalSeconds, segment.endSeconds));
    const current = ranges[sectionIndex];
    ranges[sectionIndex] = current
      ? { start: Math.min(current.start, start), end: Math.max(current.end, end) }
      : { start, end };
    lastPosition = Math.max(lastPosition, match.position + Math.max(2, needle.length / 2));
    coveredChars += needle.length * match.score;
    matchedSegments += 1;
  }

  if (!matchedSegments) {
    return {
      segments: estimateSegments(script, totalSeconds),
      alignment: 0,
      method: 'estimated',
      confidence: 0,
      warnings: ['转写与讲稿没有建立可靠匹配，时间轴按段落时长估算']
    };
  }

  const filled = fillGaps(script, ranges, totalSeconds);
  const expectedLength = Math.max(1, expected.length);
  const confidence = Math.max(
    0,
    Math.min(99, Math.round((coveredChars / expectedLength) * 100))
  );

  return {
    segments: roundSegments(
      script.sections.map((section, index) => ({
        sectionId: section.id,
        startSeconds: filled[index].start,
        endSeconds: filled[index].end
      }))
    ),
    alignment: confidence,
    method: 'segment',
    confidence,
    warnings:
      confidence < 45
        ? ['语音时间戳可用，但与讲稿文本的匹配度偏低，请检查专有名词或人工校对转写']
        : []
  };
}

function alignWithText(
  script: CourseScript,
  transcript: string,
  totalSeconds: number
): AlignmentResult {
  const normalizedTranscript = normalize(transcript);
  if (!normalizedTranscript) {
    return {
      segments: estimateSegments(script, totalSeconds),
      alignment: 0,
      method: 'none',
      confidence: 0,
      warnings: ['没有可用的转写文本']
    };
  }

  const boundaries: Array<{ start: number; end: number } | null> = script.sections.map(() => null);
  let searchFrom = 0;
  let matched = 0;
  let scoreSum = 0;

  script.sections.forEach((section, index) => {
    const match = findApproxPosition(
      normalizedTranscript,
      section.narration.slice(0, Math.min(180, section.narration.length)),
      searchFrom,
      normalizedTranscript.length
    );
    if (match.score < 0.18) return;
    const start = (match.position / Math.max(1, normalizedTranscript.length)) * totalSeconds;
    const lengthRatio = Math.min(1, normalize(section.narration).length / Math.max(1, normalizedTranscript.length));
    const end = Math.min(totalSeconds, start + Math.max(1, lengthRatio * totalSeconds));
    boundaries[index] = { start, end };
    searchFrom = Math.max(searchFrom, match.position + 2);
    matched += 1;
    scoreSum += match.score;
  });

  if (matched < Math.ceil(script.sections.length / 2)) {
    return {
      segments: estimateSegments(script, totalSeconds),
      alignment: 0,
      method: 'estimated',
      confidence: 0,
      warnings: ['只有文本、没有逐句时间戳，未找到足够段落匹配，时间轴按比例估算']
    };
  }

  const filled = fillGaps(script, boundaries, totalSeconds);
  const confidence = Math.min(95, Math.round((matched / script.sections.length) * 60 + (scoreSum / matched) * 35));
  return {
    segments: roundSegments(
      script.sections.map((section, index) => ({
        sectionId: section.id,
        startSeconds: filled[index].start,
        endSeconds: filled[index].end
      }))
    ),
    alignment: confidence,
    method: 'text',
    confidence,
    warnings: ['当前为文本匹配定位，未使用逐句语音时间戳']
  };
}

export function alignTranscript(
  script: CourseScript | undefined,
  transcript: string,
  segments: TranscriptSegment[] | undefined,
  totalSeconds: number
): AlignmentResult {
  if (!script?.sections.length) {
    return { segments: [], alignment: 0, method: 'none', confidence: 0, warnings: ['讲稿为空，无法对齐'] };
  }
  const safeDuration = Math.max(1, totalSeconds || 1);
  if (segments && segments.length >= 1) {
    return alignWithTimestamps(script, segments, safeDuration);
  }
  if (transcript.trim()) {
    return alignWithText(script, transcript, safeDuration);
  }
  return {
    segments: estimateSegments(script, safeDuration),
    alignment: 0,
    method: 'estimated',
    confidence: 0,
    warnings: ['没有转写，时间轴仅按讲稿段落时长估算']
  };
}
