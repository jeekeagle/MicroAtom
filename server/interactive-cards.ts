import type { CourseProject, MediaKind } from '../src/types';

export interface CardOption {
  label: string;
  text: string;
  correct?: boolean;
}

export interface CardContent {
  title: string;
  kicker?: string;
  subtitle?: string;
  concept?: string;
  definition?: string;
  hook?: string;
  points?: string[];
  myth?: string;
  fact?: string;
  question?: string;
  hints?: string[];
  answer?: string;
  criteria?: string[];
  options?: CardOption[];
  explain?: string;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CARD_TONES: Record<MediaKind, { accent: string; soft: string; tag: string }> = {
  'knowledge-graph': { accent: '#0e6f63', soft: '#e5f4f0', tag: 'RELATION MAP' },
  'cognitive-map': { accent: '#9f3d2f', soft: '#f8e9e5', tag: 'LEARNING PATH' },
  'concept-card': { accent: '#9b6a18', soft: '#f8efd9', tag: 'CONCEPT CARD' },
  infographic: { accent: '#23588a', soft: '#e8f0f7', tag: 'VISUAL BRIEF' },
  timeline: { accent: '#6c4b3b', soft: '#f3ece8', tag: 'COURSE TIMELINE' },
  quiz: { accent: '#3d5c4d', soft: '#e9f0eb', tag: 'KNOWLEDGE CHECK' },
  flashcard: { accent: '#2f5d8c', soft: '#e8eff7', tag: 'TERM CARD' },
  checklist: { accent: '#1f7a6d', soft: '#e6f2f0', tag: 'SELF CHECK' },
  counterexample: { accent: '#a2452f', soft: '#f9ebe5', tag: 'MISCONCEPTION' },
  challenge: { accent: '#8a5a12', soft: '#f8efdd', tag: 'TRANSFER TASK' }
};

const list = (items: string[] | undefined) =>
  (items ?? [])
    .filter(Boolean)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

const flashcardBody = (content: CardContent) => `
  <section class="card-face">
    <span class="tag">${escapeHtml(CARD_TONES.flashcard.tag)}</span>
    <h2>${escapeHtml(content.title)}</h2>
    ${content.subtitle ? `<p class="lead">${escapeHtml(content.subtitle)}</p>` : ''}
    ${
      content.definition
        ? `<div class="definition"><span>一句话定义</span><p>${escapeHtml(content.definition)}</p></div>`
        : ''
    }
    ${
      content.hook
        ? `<div class="hook"><span>记忆钩子</span><p>${escapeHtml(content.hook)}</p></div>`
        : ''
    }
    ${
      content.points?.length
        ? `<details class="reveal"><summary>翻面看要点 <i>${content.points.length} 条</i></summary><ul>${list(
            content.points
          )}</ul></details>`
        : ''
    }
  </section>`;

const checklistBody = (content: CardContent) => `
  <section class="card-face">
    <span class="tag">${escapeHtml(CARD_TONES.checklist.tag)}</span>
    <h2>${escapeHtml(content.title)}</h2>
    ${content.subtitle ? `<p class="lead">${escapeHtml(content.subtitle)}</p>` : ''}
    <ul class="check-list">
      ${(content.points ?? [])
        .map(
          (point, index) =>
            `<li><label><input type="checkbox" /><span class="tick"></span><strong>${escapeHtml(
              point
            )}</strong></label>${
              content.criteria?.[index]
                ? `<small>${escapeHtml(content.criteria[index])}</small>`
                : ''
            }</li>`
        )
        .join('')}
    </ul>
    <div class="check-state" id="checkState">勾选全部条目后，这里会显示达标提示。</div>
  </section>`;

const counterexampleBody = (content: CardContent) => `
  <section class="card-face">
    <span class="tag">${escapeHtml(CARD_TONES.counterexample.tag)}</span>
    <h2>${escapeHtml(content.title)}</h2>
    ${content.subtitle ? `<p class="lead">${escapeHtml(content.subtitle)}</p>` : ''}
    <div class="versus">
      <div class="side is-myth">
        <span>常见误区</span>
        <p>${escapeHtml(content.myth ?? '')}</p>
      </div>
      <div class="side is-fact">
        <span>事实</span>
        <p>${escapeHtml(content.fact ?? '')}</p>
      </div>
    </div>
    ${
      content.question
        ? `<details class="reveal"><summary>判别问句 <i>点击自测</i></summary>
            <p class="question">${escapeHtml(content.question)}</p>
            ${content.answer ? `<p class="answer">${escapeHtml(content.answer)}</p>` : ''}
          </details>`
        : ''
    }
  </section>`;

const challengeBody = (content: CardContent) => `
  <section class="card-face">
    <span class="tag">${escapeHtml(CARD_TONES.challenge.tag)}</span>
    <h2>${escapeHtml(content.title)}</h2>
    ${content.subtitle ? `<p class="lead">${escapeHtml(content.subtitle)}</p>` : ''}
    <div class="task"><span>任务</span><p>${escapeHtml(content.question ?? '')}</p></div>
    ${
      content.hints?.length
        ? `<details class="reveal"><summary>需要提示 <i>${content.hints.length} 级</i></summary><ol>${list(
            content.hints
          )}</ol></details>`
        : ''
    }
    ${
      content.answer
        ? `<details class="reveal"><summary>参考答案 <i>核对后收起</i></summary><p class="answer">${escapeHtml(
            content.answer
          )}</p></details>`
        : ''
    }
    ${
      content.criteria?.length
        ? `<div class="criteria"><span>自评标准</span><ul>${list(content.criteria)}</ul></div>`
        : ''
    }
  </section>`;

const quizBody = (content: CardContent) => `
  <section class="card-face">
    <span class="tag">${escapeHtml(CARD_TONES.quiz.tag)}</span>
    <h2>${escapeHtml(content.title)}</h2>
    ${content.subtitle ? `<p class="lead">${escapeHtml(content.subtitle)}</p>` : ''}
    <p class="question">${escapeHtml(content.question ?? '')}</p>
    <div class="options" id="options">
      ${(content.options ?? [])
        .map(
          (option, index) =>
            `<button type="button" class="option" data-correct="${option.correct ? '1' : '0'}" data-index="${index}">
              <span>${escapeHtml(option.label)}</span><p>${escapeHtml(option.text)}</p>
            </button>`
        )
        .join('')}
    </div>
    <div class="verdict" id="verdict"></div>
    ${
      content.explain
        ? `<details class="reveal"><summary>为什么 <i>点击查看解析</i></summary><p class="answer">${escapeHtml(
            content.explain
          )}</p></details>`
        : ''
    }
  </section>`;

const BODY_BY_KIND: Record<string, (content: CardContent) => string> = {
  flashcard: flashcardBody,
  checklist: checklistBody,
  counterexample: counterexampleBody,
  challenge: challengeBody,
  quiz: quizBody
};

const CARD_STYLE = `
*{box-sizing:border-box}
html,body{margin:0;background:#f7f8fa;color:#16202b;font-family:"Noto Sans SC","Microsoft YaHei","PingFang SC",Arial,sans-serif}
body{padding:clamp(14px,3vw,30px)}
.card{max-width:960px;margin:0 auto}
.card-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1px solid #e3e7eb;padding-bottom:14px;margin-bottom:18px}
.card-head strong{font-size:13px;color:#16202b}
.card-head span{font-size:11px;color:#939ea8}
.card-face{background:#fff;border:1px solid #e3e7eb;border-radius:12px;padding:26px 28px;box-shadow:0 12px 34px rgba(16,24,32,.06)}
.tag{display:inline-block;padding:3px 9px;border-radius:99px;background:var(--soft);color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.14em}
.card-face h2{margin:12px 0 6px;font-size:clamp(20px,3vw,30px);line-height:1.25;letter-spacing:0}
.lead{margin:0 0 16px;color:#64707c;font-size:14px;line-height:1.7}
.definition,.hook,.task{border-radius:9px;padding:14px 16px;margin-bottom:12px}
.definition{background:#f4f7fa;border-left:4px solid var(--accent)}
.hook{background:var(--soft)}
.task{background:#f4f7fa;border-left:4px solid var(--accent)}
.definition span,.hook span,.task span,.criteria span{display:block;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.14em;margin-bottom:6px}
.definition p,.hook p,.task p{margin:0;font-size:15px;line-height:1.7;color:#2b3641}
.reveal{border:1px solid #e3e7eb;border-radius:9px;margin-top:12px;overflow:hidden}
.reveal summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;font-weight:600;color:#16202b}
.reveal summary::-webkit-details-marker{display:none}
.reveal summary i{font-style:normal;font-size:11px;color:#939ea8}
.reveal[open] summary{border-bottom:1px solid #eef1f4;background:#fafbfc}
.reveal ul,.reveal ol{margin:0;padding:14px 18px 16px 34px}
.reveal li{font-size:14px;line-height:1.8;color:#2b3641}
.reveal p.question{margin:14px 18px 0;font-size:15px;line-height:1.7;color:#16202b}
.reveal p.answer{margin:10px 18px 16px;font-size:14px;line-height:1.75;color:#2b3641}
.check-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.check-list li{border:1px solid #e3e7eb;border-radius:9px;padding:12px 14px;background:#fff}
.check-list label{display:flex;align-items:flex-start;gap:11px;cursor:pointer}
.check-list input{position:absolute;opacity:0;pointer-events:none}
.tick{width:20px;height:20px;flex:none;margin-top:2px;border:1.5px solid #c8d0d8;border-radius:5px;position:relative;background:#fff}
.check-list input:checked + .tick{background:var(--accent);border-color:var(--accent)}
.check-list input:checked + .tick:after{content:"";position:absolute;left:6px;top:3px;width:6px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.check-list input:checked ~ strong{color:#939ea8;text-decoration:line-through}
.check-list strong{font-size:15px;font-weight:600;line-height:1.5;color:#16202b}
.check-list small{display:block;margin-top:6px;padding-left:31px;color:#939ea8;font-size:12px;line-height:1.6}
.check-state{margin-top:14px;padding:12px 14px;border-radius:9px;background:#f4f7fa;color:#64707c;font-size:13px;line-height:1.6}
.check-state.is-done{background:var(--soft);color:var(--accent);font-weight:600}
.versus{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.side{border-radius:10px;padding:16px 18px;border:1px solid #e3e7eb}
.side span{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;margin-bottom:8px}
.side p{margin:0;font-size:14px;line-height:1.75;color:#2b3641}
.is-myth{background:#fdf1ee;border-color:#f0d3ca}
.is-myth span{color:#a2452f}
.is-fact{background:#eaf4f2;border-color:#cfe4e0}
.is-fact span{color:#0e6f63}
.criteria{margin-top:14px;padding:14px 16px;border-radius:9px;background:#f4f7fa}
.criteria ul{margin:0;padding-left:18px}
.criteria li{font-size:13px;line-height:1.75;color:#2b3641}
.options{display:grid;gap:10px;margin-top:6px}
.option{width:100%;display:flex;align-items:flex-start;gap:12px;padding:13px 15px;text-align:left;background:#fff;border:1px solid #e3e7eb;border-radius:9px;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.option:hover{border-color:#c3ccd4}
.option span{width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d5dce2;border-radius:50%;font-size:12px;font-weight:700;color:#64707c}
.option p{margin:0;font-size:14.5px;line-height:1.6;color:#2b3641}
.option.is-correct{border-color:#1f7a6d;background:#eaf4f2}
.option.is-correct span{border-color:#1f7a6d;background:#1f7a6d;color:#fff}
.option.is-wrong{border-color:#a2452f;background:#fdf1ee}
.option.is-wrong span{border-color:#a2452f;color:#a2452f}
.option.is-muted{opacity:.55}
.verdict{margin-top:12px;font-size:14px;line-height:1.7;color:#64707c;min-height:22px}
.verdict.is-right{color:#0e6f63;font-weight:600}
.verdict.is-wrong{color:#a2452f;font-weight:600}
@media(max-width:720px){.versus{grid-template-columns:1fr}}
`;

const CARD_SCRIPT = `
const options = document.getElementById('options');
if (options) {
  const verdict = document.getElementById('verdict');
  options.addEventListener('click', (event) => {
    const button = event.target.closest('.option');
    if (!button) return;
    const correct = button.dataset.correct === '1';
    options.querySelectorAll('.option').forEach((item) => {
      item.classList.remove('is-correct', 'is-wrong', 'is-muted');
      if (item === button) {
        item.classList.add(correct ? 'is-correct' : 'is-wrong');
      } else if (item.dataset.correct === '1') {
        item.classList.add('is-correct');
      } else {
        item.classList.add('is-muted');
      }
    });
    verdict.className = 'verdict ' + (correct ? 'is-right' : 'is-wrong');
    verdict.textContent = correct ? '答对了，这个判断成立。' : '再想想：正确答案已标出，注意题干里的限定条件。';
  });
}
const checkList = document.querySelector('.check-list');
if (checkList) {
  const state = document.getElementById('checkState');
  const boxes = Array.from(checkList.querySelectorAll('input[type=checkbox]'));
  const sync = () => {
    const done = boxes.filter((box) => box.checked).length;
    const all = boxes.length > 0 && done === boxes.length;
    state.className = 'check-state' + (all ? ' is-done' : '');
    state.textContent = all
      ? '全部达标：这一节的概念你已经能自己说清楚、举例说明、指出边界。'
      : '已勾选 ' + done + ' / ' + boxes.length + ' 条，勾选全部条目后这里会显示达标提示。';
  };
  boxes.forEach((box) => box.addEventListener('change', sync));
  sync();
}
`;

/** Renders one interactive card as a self-contained HTML document. */
export function renderInteractiveCard(
  project: CourseProject,
  kind: MediaKind,
  content: CardContent
): string {
  const tone = CARD_TONES[kind] ?? CARD_TONES['concept-card'];
  const render = BODY_BY_KIND[kind] ?? BODY_BY_KIND.flashcard;
  const course = [project.subject, project.grade, project.topic].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(content.title)} · ${escapeHtml(project.title)}</title>
<style>:root{--accent:${tone.accent};--soft:${tone.soft}}${CARD_STYLE}</style>
</head>
<body>
<div class="card">
  <div class="card-head">
    <strong>${escapeHtml(project.title)}</strong>
    <span>${escapeHtml(course)}</span>
  </div>
  ${render(content)}
</div>
<script>${CARD_SCRIPT}</script>
</body>
</html>`;
}

const firstSentence = (text: string) => {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  const index = normalized.search(/[。！？!?]/);
  return index >= 0 ? normalized.slice(0, index + 1) : normalized.slice(0, 90);
};

/**
 * Local content for an interactive card. The agent can refine the same shape
 * later; this keeps every card meaningful even without a model in the loop.
 */
export function localCardContent(
  project: CourseProject,
  kind: MediaKind,
  sectionId?: string
): CardContent {
  const script = project.script;
  if (!script) throw new Error('请先生成并确认讲稿');
  const sections = script.sections;
  const section = sections.find((item) => item.id === sectionId) ?? sections[0];
  const concept = script.keywords[0] ?? section?.title ?? '核心概念';
  const definition = firstSentence(section?.narration ?? script.thesis);
  switch (kind) {
    case 'flashcard':
      return {
        title: section && section.title.length <= 14 ? section.title : concept,
        subtitle: section?.purpose,
        definition,
        hook: section?.valueNote,
        points: script.objectives.slice(0, 4)
      };
    case 'checklist':
      return {
        title: `学会了吗 · ${section?.title ?? concept}`,
        subtitle: '逐条自查，勾选你已经能做到的部分。',
        points: script.objectives.slice(0, 5),
        criteria: sections
          .slice(0, 5)
          .map((item) => `能用自己的话讲清「${item.title}」，并举一个例子`)
      };
    case 'counterexample':
      return {
        title: `别踩坑 · ${section?.title ?? concept}`,
        subtitle: '把常见误解和事实并排看一遍。',
        myth: `以为${concept}只是${definition.slice(0, 18)}，不用再追问条件。`,
        fact: definition,
        question: `如果有人说「${concept}就是这么简单，不用再判断条件」，你会怎么回应？`,
        answer: section?.purpose ?? script.thesis
      };
    case 'challenge':
      return {
        title: `迁移一下 · ${section?.title ?? concept}`,
        subtitle: '换一个情境，用这一节的方法再走一遍。',
        question: `请用「${section?.title ?? concept}」的方法，重新分析一个你熟悉但还没用过的情境，并写出你的判断依据。`,
        hints: [
          section?.purpose ?? script.thesis,
          script.thesis,
          `回看关键动作：${definition}`
        ],
        answer: script.summary,
        criteria: [
          '能说清你用的是哪一个关键动作',
          '能指出这个情境成立的条件与边界',
          '能给出一个反例，说明方法什么时候不适用'
        ]
      };
    default:
      return {
        title: concept,
        subtitle: section?.purpose,
        definition,
        points: script.objectives.slice(0, 4)
      };
  }
}
