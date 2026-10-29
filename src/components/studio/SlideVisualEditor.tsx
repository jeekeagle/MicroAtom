import { Eraser, Plus } from 'lucide-react';
import type { SlideVisual, SlideVisualKind, SlideTone } from '../../types';

const kindOptions: Array<{ value: SlideVisualKind; label: string }> = [
  { value: 'none', label: '不使用视觉' },
  { value: 'diagram', label: '结构示意图' },
  { value: 'steps', label: '流程步骤' },
  { value: 'chart', label: '数据图表' },
  { value: 'cycle', label: '闭环循环' },
  { value: 'timeline', label: '时间线' },
  { value: 'matrix', label: '对比表格' },
  { value: 'image', label: '插图 / 图片' }
];

const toneOptions: Array<{ value: SlideTone; label: string }> = [
  { value: 'brick', label: '砖红' },
  { value: 'teal', label: '青绿' },
  { value: 'gold', label: '金色' },
  { value: 'ink', label: '墨色' }
];

const splitLine = (value: string) => {
  const [head, ...rest] = value.split('|');
  return [head.trim(), rest.join('|').trim()];
};

export function SlideVisualEditor({
  visual,
  onChange
}: {
  visual: SlideVisual | undefined;
  onChange: (visual: SlideVisual | undefined) => void;
}) {
  const kind = visual?.kind ?? 'none';
  const patch = (next: Partial<SlideVisual>) => {
    if (kind === 'none') return;
    onChange({ kind, source: 'template', ...visual, ...next });
  };

  const changeKind = (nextKind: SlideVisualKind) => {
    if (nextKind === 'none') {
      onChange(undefined);
      return;
    }
    const base: SlideVisual = { kind: nextKind, source: 'template' };
    if (nextKind === 'diagram' || nextKind === 'cycle' || nextKind === 'timeline') {
      base.nodes = (visual?.nodes ?? []).length
        ? visual?.nodes
        : [
            { label: '第一步', tone: 'brick' },
            { label: '第二步', tone: 'teal' }
          ];
    }
    if (nextKind === 'steps') {
      base.steps = (visual?.steps ?? []).length
        ? visual?.steps
        : [
            { label: '第一步' },
            { label: '第二步' }
          ];
    }
    if (nextKind === 'chart') {
      base.series = (visual?.series ?? []).length
        ? visual?.series
        : [
            { label: '项目一', value: 60 },
            { label: '项目二', value: 40 }
          ];
    }
    if (nextKind === 'matrix') {
      base.columns = visual?.columns ?? ['维度', 'A', 'B'];
      base.rows = visual?.rows ?? [{ cells: ['对比项', '说明一', '说明二'], highlight: 0 }];
    }
    if (nextKind === 'image') {
      base.imagePrompt = visual?.imagePrompt ?? '';
      base.imageUrl = visual?.imageUrl ?? '';
    }
    if (visual?.title) base.title = visual.title;
    if (visual?.caption) base.caption = visual.caption;
    onChange(base);
  };

  const nodes = visual?.nodes ?? [];
  const steps = visual?.steps ?? [];
  const series = visual?.series ?? [];

  return (
    <div className="slide-visual-editor">
      <div className="slide-visual-editor-head">
        <div>
          <span>视觉图层</span>
          <small>给这一页配一张结构图、流程图或数据图表</small>
        </div>
        <select
          value={kind}
          onChange={(event) => changeKind(event.target.value as SlideVisualKind)}
        >
          {kindOptions.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {kind !== 'none' && (
        <>
          <div className="slide-visual-fields">
            <label className="field">
              <span>视觉标题</span>
              <input
                value={visual?.title ?? ''}
                placeholder="例如：三层结构"
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>
            <label className="field">
              <span>图注</span>
              <input
                value={visual?.caption ?? ''}
                placeholder="例如：自下而上逐层支撑"
                onChange={(event) => patch({ caption: event.target.value })}
              />
            </label>
          </div>

          {(kind === 'diagram' || kind === 'cycle' || kind === 'timeline') && (
            <div className="slide-visual-list">
              <span>节点（标签 | 说明）</span>
              {nodes.map((node, index) => (
                <div className="slide-visual-row" key={index}>
                  <input
                    value={node.label}
                    placeholder="标签"
                    onChange={(event) =>
                      patch({
                        nodes: nodes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item
                        )
                      })
                    }
                  />
                  <input
                    value={node.detail ?? ''}
                    placeholder="说明"
                    onChange={(event) =>
                      patch({
                        nodes: nodes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, detail: event.target.value } : item
                        )
                      })
                    }
                  />
                  <select
                    value={node.tone ?? 'brick'}
                    onChange={(event) =>
                      patch({
                        nodes: nodes.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, tone: event.target.value as SlideTone }
                            : item
                        )
                      })
                    }
                  >
                    {toneOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="删除节点"
                    onClick={() => patch({ nodes: nodes.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    <Eraser size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="slide-visual-add"
                onClick={() =>
                  patch({
                    nodes: [
                      ...nodes,
                      { label: `节点 ${nodes.length + 1}`, tone: nodes.length % 2 === 0 ? 'brick' : 'teal' }
                    ]
                  })
                }
              >
                <Plus size={14} />
                添加节点
              </button>
            </div>
          )}

          {kind === 'steps' && (
            <div className="slide-visual-list">
              <span>步骤（标签 | 说明）</span>
              {steps.map((step, index) => (
                <div className="slide-visual-row" key={index}>
                  <input
                    value={step.label}
                    placeholder="步骤"
                    onChange={(event) =>
                      patch({
                        steps: steps.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item
                        )
                      })
                    }
                  />
                  <input
                    value={step.detail ?? ''}
                    placeholder="说明"
                    onChange={(event) =>
                      patch({
                        steps: steps.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, detail: event.target.value } : item
                        )
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="删除步骤"
                    onClick={() => patch({ steps: steps.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    <Eraser size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="slide-visual-add"
                onClick={() =>
                  patch({ steps: [...steps, { label: `步骤 ${steps.length + 1}` }] })
                }
              >
                <Plus size={14} />
                添加步骤
              </button>
            </div>
          )}

          {kind === 'chart' && (
            <div className="slide-visual-list">
              <span>数据（标签 | 数值 | 说明）</span>
              {series.map((item, index) => (
                <div className="slide-visual-row" key={index}>
                  <input
                    value={item.label}
                    placeholder="标签"
                    onChange={(event) =>
                      patch({
                        series: series.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, label: event.target.value } : entry
                        )
                      })
                    }
                  />
                  <input
                    type="number"
                    value={item.value}
                    placeholder="数值"
                    onChange={(event) =>
                      patch({
                        series: series.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, value: Number(event.target.value) || 0 }
                            : entry
                        )
                      })
                    }
                  />
                  <input
                    value={item.note ?? ''}
                    placeholder="说明"
                    onChange={(event) =>
                      patch({
                        series: series.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, note: event.target.value } : entry
                        )
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="删除数据"
                    onClick={() =>
                      patch({ series: series.filter((_, entryIndex) => entryIndex !== index) })
                    }
                  >
                    <Eraser size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="slide-visual-add"
                onClick={() =>
                  patch({ series: [...series, { label: `项目 ${series.length + 1}`, value: 50 }] })
                }
              >
                <Plus size={14} />
                添加数据
              </button>
            </div>
          )}

          {kind === 'matrix' && (
            <div className="slide-visual-list">
              <label className="field">
                <span>列标题（用逗号分隔）</span>
                <input
                  value={(visual?.columns ?? []).join('，')}
                  onChange={(event) =>
                    patch({
                      columns: event.target.value
                        .split(/[，,]/)
                        .map((column) => column.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </label>
              <label className="field">
                <span>表格行（每行用竖线分隔）</span>
                <textarea
                  rows={4}
                  value={(visual?.rows ?? []).map((row) => row.cells.join(' | ')).join('\n')}
                  onChange={(event) =>
                    patch({
                      rows: event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => ({ cells: splitLine(line) }))
                    })
                  }
                />
              </label>
            </div>
          )}

          {kind === 'image' && (
            <div className="slide-visual-list">
              <label className="field">
                <span>插图描述（交给文生图引擎）</span>
                <textarea
                  rows={3}
                  value={visual?.imagePrompt ?? ''}
                  placeholder="例如：教室场景中三位同学围绕一张杠杆示意图讨论，无文字"
                  onChange={(event) => patch({ imagePrompt: event.target.value })}
                />
              </label>
              <label className="field">
                <span>图片地址（可选）</span>
                <input
                  value={visual?.imageUrl ?? ''}
                  placeholder="https:// 或 /media/ 开头的地址"
                  onChange={(event) => patch({ imageUrl: event.target.value })}
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
