import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Building, ChatMessage, MapTransform } from '../../types';
import { CDN_BASE } from '../../config/cdn';
import { buildingSprites } from '../../data/building-sprites';
import { askRAG } from '../../services/rag';
import { Markdown } from '../Markdown';
import './BuildingPopover.css';

const resolveImageUrl = (path: string) =>
  path.startsWith('http') ? path : (import.meta.env.DEV ? path : `${CDN_BASE}${path}`);

interface BuildingPopoverProps {
  building: Building;
  screenX: number; screenY: number;
  screenWidth: number; screenHeight: number;
  containerWidth: number;
  containerHeight: number;
  buildings: Building[];
  onClose: () => void;
  onNavigateToBuilding: (building: Building) => void;
}

const CATEGORY_LABELS: Record<Building['category'], string> = {
  teaching: '教学楼', dormitory: '宿舍', canteen: '食堂',
  library: '图书馆', sports: '体育设施', service: '生活服务',
  gate: '校门', landscape: '景观', facility: '设施', other: '其他',
};

/* 分类色块 */
const CATEGORY_COLORS: Record<Building['category'], string> = {
  teaching: '#475569', dormitory: '#E8905A', canteen: '#F97316',
  library: '#6366F1', sports: '#10B981', service: '#0EA5E9',
  gate: '#78716C', landscape: '#14B8A6', facility: '#94A3B8', other: '#8B5CF6',
};

const POPOVER_W = 340;
const POPOVER_MAX_H = 580;
const POPOVER_MIN_H = 320;
const ARROW_H = 8;
const GAP = 10;
const TOPBAR_H = 60;
export const POPOVER_CENTER_OFFSET = 300;

/**
 * 计算将地图坐标点居中到视口中心的 MapTransform。
 * @param offsetY 可选的 Y 轴偏移（正=下移，给弹窗留空间），默认 0
 */
export function getCenterTransform(
  containerW: number, containerH: number,
  mapX: number, mapY: number,
  scale: number, offsetY = 0,
): MapTransform {
  return {
    scale,
    x: containerW / 2 - mapX * scale,
    y: containerH / 2 - mapY * scale + offsetY,
  };
}

/* 判断建筑当前开放状态 */
function getOpenStatus(openTime?: string): { open: boolean; label: string } | null {
  if (!openTime) return null;
  if (openTime === '全天开放' || openTime === '24小时') return { open: true, label: '开放中' };
  if (openTime.includes('急诊 24小时')) return { open: true, label: '急诊开放' };
  const hour = new Date().getHours();
  // 简单的时间段判断
  if (openTime.includes('早餐') && hour >= 6 && hour < 9) return { open: true, label: '营业中' };
  if (openTime.includes('午餐') && hour >= 11 && hour < 13) return { open: true, label: '营业中' };
  if (openTime.includes('晚餐') && hour >= 17 && hour < 20) return { open: true, label: '营业中' };
  if (hour >= 7 && hour <= 21) {
    if (openTime.includes('周一')) return { open: true, label: '开放中' };
  }
  // 默认判断：日间时间认为开放
  if (hour >= 7 && hour <= 21 && !openTime.includes('闭馆')) return { open: true, label: '开放中' };
  return { open: false, label: '已关闭' };
}

