import type { SlideVisual, SlideVisualNode } from '../types';

export interface VisualTheme {
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  line: string;
  panel: string;
}

export const lightVisualTheme: VisualTheme = {
  accent: '#c0512f',
  accentSoft: '#fbeee9',
  ink: '#16202b',
  muted: '#64707c',
  line: '#e3e7eb',
  panel: '#ffffff'
};

const FONT = '"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif';
const w = 1000;
const h = 620;

const escape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toneColor = (tone: SlideVisualNode['tone'], theme: VisualTheme) => {
  switch (tone) {
    case 'teal':
      return '#1f7a6d';
    case 'gold':
      return '#a97721';
    case 'ink':
      return '#3f5147';
    case 'brick':
      return theme.accent;
    default:
      return theme.ink;
  }
};

const toneSoft = (tone: SlideVisualNode['tone'], theme: VisualTheme) => {
  switch (tone) {
    case 'teal':
      return '#e8f3f1';
    case 'gold':
      return '#f8f1e2';
    case 'ink':
      return '#e9edf1';
    case 'brick':
      return theme.accentSoft;
    default:
      return '#f2f5f8';
  }
};

const wrapText = (text: string, perLine: number, maxLines: number) => {
  const chars = String(text ?? '').split('');
  const lines: string[] = [];
  let current = '';
  for (const char of chars) {
    current += char;
    if (current.length >= perLine) {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines && chars.length > maxLines * perLine) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.slice(0, Math.max(1, perLine - 1)) + '…';
  }
  return lines;
};

const textBlock = (
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  options: { size: number; fill: string; weight?: number; anchor?: string }
) =>
  lines
    .map(
      (line, index) =>
        '<text x="' +
        x +
        '" y="' +
        (y + index * lineHeight).toFixed(1) +
        '" font-family=\'' +
        FONT +
        '\' font-size="' +
        options.size +
        '" fill="' +
        options.fill +
        '" font-weight="' +
        (options.weight ?? 400) +
        '" text-anchor="' +
        (options.anchor ?? 'start') +
        '">' +
        escape(line) +
        '</text>'
    )
    .join('');

const panel = (x: number, y: number, w: number, h: number, theme: VisualTheme, fill?: string) =>
  '<rect x="' +
  x +
  '" y="' +
  y +
  '" width="' +
  w +
  '" height="' +
  h +
  '" rx="14" fill="' +
  (fill ?? theme.panel) +
  '" stroke="' +
  theme.line +
  '" stroke-width="2"/>';

const renderSteps = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const steps = (visual.steps ?? []).filter((step) => step?.label);
  if (!steps.length) return '';
  const columns = steps.length <= 3 ? steps.length : steps.length <= 4 ? 2 : 3;
  const rows = Math.ceil(steps.length / columns);
  const gapX = 26;
  const gapY = 26;
  const cardW = (w - gapX * (columns - 1)) / columns;
  const cardH = (h - 150 - gapY * (rows - 1)) / rows;
  const parts: string[] = [];
  steps.forEach((step, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * (cardW + gapX);
    const y = 110 + row * (cardH + gapY);
    const isLast = index === steps.length - 1;
    const fill = isLast ? theme.accentSoft : theme.panel;
    parts.push(panel(x, y, cardW, cardH, theme, fill));
    parts.push(
      '<circle cx="' +
        (x + 46).toFixed(1) +
        '" cy="' +
        (y + 48).toFixed(1) +
        '" r="22" fill="' +
        (isLast ? theme.accent : '#f2f5f8') +
        '"/>'
    );
    parts.push(
      '<text x="' +
        (x + 46).toFixed(1) +
        '" y="' +
        (y + 56).toFixed(1) +
        '" font-family=\'' +
        FONT +
        '\' font-size="22" font-weight="700" fill="' +
        (isLast ? '#ffffff' : theme.ink) +
        '" text-anchor="middle">' +
        (index + 1) +
        '</text>'
    );
    const labelLines = wrapText(step.label, Math.max(6, Math.floor(cardW / 26)), 2);
    parts.push(textBlock(labelLines, x + 30, y + 108, 30, { size: 26, fill: theme.ink, weight: 600 }));
    if (step.detail) {
      const detailLines = wrapText(step.detail, Math.max(8, Math.floor(cardW / 20)), 3);
      parts.push(
        textBlock(detailLines, x + 30, y + 108 + labelLines.length * 30 + 12, 24, {
          size: 19,
          fill: theme.muted
        })
      );
    }
    if (column < columns - 1 && index < steps.length - 1) {
      const arrowX = x + cardW + gapX / 2;
      parts.push(
        '<path d="M ' +
          (arrowX - 9).toFixed(1) +
          ' ' +
          (y + cardH / 2).toFixed(1) +
          ' L ' +
          (arrowX + 9).toFixed(1) +
          ' ' +
          (y + cardH / 2).toFixed(1) +
          '" stroke="' +
          theme.line +
          '" stroke-width="4" stroke-linecap="round"/>'
      );
    }
  });
  return parts.join('');
};

