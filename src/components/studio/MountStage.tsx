import { Blocks, Clapperboard, Maximize2, MonitorPlay } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { MediaKind } from '../../types';
import { CourseComposer } from '../../pages/CourseComposerPage';
import { Button } from '../ui';
import type { StageProps } from './types';

/** 和导出页、编辑台用的是同一套判定：这几类卡默认「停一下看」。 */
const HOLD_KINDS: MediaKind[] = ['quiz', 'checklist', 'challenge', 'counterexample'];

export function MountStage({ project, onProject, notify, onStage }: StageProps) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const mounts = project.mounts ?? [];
  const holdCount = mounts.filter(
    (mount) => mount.hold ?? HOLD_KINDS.includes(mount.mediaKind)
  ).length;
  const flowCount = mounts.length - holdCount;

  /** 直接构建并打开学习工作台：挂载改完后最想看的就是它。 */
  const openWorkbench = useCallback(async () => {
    setOpening(true);
    try {
      const result = await api.buildDelivery(project.id);
      onProject(result.project);
      if (result.delivery?.indexUrl) {
        window.open(result.delivery.indexUrl, '_blank', 'noopener');
      } else {
        notify('学习工作台已生成，但浏览器拦截了新窗口', 'info');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '学习工作台生成失败', 'error');
    } finally {
      setOpening(false);
    }
  }, [notify, onProject, project.id]);

  return (
    <div className="stage-page mount-stage">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className="stage-icon">
            <Blocks size={19} />
          </span>
          <div>
            <span className="eyebrow">MOUNT & INTERACTION / 05</span>
            <h2>挂载与交互</h2>
            <p>
              成片已经封版，这一环只往上挂东西：把概念卡、问答、自检清单钉到关键时间点，
              决定哪一张停下来看、哪一张边看边讲。
            </p>
          </div>
        </div>
        <div className="stage-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<Maximize2 size={15} />}
            onClick={() => navigate(`/projects/${project.id}/course`)}
          >
            独立编辑台
          </Button>
        </div>
      </div>

      <div className="mount-summary">
        <div className="mount-summary-cell">
          <span>已挂载</span>
          <strong>{mounts.length}</strong>
          <small>张卡片</small>
        </div>
        <div className="mount-summary-cell">
          <span>停一下看</span>
          <strong className="is-hold">{holdCount}</strong>
          <small>视频停住再讲</small>
        </div>
        <div className="mount-summary-cell">
          <span>边看边讲</span>
          <strong className="is-flow">{flowCount}</strong>
          <small>画面照走</small>
        </div>
        <p className="mount-summary-note">
          挂载不会改动已渲染的 MP4，它沉淀成 HTML 学习页与学习工作台；改完记得重新生成一次交付包。
        </p>
      </div>

      <div className="mount-stage-body">
        <CourseComposer projectId={project.id} embedded onProject={onProject} />
      </div>

      <div className="stage-actionbar">
        <div className="actionbar-status">
          <span className={mounts.length ? 'is-ready' : 'is-draft'}>
            {mounts.length ? <Blocks size={13} /> : <Clapperboard size={13} />}
            {mounts.length ? `已挂载 ${mounts.length} 张卡片` : '还没有挂载任何卡片'}
          </span>
          <small>
            {mounts.length
              ? '时间轴上的方块点会停住视频，圆点不会。'
              : '从右侧介质库挑一张卡，或在时间轴上直接生成。'}
          </small>
        </div>
        <div className="stage-actionbar-buttons">
          <Button
            variant="secondary"
            icon={<Clapperboard size={16} />}
            onClick={() => onStage('render')}
          >
            返回成片
          </Button>
          <Button
            variant="primary"
            icon={<MonitorPlay size={16} />}
            loading={opening}
            disabled={!mounts.length}
            onClick={() => void openWorkbench()}
          >
            生成并打开学习工作台
          </Button>
        </div>
      </div>
    </div>
  );
}