/* 计算周边最近建筑 */
function getNearby(current: Building, all: Building[], max = 4) {
  const cx = current.hotspot.x + current.hotspot.width / 2;
  const cy = current.hotspot.y + current.hotspot.height / 2;
  return all
    .filter(b => b.id !== current.id)
    .map(b => {
      const bx = b.hotspot.x + b.hotspot.width / 2;
      const by = b.hotspot.y + b.hotspot.height / 2;
      const dist = Math.round(Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2));
      return { building: b, distance: dist };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

/* 像素距离 → 估算步行时间 */
function walkTime(px: number): string {
  const minutes = Math.max(1, Math.round(px / 80)); // 80px ≈ 1分钟步行
  if (minutes <= 1) return '1分钟';
  if (minutes >= 20) return '>20分钟';
  return `${minutes}分钟`;
}

export function BuildingPopover({
  building, screenX, screenY, screenWidth, screenHeight,
  containerWidth, containerHeight, buildings, onClose, onNavigateToBuilding,
}: BuildingPopoverProps) {
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [brokenImgs, setBrokenImgs] = useState<Set<number>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nearbyRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const carouselTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const inputBlurGuard = useRef(false); // 防止移动端键盘收起时误关弹窗

  const openStatus = getOpenStatus(building.openTime);
  const nearby = getNearby(building, buildings);
  const catColor = CATEGORY_COLORS[building.category];

  /* 同一精灵图的兄弟建筑（用于切换） */
  const spriteSiblings = useMemo(() => {
    const sprite = buildingSprites.find(s => s.buildingIds.includes(building.id));
    if (!sprite || sprite.buildingIds.length <= 1) return null;
    return sprite.buildingIds
      .map(id => buildings.find(b => b.id === id))
      .filter(Boolean) as Building[];
  }, [building.id, buildings]);

  /* 图片列表：优先 images 数组，回退到单张 imageUrl */
  const imageList = building.images && building.images.length > 0
    ? building.images.map(resolveImageUrl)
    : building.imageUrl ? [resolveImageUrl(building.imageUrl)] : [];

  /* 切换建筑时重置轮播索引 + 损坏图片状态 + 滚动到顶部 + 清空聊天 */
  useEffect(() => {
    setCarouselIdx(0);
    setBrokenImgs(new Set());
    setChatMsgs([]);
    setChatInput('');
    setChatLoading(false);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [building.id]);

  /* 自动轮播（3秒切换，手动翻页后重置计时） */
  const startCarouselTimer = useCallback(() => {
    clearInterval(carouselTimerRef.current);
    if (imageList.length <= 1) return;
    carouselTimerRef.current = setInterval(() => {
      setCarouselIdx(prev => (prev + 1) % imageList.length);
    }, 3000);
  }, [imageList.length]);

  useEffect(() => {
    startCarouselTimer();
    return () => clearInterval(carouselTimerRef.current);
  }, [startCarouselTimer, building.id]);

  const goPrev = () => {
    setCarouselIdx(prev => (prev - 1 + imageList.length) % imageList.length);
    startCarouselTimer();
  };
  const goNext = () => {
    setCarouselIdx(prev => (prev + 1) % imageList.length);
    startCarouselTimer();
  };

  /* 新消息到达时滚动聊天区域到底部（仅当有消息时，避免初始空状态触发滚动） */
  useEffect(() => {
    if (chatMsgs.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [chatMsgs]);
  /* 仅桌面端自动聚焦输入框，移动端聚焦会弹出键盘导致弹窗滚到底部 */
  useEffect(() => {
    if (window.innerWidth > 640) inputRef.current?.focus();
  }, []);
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.stopPropagation(); };
    // 拦截触摸事件防止穿透到地图（原生事件 + passive 不阻止滚动）
    const stopTouch = (e: TouchEvent) => { e.stopPropagation(); };
    el.addEventListener('wheel', onWheel);
    el.addEventListener('touchstart', stopTouch, { passive: true });
    el.addEventListener('touchmove', stopTouch, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', stopTouch);
      el.removeEventListener('touchmove', stopTouch);
    };
  }, []);

  /* 周边区域：垂直滚轮 → 水平滚动 */
  useEffect(() => {
    const el = nearbyRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY, behavior: 'smooth' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendQuestion = useCallback(() => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatMsgs(prev => [...prev, {
      id: `q-${Date.now()}`, role: 'user', content: text, timestamp: Date.now(),
    }]);
    setChatInput('');

    const doAsk = async () => {
      try {
        const resp = await askRAG(text, {
          buildingId: building.id,
          buildingName: building.name,
          buildingDescription: building.description,
        });
        setChatMsgs(prev => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant',
          content: resp.answer,
          timestamp: Date.now(),
        }]);
      } catch {
        setChatMsgs(prev => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant',
          content: '\u62b1\u6b49\uff0c\u667a\u80fd\u95ee\u7b54\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002',
          timestamp: Date.now(),
        }]);
      } finally {
        setChatLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    };

    setChatLoading(true);
    doAsk();
  }, [chatInput, chatLoading, building]);

  /* 定位：优先放上方，上方不够（含 TopBar 遮挡）则放下方 */
  const hotspotCX = screenX + screenWidth / 2;
  const hotspotTop = screenY;
  const hotspotBot = screenY + screenHeight;

  let anchorTop: number;
  let arrowDir: 'bottom' | 'top';
  let anchorAbove = false;
  let maxPopH = POPOVER_MAX_H;

  // 扣除 TopBar 后的上方可用空间
  const spaceAbove = hotspotTop - GAP - ARROW_H - TOPBAR_H;
  const spaceBelow = containerHeight > 0
    ? containerHeight - hotspotBot - GAP - ARROW_H
    : POPOVER_MAX_H;

  if (spaceAbove >= POPOVER_MAX_H) {
    // 上方够 → 放上方，完整高度
    anchorTop = hotspotTop - GAP - ARROW_H;
    arrowDir = 'bottom';
    anchorAbove = true;
  } else if (spaceBelow >= POPOVER_MAX_H) {
    // 上方不够、下方够 → 放下方，完整高度
    anchorTop = hotspotBot + GAP + ARROW_H;
    arrowDir = 'top';
  } else {
    // 两边都不够 → 哪边大放哪边，缩小弹窗但不低于最小高度
    if (spaceAbove >= spaceBelow) {
      anchorTop = Math.max(hotspotTop - GAP - ARROW_H, TOPBAR_H);
      arrowDir = 'bottom';
      anchorAbove = true;
      maxPopH = Math.max(spaceAbove, POPOVER_MIN_H);
    } else {
      anchorTop = hotspotBot + GAP + ARROW_H;
      arrowDir = 'top';
      maxPopH = Math.max(spaceBelow, POPOVER_MIN_H);
    }
  }

  // 钳制底部：弹窗不超出容器
  if (!anchorAbove && containerHeight > 0) {
    const maxBottom = containerHeight - 8;
    if (anchorTop + maxPopH > maxBottom) {
      maxPopH = Math.max(POPOVER_MIN_H, maxBottom - anchorTop);
    }
  }

  let popLeft = hotspotCX - POPOVER_W / 2;
  popLeft = Math.max(8, Math.min(popLeft, containerWidth - POPOVER_W - 8));
  const arrowOff = hotspotCX - (popLeft + POPOVER_W / 2);

  return (
    <>
      <div className="popover-backdrop"
        onPointerDown={(e) => {
          // 阻止穿透到背后的地标
          e.stopPropagation();
          e.preventDefault();
          if (inputBlurGuard.current) return;
          onClose();
        }}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      />
      <div
        className={`popover-anchor${anchorAbove ? ' popover-anchor--above' : ''}`}
        style={{ left: popLeft, top: anchorTop, width: POPOVER_W }}
      >
        <div
          ref={popoverRef}
          className="popover"
          style={{ minHeight: POPOVER_MIN_H, maxHeight: maxPopH }}
          role="dialog" aria-label={`${building.name} 详情`}
        >
          <div className={`popover-arrow popover-arrow--${arrowDir}`}
            style={{ left: `calc(50% + ${arrowOff}px)` }} />

          {/* 照片区：有图轮播，无图用分类色块 */}
          {imageList.length > 0 ? (
            <div className="popover-hero popover-hero--carousel">
              {/* 全部图片预加载，opacity 切换，切换无白闪 */}
              {imageList.map((src, i) => (
                brokenImgs.has(i) ? null : (
                  <img
                    key={i}
                    className={`popover-hero-img ${i === carouselIdx ? 'popover-hero-img--active' : ''}`}
                    src={src}
                    alt={`${building.name} 照片 ${i + 1}`}
                    onError={() => {
                      setBrokenImgs(prev => new Set(prev).add(i));
                      // 如果当前展示的就是损坏的图，跳到下一张
                      if (i === carouselIdx) {
                        setCarouselIdx(prev => (prev + 1) % imageList.length);
                      }
                    }}
                  />
                )))}
              {imageList.length > 1 && (
                <>
                  <button className="popover-carousel-btn popover-carousel-btn--prev"
                    onClick={goPrev} aria-label="上一张">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button className="popover-carousel-btn popover-carousel-btn--next"
                    onClick={goNext} aria-label="下一张">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  <div className="popover-carousel-dots">
                    {imageList.map((_, i) => (
                      <button
                        key={i}
                        className={`popover-carousel-dot ${i === carouselIdx ? 'popover-carousel-dot--active' : ''}`}
                        onClick={() => { setCarouselIdx(i); startCarouselTimer(); }}
                        aria-label={`第 ${i + 1} 张`}
                      />
                    ))}
                  </div>
                </>
              )}
              {openStatus && (
                <span className={`popover-status ${openStatus.open ? 'popover-status--open' : ''}`}>
                  <span className="popover-status-dot" />
                  {openStatus.label}
                </span>
              )}
            </div>
          ) : null}

          <div className="popover-header">
            {spriteSiblings && (
              <div className="popover-sprite-switch">
                <button className="popover-switch-btn" aria-label="上一个"
                  onClick={() => {
                    const idx = spriteSiblings.findIndex(b => b.id === building.id);
                    const prev = spriteSiblings[(idx - 1 + spriteSiblings.length) % spriteSiblings.length];
                    onNavigateToBuilding(prev);
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div>
                  <span className="popover-category" style={{ color: catColor }}>{CATEGORY_LABELS[building.category]}</span>
                  <h3 className="popover-name">{building.name}</h3>
                </div>
                <button className="popover-switch-btn" aria-label="下一个"
                  onClick={() => {
                    const idx = spriteSiblings.findIndex(b => b.id === building.id);
                    const next = spriteSiblings[(idx + 1) % spriteSiblings.length];
                    onNavigateToBuilding(next);
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            )}
            {!spriteSiblings && (
              <div>
                <span className="popover-category" style={{ color: catColor }}>{CATEGORY_LABELS[building.category]}</span>
                <h3 className="popover-name">{building.name}</h3>
              </div>
            )}
            <button className="popover-close" onClick={onClose} aria-label="关闭">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="popover-body" ref={bodyRef}>
            <p className="popover-desc">{building.description}</p>
            <div className="popover-meta">
              {building.openTime && (
                <div className="popover-meta-row">
                  <span className="popover-meta-label">开放时间</span>
                  <span>{building.openTime}</span>
                </div>
              )}
              {building.floors !== undefined && (
                <div className="popover-meta-row">
                  <span className="popover-meta-label">楼层</span>
                  <span>{building.floors > 0 ? `${building.floors} 层` : '—'}</span>
                </div>
              )}
            </div>
            {building.facilities && building.facilities.length > 0 && (
              <div className="popover-tags">
                {building.facilities.map(f => <span key={f} className="popover-tag">{f}</span>)}
              </div>
            )}

            {/* 周边设施 */}
            {nearby.length > 0 && (
              <div className="popover-nearby">
                <div className="popover-nearby-label">🚶 周边设施</div>
                <div className="popover-nearby-list" ref={nearbyRef}>
                  {nearby.map(({ building: nb, distance }) => (
                    <button
                      key={nb.id}
                      className="popover-nearby-card"
                      onClick={() => onNavigateToBuilding(nb)}
                      title={`步行约 ${walkTime(distance)}`}
                    >
                      <span className="popover-nearby-card-icon" style={{ background: CATEGORY_COLORS[nb.category] }} />
                      <span className="popover-nearby-card-info">
                        <span className="popover-nearby-card-name">{nb.name}</span>
                        <span className="popover-nearby-card-time">步行 {walkTime(distance)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 内嵌问答 */}
            <div className="popover-chat">
              <div className="popover-chat-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                关于{building.name}想问什么？
              </div>

              {chatMsgs.length > 0 && (
                <div className="popover-chat-msgs">
                  {chatMsgs.map(m => (
                    <div key={m.id} className={`popover-chat-msg ${m.role === 'user' ? 'popover-chat-msg--user' : ''}`}>
                      {m.role === 'assistant' ? <Markdown content={m.content} /> : m.content}
                    </div>
                  ))}
                  {chatLoading && <div className="popover-chat-msg popover-chat-typing">思考中…</div>}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div className="popover-chat-input-row">
                <input ref={inputRef} className="popover-chat-input" type="text"
                  placeholder={`问问关于${building.name}的问题…`}
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }}
                  onFocus={() => { inputBlurGuard.current = false; }}
                  onBlur={() => { inputBlurGuard.current = true; setTimeout(() => { inputBlurGuard.current = false; }, 300); }}
                  disabled={chatLoading} />
                <button className="popover-chat-send" onClick={sendQuestion}
                  disabled={!chatInput.trim() || chatLoading} aria-label="发送">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}