const layerNodes = (count: number, links: SlideVisual['links']) => {
  const layers: number[][] = [];
  const safeLinks = (links ?? []).filter(
    (link) => link.from >= 0 && link.from < count && link.to >= 0 && link.to < count
  );
  const depth = new Array(count).fill(0);
  for (let pass = 0; pass < count; pass += 1) {
    let changed = false;
    for (const link of safeLinks) {
      if (depth[link.to] < depth[link.from] + 1) {
        depth[link.to] = depth[link.from] + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (let index = 0; index < count; index += 1) {
    const level = Math.min(depth[index], 3);
    if (!layers[level]) layers[level] = [];
    layers[level].push(index);
  }
  return layers.filter(Boolean);
};

﻿const renderDiagram = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const nodes = (visual.nodes ?? []).filter((node) => node?.label);
  if (nodes.length < 2) return '';
  const layers = layerNodes(nodes.length, visual.links);
  const parts: string[] = [];
  const horizontal = w / h >= 1.35;
  const boxW = horizontal ? 248 : 300;
  const boxH = horizontal ? 128 : 132;
  const positions: Array<{ x: number; y: number }> = [];
  layers.forEach((layer, layerIndex) => {
    const count = layer.length;
    if (horizontal) {
      const layerGap = layers.length > 1 ? (w - boxW - 60) / (layers.length - 1) : 0;
      layer.forEach((nodeIndex, itemIndex) => {
        const spacing = count > 1 ? (h - boxH - 60) / (count - 1) : 0;
        const baseY = (h - boxH) / 2 - ((count - 1) * spacing) / 2;
        positions[nodeIndex] = {
          x: 30 + layerIndex * layerGap,
          y: baseY + itemIndex * spacing
        };
      });
    } else {
      const layerGap = layers.length > 1 ? Math.max(150, (h - 260) / (layers.length - 1)) : 0;
      layer.forEach((nodeIndex, itemIndex) => {
        const spacing = count > 1 ? (w - boxW - 60) / (count - 1) : 0;
        const baseX = (w - boxW) / 2 - ((count - 1) * spacing) / 2;
        positions[nodeIndex] = {
          x: baseX + itemIndex * spacing,
          y: 40 + layerIndex * layerGap
        };
      });
    }
  });
  const links = (visual.links ?? []).filter(
    (link) => positions[link.from] && positions[link.to] && link.from !== link.to
  );
  for (const link of links) {
    const from = positions[link.from];
    const to = positions[link.to];
    let x1 = from.x + boxW / 2;
    let y1 = from.y + boxH;
    let x2 = to.x + boxW / 2;
    let y2 = to.y;
    let path = '';
    let labelX = 0;
    let labelY = 0;
    if (horizontal) {
      x1 = from.x + boxW;
      y1 = from.y + boxH / 2;
      x2 = to.x;
      y2 = to.y + boxH / 2;
      const mid = (x1 + x2) / 2;
      path = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C ' + mid.toFixed(1) + ' ' +
        y1.toFixed(1) + ', ' + mid.toFixed(1) + ' ' + y2.toFixed(1) + ', ' + x2.toFixed(1) +
        ' ' + y2.toFixed(1);
      labelX = mid;
      labelY = (y1 + y2) / 2 - 10;
    } else {
      const mid = (y1 + y2) / 2;
      path = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C ' + x1.toFixed(1) + ' ' +
        mid.toFixed(1) + ', ' + x2.toFixed(1) + ' ' + mid.toFixed(1) + ', ' + x2.toFixed(1) +
        ' ' + (y2 - 8).toFixed(1);
      labelX = (x1 + x2) / 2;
      labelY = mid - 8;
    }
    parts.push(
      '<path d="' + path + '" fill="none" stroke="' + theme.line + '" stroke-width="4"/>'
    );
    parts.push(
      '<path d="M ' + (horizontal ? x2 - 14 : x2 - 8).toFixed(1) + ' ' +
        (horizontal ? y2 - 8 : y2 - 14).toFixed(1) + ' L ' + x2.toFixed(1) + ' ' +
        (horizontal ? y2 : y2 - 2).toFixed(1) + ' L ' + (horizontal ? x2 - 14 : x2 + 8).toFixed(1) +
        ' ' + (horizontal ? y2 + 8 : y2 - 14).toFixed(1) +
        '" fill="none" stroke="' + theme.line + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    );
    if (link.label) {
      parts.push(
        '<text x="' + labelX.toFixed(1) + '" y="' + labelY.toFixed(1) + '" font-family=\'' +
          FONT + '\' font-size="17" fill="' + theme.muted + '" text-anchor="middle">' +
          escape(link.label) + '</text>'
      );
    }
  }
  nodes.forEach((node, index) => {
    const position = positions[index];
    if (!position) return;
    const tone = node.tone ?? (index % 2 === 0 ? 'brick' : 'teal');
    parts.push(panel(position.x, position.y, boxW, boxH, theme, toneSoft(tone, theme)));
    parts.push(
      '<rect x="' + position.x + '" y="' + position.y + '" width="8" height="' + boxH +
        '" rx="4" fill="' + toneColor(tone, theme) + '"/>'
    );
    const labelLines = wrapText(node.label, 9, 2);
    parts.push(
      textBlock(labelLines, position.x + 30, position.y + 50, 32, {
        size: 25,
        fill: theme.ink,
        weight: 600
      })
    );
    if (node.detail) {
      const detailLines = wrapText(node.detail, 14, 2);
      parts.push(
        textBlock(detailLines, position.x + 30, position.y + 50 + labelLines.length * 32 + 8, 24, {
          size: 18,
          fill: theme.muted
        })
      );
    }
  });
  return parts.join('');
};

const renderChart = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const series = (visual.series ?? []).filter((item) => item?.label);
  if (!series.length) return '';
  const max = Math.max(...series.map((item) => Number(item.value) || 0), 1);
  const parts: string[] = [];
  const rowHeight = Math.min(96, (h - 170) / series.length);
  const labelWidth = 210;
  const valueWidth = 90;
  const barMax = w - labelWidth - valueWidth - 40;
  series.forEach((item, index) => {
    const y = 118 + index * rowHeight;
    const value = Number(item.value) || 0;
    const barWidth = Math.max(8, (value / max) * barMax);
    const isTop = index === 0;
    parts.push(
      '<text x="0" y="' +
        (y + 26).toFixed(1) +
        '" font-family=\'' +
        FONT +
        '\' font-size="23" fill="' +
        theme.ink +
        '" font-weight="' +
        (isTop ? 700 : 500) +
        '">' +
        escape(item.label.length > 11 ? item.label.slice(0,  11) + '…' : item.label) +
        '</text>'
    );
    if (item.note) {
      parts.push(
        '<text x="0" y="' +
          (y + 52).toFixed(1) +
          '" font-family=\'' +
          FONT +
          '\' font-size="16" fill="' +
          theme.muted +
          '">' +
          escape(item.note) +
          '</text>'
      );
    }
    parts.push(
      '<rect x="' +
        labelWidth +
        '" y="' +
        (y + 6).toFixed(1) +
        '" width="' +
        barMax +
        '" height="34" rx="8" fill="' +
        theme.line +
        '" opacity="0.6"/>'
    );
    parts.push(
      '<rect x="' +
        labelWidth +
        '" y="' +
        (y + 6).toFixed(1) +
        '" width="' +
        barWidth.toFixed(1) +
        '" height="34" rx="8" fill="' +
        (isTop ? theme.accent : toneColor('teal', theme)) +
        '"/>'
    );
    parts.push(
      '<text x="' +
        (labelWidth + barMax + 16).toFixed(1) +
        '" y="' +
        (y + 31).toFixed(1) +
        '" font-family=\'' +
        FONT +
        '\' font-size="24" fill="' +
        theme.ink +
        '" font-weight="700">' +
        escape(item.value) +
        '</text>'
    );
  });
  return parts.join('');
};

const renderCycle = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const nodes = (visual.nodes ?? []).filter((node) => node?.label);
  if (nodes.length < 3) return '';
  const parts: string[] = [];
  const cx = w / 2;
  const cy = h / 2 + 30;
  const radius = Math.max(110, Math.min(w, h) / 2 - 104);
  const count = Math.min(nodes.length, 4);
  const positions = nodes.slice(0, count).map((_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  parts.push(
    '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      radius +
      '" fill="none" stroke="' +
      theme.line +
      '" stroke-width="4" stroke-dasharray="10 12"/>'
  );
  positions.forEach((position, index) => {
    const node = nodes[index];
    const tone = node.tone ?? (index % 2 === 0 ? 'brick' : 'teal');
    parts.push(
      '<circle cx="' +
        position.x.toFixed(1) +
        '" cy="' +
        position.y.toFixed(1) +
        '" r="76" fill="' +
        toneSoft(tone, theme) +
        '" stroke="' +
        toneColor(tone, theme) +
        '" stroke-width="3"/>'
    );
    const lines = wrapText(node.label, 6, 2);
    parts.push(
      textBlock(lines, position.x, position.y - (lines.length - 1) * 13 + 8, 26, {
        size: 21,
        fill: theme.ink,
        weight: 600,
        anchor: 'middle'
      })
    );
    const next = positions[(index + 1) % positions.length];
    const angle = Math.atan2(next.y - position.y, next.x - position.x);
    const arrowX = position.x + Math.cos(angle) * 96;
    const arrowY = position.y + Math.sin(angle) * 96;
    parts.push(
      '<path d="M ' +
        (arrowX - 9).toFixed(1) +
        ' ' +
        (arrowY - 9).toFixed(1) +
        ' L ' +
        arrowX.toFixed(1) +
        ' ' +
        arrowY.toFixed(1) +
        ' L ' +
        (arrowX - 10).toFixed(1) +
        ' ' +
        (arrowY + 8).toFixed(1) +
        '" fill="none" stroke="' +
        theme.muted +
        '" stroke-width="3" stroke-linecap="round"/>'
    );
  });
  if (visual.caption) {
    parts.push(
      '<text x="' +
        cx +
        '" y="' +
        (h - 26) +
        '" font-family=\'' +
        FONT +
        '\' font-size="19" fill="' +
        theme.muted +
        '" text-anchor="middle">' +
        escape(visual.caption) +
        '</text>'
    );
  }
  return parts.join('');
};

const renderTimeline = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const nodes = (visual.nodes ?? []).filter((node) => node?.label);
  if (nodes.length < 2) return '';
  const parts: string[] = [];
  const axisY = h / 2 + 20;
  const left = 90;
  const right = w - 90;
  parts.push(
    '<line x1="' +
      left +
      '" y1="' +
      axisY +
      '" x2="' +
      right +
      '" y2="' +
      axisY +
      '" stroke="' +
      theme.line +
      '" stroke-width="6" stroke-linecap="round"/>'
  );
  const step = (right - left) / Math.max(1, nodes.length - 1);
  nodes.forEach((node, index) => {
    const x = left + step * index;
    const above = index % 2 === 0;
    const tone = node.tone ?? (index % 2 === 0 ? 'brick' : 'teal');
    parts.push(
      '<circle cx="' + x.toFixed(1) + '" cy="' + axisY + '" r="14" fill="' + toneColor(tone, theme) + '"/>'
    );
    parts.push(
      '<circle cx="' +
        x.toFixed(1) +
        '" cy="' +
        axisY +
        '" r="24" fill="none" stroke="' +
        toneColor(tone, theme) +
        '" stroke-width="3" opacity="0.35"/>'
    );
    const boxWidth = 210;
    const boxX = Math.min(Math.max(x - boxWidth / 2, 12), w - boxWidth - 12);
    const boxY = above ? axisY - Math.min(210, h / 2 - 40) : axisY + 46;
    parts.push(panel(boxX, boxY, boxWidth, 150, theme, toneSoft(tone, theme)));
    const labelLines = wrapText(node.label, 9, 2);
    parts.push(
      textBlock(labelLines, boxX + 20, boxY + 44, 28, {
        size: 22,
        fill: theme.ink,
        weight: 600
      })
    );
    if (node.detail) {
      const detailLines = wrapText(node.detail, 13, 2);
      parts.push(
        textBlock(detailLines, boxX + 20, boxY + 44 + labelLines.length * 28 + 6, 22, {
          size: 16,
          fill: theme.muted
        })
      );
    }
    parts.push(
      '<line x1="' +
        x.toFixed(1) +
        '" y1="' +
        (above ? axisY - 26 : axisY + 26).toFixed(1) +
        '" x2="' +
        x.toFixed(1) +
        '" y2="' +
        (above ? boxY + 150 : boxY).toFixed(1) +
        '" stroke="' +
        theme.line +
        '" stroke-width="3"/>'
    );
  });
  return parts.join('');
};

const renderMatrix = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const columns = (visual.columns ?? []).filter(Boolean);
  const rows = (visual.rows ?? []).filter((row) => Array.isArray(row?.cells) && row.cells.length);
  if (!columns.length || !rows.length) return '';
  const parts: string[] = [];
  const rowHeight = Math.min(120, (h - 190) / rows.length);
  const columnWidth = (w - 20) / columns.length;
  parts.push('<rect x="0" y="96" width="' + w + '" height="52" rx="10" fill="' + theme.accentSoft + '"/>');
  columns.forEach((column, index) => {
    parts.push(
      '<text x="' +
        (index * columnWidth + columnWidth / 2).toFixed(1) +
        '" y="130" font-family=\'' +
        FONT +
        '\' font-size="21" fill="' +
        theme.ink +
        '" font-weight="700" text-anchor="middle">' +
        escape(column) +
        '</text>'
    );
  });
  rows.forEach((row, rowIndex) => {
    const y = 96 + 52 + rowIndex * rowHeight;
    row.cells.forEach((cell, columnIndex) => {
      const x = columnIndex * columnWidth;
      const highlighted = row.highlight === columnIndex;
      parts.push(
        '<rect x="' +
          (x + 6).toFixed(1) +
          '" y="' +
          (y + 6).toFixed(1) +
          '" width="' +
          (columnWidth - 12).toFixed(1) +
          '" height="' +
          (rowHeight - 12).toFixed(1) +
          '" rx="10" fill="' +
          (highlighted ? theme.accentSoft : 'transparent') +
          '" stroke="' +
          theme.line +
          '" stroke-width="2"/>'
      );
      const lines = wrapText(cell, Math.max(5, Math.floor(columnWidth / 20)), 3);
      parts.push(
        textBlock(lines, x + columnWidth / 2, y + 44, 26, {
          size: 19,
          fill: highlighted ? theme.accent : theme.ink,
          weight: highlighted ? 700 : 400,
          anchor: 'middle'
        })
      );
    });
  });
  return parts.join('');
};

