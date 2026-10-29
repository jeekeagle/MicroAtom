import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Brain,
  Check,
  GraduationCap,
  LoaderCircle,
  Save,
  School,
  Sparkles,
  UserRound
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { TeacherMemory } from '../types';
import { Button } from '../components/ui';

const cloneMemory = (memory: TeacherMemory): TeacherMemory => ({ ...memory });

export function MemoryPage() {
  const { data, refresh, showToast } = useApp();
  const [form, setForm] = useState<TeacherMemory | null>(() =>
    data ? cloneMemory(data.memory) : null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(cloneMemory(data.memory));
  }, [data?.memory]);

  const changed = useMemo(() => {
    if (!data || !form) return false;
    const { updatedAt: _left, ...current } = data.memory;
    const { updatedAt: _right, ...draft } = form;
    return JSON.stringify(current) !== JSON.stringify(draft);
  }, [data, form]);

  if (!data || !form) return null;

  const set = <K extends keyof TeacherMemory>(key: K, value: TeacherMemory[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    if (!form.name.trim()) {
      showToast('请填写教师姓名', 'error');
      return;
    }
    setSaving(true);
    try {
      const next = await api.updateMemory(form);
      setForm(cloneMemory(next));
      await refresh();
      showToast('教师记忆已保存，下一次生成会使用这份档案');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '记忆保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initial = form.name.trim().slice(0, 1) || '师';

  return (
    <div className="page memory-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">TEACHER MEMORY / 系统级记忆</span>
          <h1>教师记忆</h1>
          <p>
            这里维护的是长期有效的教学档案。讲稿生成、语音整理与新课程默认值都会读取它，
            而不是每次重新询问。
          </p>
        </div>
        <Button
          variant="primary"
          icon={saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
          loading={saving}
          disabled={!changed}
          onClick={() => void save()}
        >
          {changed ? '保存记忆' : '已保存'}
        </Button>
      </div>

      <div className="memory-layout">
        <aside className="memory-profile">
          <span className="memory-avatar">{initial}</span>
          <strong>{form.name || '未填写姓名'}</strong>
          <small>{form.school || '未填写学校'}</small>
          <div className="memory-profile-facts">
            <div>
              <GraduationCap size={15} />
              <span>
                {form.grade || '未设置学段'} · {form.subject || '未设置学科'}
              </span>
            </div>
            <div>
              <BookOpenCheck size={15} />
              <span>{form.yearsExperience || 0} 年备课经验</span>
            </div>
          </div>
          <div className="memory-injection">
            <span className="eyebrow">MEMORY INJECTION</span>
            <p>这份档案会被注入到：</p>
            <ul>
              <li>讲稿结构与口语风格</li>
              <li>学情判断与默认学段</li>
              <li>语音新建课程的信息整理</li>
            </ul>
          </div>
        </aside>

        <section className="memory-editor">
          <div className="memory-section">
            <div className="memory-section-head">
              <span className="section-icon">
                <UserRound size={17} />
              </span>
              <div>
                <strong>基础档案</strong>
                <small>用于确定课程语境与默认学科</small>
              </div>
            </div>
            <div className="form-grid two">
              <label className="field">
                <span>姓名</span>
                <input
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="例如：林老师"
                />
              </label>
              <label className="field">
                <span>学校</span>
                <div className="input-with-icon">
                  <School size={15} />
                  <input
                    value={form.school}
                    onChange={(event) => set('school', event.target.value)}
                    placeholder="例如：杭州市行知中学"
                  />
                </div>
              </label>
              <label className="field">
                <span>主要学科</span>
                <input
                  value={form.subject}
                  onChange={(event) => set('subject', event.target.value)}
                  placeholder="物理"
                />
              </label>
              <label className="field">
                <span>主要学段</span>
                <input
                  value={form.grade}
                  onChange={(event) => set('grade', event.target.value)}
                  placeholder="八年级"
                />
              </label>
              <label className="field">
                <span>教龄（年）</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.yearsExperience}
                  onChange={(event) =>
                    set('yearsExperience', Number(event.target.value) || 0)
                  }
                />
              </label>
            </div>
          </div>

          <div className="memory-section">
            <div className="memory-section-head">
              <span className="section-icon is-teal">
                <Sparkles size={17} />
              </span>
              <div>
                <strong>讲述风格</strong>
                <small>智能体会贴近这套表达习惯，但不会照抄档案原文</small>
              </div>
            </div>
            <label className="field">
              <span>常用风格</span>
              <textarea
                rows={3}
                value={form.teachingStyle}
                onChange={(event) => set('teachingStyle', event.target.value)}
                placeholder="例如：口语化、问题驱动，先给真实情境再收束概念"
              />
            </label>
          </div>

          <div className="memory-section">
            <div className="memory-section-head">
              <span className="section-icon is-gold">
                <Brain size={17} />
              </span>
              <div>
                <strong>经验与心得</strong>
                <small>写具体的学生反应、有效做法和反复踩过的坑</small>
              </div>
            </div>
            <label className="field">
              <span>备课经验</span>
              <textarea
                rows={5}
                value={form.experience}
                onChange={(event) => set('experience', event.target.value)}
                placeholder="你长期负责哪些课型、习惯怎样设计一节课？"
              />
            </label>
            <label className="field">
              <span>教学心得</span>
              <textarea
                rows={5}
                value={form.insights}
                onChange={(event) => set('insights', event.target.value)}
                placeholder="学生在哪些地方最容易卡住？什么做法真正有效？"
              />
            </label>
          </div>

          <div className="memory-savebar">
            <span>
              {changed ? (
                <>
                  <span className="memory-dirty-dot" />
                  有未保存的修改
                </>
              ) : (
                <>
                  <Check size={14} />
                  记忆已同步
                </>
              )}
            </span>
            <Button
              variant="primary"
              icon={<Save size={16} />}
              loading={saving}
              disabled={!changed}
              onClick={() => void save()}
            >
              保存记忆
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