const renderImage = (visual: SlideVisual, theme: VisualTheme, w: number, h: number) => {
  const parts: string[] = [];
  if (visual.imageUrl) {
    parts.push(
      '<image href="' +
        escape(visual.imageUrl) +
        '" x="0" y="96" width="' +
        w +
        '" height="' +
        (h - 96) +
        '" preserveAspectRatio="xMidYMid slice"/>'
    );
    return parts.join('');
  }
  parts.push(panel(0, 96, w, h - 96, theme, '#f7f9fb'));
  parts.push(
    '<text x="' +
      w / 2 +
      '" y="' +
      (h / 2 - 6) +
      '" font-family=\'' +
      FONT +
      '\' font-size="26" fill="' +
      theme.muted +
      '" text-anchor="middle">视觉插图位</text>'
  );
  const prompt = visual.imagePrompt || visual.caption || '';
  if (prompt) {
    const lines = wrapText(prompt, 26, 3);
    parts.push(
      textBlock(lines, w / 2, h / 2 + 44, 30, {
        size: 19,
        fill: theme.muted,
        anchor: 'middle'
      })
    );
  }
  return parts.join('');
};

/**
 * Builds the SVG for one slide visual. The same helper powers the in-app
 * preview and the 1080p frames burned into the exported video.
 */
export function renderVisualSvg(
  visual: SlideVisual | undefined,
  theme: VisualTheme = lightVisualTheme,
  size: { width?: number; height?: number } = {}
): string {
  const w = size.width ?? 1000;
  const h = size.height ?? 620;
  if (!visual || visual.kind === 'none') return '';
  let content = '';
  switch (visual.kind) {
    case 'steps':
      content = renderSteps(visual, theme, w, h);
      break;
    case 'diagram':
      content = renderDiagram(visual, theme, w, h);
      break;
    case 'chart':
      content = renderChart(visual, theme, w, h);
      break;
    case 'cycle':
      content = renderCycle(visual, theme, w, h);
      break;
    case 'timeline':
      content = renderTimeline(visual, theme, w, h);
      break;
    case 'matrix':
      content = renderMatrix(visual, theme, w, h);
      break;
    case 'image':
      content = renderImage(visual, theme, w, h);
      break;
    default:
      content = '';
  }
  if (!content) return '';
  const title = visual.title
    ? '<text x="0" y="52" font-family=\'' +
      FONT +
      '\' font-size="26" font-weight="700" fill="' +
      theme.ink +
      '">' +
      escape(visual.title) +
      '</text>'
    : '';
  const caption =
    visual.caption && visual.kind !== 'cycle'
      ? '<text x="' + w + '" y="' + (h - 14) + '" font-family=\'' +
        FONT +
        '\' font-size="19" fill="' + theme.muted + '" text-anchor="end">' +
        escape(visual.caption) +
        '</text>'
      : '';
  return (
    '<svg viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' +
    escape(visual.title || visual.kind) +
    '">' +
    title +
    caption +
    content +
    '</svg>'
  );
}
