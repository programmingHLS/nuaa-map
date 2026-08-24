import { useState, useRef, useCallback, useEffect } from 'react';
import type { MapTransform } from '../types';

// 最大缩放：底图 7168px 宽，×3 = 21504px，仍超过移动端合成层安全范围，
// 但比 ×4（28672px）低一档；配合 translate 钳制可显著降低移动端 GPU 内存压力，
// 避免频繁放大/缩放后合成层过大导致浏览器标签页闪退。
const MAX_SCALE = 3;
const ZOOM_SPEED_MOUSE = 0.0007;     // 鼠标滚轮速度（~7%/刻度）
const ZOOM_SPEED_TRACKPAD = 0.012;   // 触控板双指缩放（事件频率高，需较低系数）
const PINCH_DELTA_MAX = 50;          // 触控板 pinch 最大 deltaY：超过此值视为 Ctrl+滚轮
// pinch 距离突变阈值：第二指刚按下/中途重新放置时，两指距离相对上次记录突变，
// 若继续按旧基准计算会让缩放瞬间跳变（不跟手）。超出该范围时重置手势基准。
const PINCH_RESET_RATIO_MIN = 0.6;
const PINCH_RESET_RATIO_MAX = 1.7;

interface UseMapInteractionOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageSize: { width: number; height: number } | null;
}

/** 钳制变换，确保图片始终覆盖容器（拖拽不超出边界，不留白边） */
export function clampTransform(
  t: MapTransform,
  cw: number, ch: number,
  iw: number, ih: number,
): MapTransform {
  const maxX = 0;
  const minX = cw - iw * t.scale;
  const maxY = 0;
  const minY = ch - ih * t.scale;

  return {
    scale: t.scale,
    // 图片比容器窄时居中，否则钳制在边界内
    x: minX > maxX ? (cw - iw * t.scale) / 2 : Math.min(maxX, Math.max(minX, t.x)),
    y: minY > maxY ? (ch - ih * t.scale) / 2 : Math.min(maxY, Math.max(minY, t.y)),
  };
}

export function useMapInteraction({ containerRef, imageSize }: UseMapInteractionOptions) {
  const [transform, setTransform] = useState<MapTransform>({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // 用 ref 持有最新 transform，避免 touch 回调依赖 transform state 导致不必要重建
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const dragRef = useRef({
    active: false,
    startX: 0, startY: 0,
    startTx: 0, startTy: 0,
  });

  const pinchRef = useRef({
    lastDist: 0,
    startScale: 1, startX: 0, startY: 0,
    midX: 0, midY: 0,
  });

  /* 动态最小缩放 = 容器宽度 / 图片宽度（保证左右边界对齐窗口） */
  const getMinScale = useCallback(() => {
    const cw = containerRef.current?.clientWidth;
    if (!cw || cw === 0 || !imageSize) return 0.5;
    return cw / imageSize.width;
  }, [containerRef, imageSize]);

  /* 双击放大 */
  const lastTapRef = useRef(0);
  const DOUBLE_TAP_MS = 300;
  const handleDoubleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || !imageSize) return;
    const rect = container.getBoundingClientRect();
    const now = Date.now();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;

    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // 双击：以点击位置为中心放大
      setTransform(prev => {
        const targetScale = prev.scale >= 2 ? getMinScale() : Math.min(MAX_SCALE, prev.scale * 2);
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        const ratio = targetScale / prev.scale;
        return clampTransform(
          { scale: targetScale, x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y) },
          rect.width, rect.height, imageSize.width, imageSize.height,
        );
      });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [containerRef, imageSize, getMinScale]);

  /* ── 滚轮缩放（以鼠标位置为中心，钳制边界） ── */
  const handleWheel = useCallback((e: WheelEvent) => {
    // 触控手势活跃期间不处理滚轮事件：移动端 pinch 缩放时部分浏览器
    // （Android Chrome 等）会同时触发 touchmove 和 wheel 事件。
    // 若 handleWheel 调用 setTransform 触发 React 重渲染，会与
    // handleTouchMove 的直接 DOM 操控冲突，形成渲染风暴导致页面崩溃。
    if (dragRef.current.active || pinchRef.current.lastDist > 0) return;

    e.preventDefault();
    const container = containerRef.current;
    if (!container || !imageSize) return;

    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const cw = rect.width;
    const ch = rect.height;

    setTransform(prev => {
      const minScale = getMinScale();
      // Windows 触控板 pinch → ctrlKey=true, deltaY 很小（3-10）
      // Ctrl+鼠标滚轮 → ctrlKey=true, deltaY 很大（~100）
      // 用 deltaY 大小区分：小的才是触控板，大的当鼠标处理
      const isTrackpad = e.ctrlKey && Math.abs(e.deltaY) < PINCH_DELTA_MAX;
      const zoomSpeed = isTrackpad ? ZOOM_SPEED_TRACKPAD : ZOOM_SPEED_MOUSE;
      const delta = -e.deltaY * zoomSpeed;
      const newScale = Math.min(MAX_SCALE, Math.max(minScale, prev.scale + delta * prev.scale));
      const ratio = newScale / prev.scale;
      return clampTransform(
        { scale: newScale, x: cx - ratio * (cx - prev.x), y: cy - ratio * (cy - prev.y) },
        cw, ch, imageSize.width, imageSize.height,
      );
    });
  }, [containerRef, imageSize, getMinScale]);

  /* ── 鼠标拖拽（钳制边界） ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      startX: e.clientX, startY: e.clientY,
      startTx: transform.x, startTy: transform.y,
    };
    setIsDragging(true);
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return;
    const container = containerRef.current;
    if (!container || !imageSize) return;
    const rect = container.getBoundingClientRect();

    setTransform(prev =>
      clampTransform(
        {
          ...prev,
          x: dragRef.current.startTx + (e.clientX - dragRef.current.startX),
          y: dragRef.current.startTy + (e.clientY - dragRef.current.startY),
        },
        rect.width, rect.height, imageSize.width, imageSize.height,
      ),
    );
  }, [containerRef, imageSize]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    setIsDragging(false);
  }, []);

  /* ── 触摸（移动端拖拽 + 双指缩放，钳制边界） ── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const cur = transformRef.current;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragRef.current = {
        active: true,
        startX: t.clientX, startY: t.clientY,
        startTx: cur.x, startTy: cur.y,
      };
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      // 不重置 isDragging，保持 CSS transition 为 0s，避免 pinch 缩放时过渡动画抖动
      dragRef.current.active = false;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        lastDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        startScale: cur.scale,
        startX: cur.x, startY: cur.y,
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // 注意：此处不调用 e.preventDefault()。React 的合成 touch 事件监听器是 passive 的，
    // preventDefault 无效且会触发控制台警告；浏览器默认手势已由 CSS touch-action: none
    // 和 useEffect 中的原生 non-passive touchmove 监听双重拦截。
    const container = containerRef.current;
    if (!container || !imageSize) return;
    const rect = container.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const iw = imageSize.width;
    const ih = imageSize.height;

    const layer = container.querySelector('.map-layer') as HTMLElement | null;

    if (e.touches.length === 1 && dragRef.current.active) {
      const t = e.touches[0];
      const next = clampTransform(
        { scale: transformRef.current.scale, x: dragRef.current.startTx + (t.clientX - dragRef.current.startX), y: dragRef.current.startTy + (t.clientY - dragRef.current.startY) },
        cw, ch, iw, ih,
      );
      transformRef.current = next;
      if (layer) layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    } else if (e.touches.length === 2 && pinchRef.current.lastDist > 0) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / pinchRef.current.lastDist;

      // 距离突变（第二指刚按下 / 中途重新放置）：以当前状态重置手势基准，
      // 避免缩放瞬间跳变和频繁操作后的误差累积（transform 漂移）。
      if (ratio < PINCH_RESET_RATIO_MIN || ratio > PINCH_RESET_RATIO_MAX) {
        pinchRef.current = {
          lastDist: dist,
          startScale: transformRef.current.scale,
          startX: transformRef.current.x,
          startY: transformRef.current.y,
          midX: (t1.clientX + t2.clientX) / 2,
          midY: (t1.clientY + t2.clientY) / 2,
        };
        return;
      }

      const minScale = getMinScale();
      const newScale = Math.min(MAX_SCALE, Math.max(minScale, pinchRef.current.startScale * ratio));

      const focusX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const focusY = (t1.clientY + t2.clientY) / 2 - rect.top;
      const scaleRatio = newScale / pinchRef.current.startScale;

      const next = clampTransform(
        { scale: newScale, x: focusX - scaleRatio * (focusX - pinchRef.current.startX), y: focusY - scaleRatio * (focusY - pinchRef.current.startY) },
        cw, ch, iw, ih,
      );
      transformRef.current = next;
      if (layer) layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, [containerRef, imageSize, getMinScale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // e.touches 在 touchend 里是「仍停留在屏幕上的触点」，不是本次抬起的触点。
    // 双指 pinch 中抬起一指时剩余 1 指：必须把剩余单指重新初始化为拖拽起点，
    // 否则 pinchRef/dragRef 状态残留，剩余手指的移动完全无响应（缩放/拖拽不跟手）。
    const remaining = e.touches.length;
    if (remaining === 1) {
      if (pinchRef.current.lastDist > 0) {
        const t = e.touches[0];
        const cur = transformRef.current;
        dragRef.current = {
          active: true,
          startX: t.clientX, startY: t.clientY,
          startTx: cur.x, startTy: cur.y,
        };
        pinchRef.current.lastDist = 0;
        setIsDragging(true);
      }
      return;
    }
    if (remaining > 1) return;
    dragRef.current.active = false;
    pinchRef.current.lastDist = 0;
    setTransform(transformRef.current);
    setIsDragging(false);
  }, []);

  /* touchcancel：系统中断手势时强制复位，防止 ref 状态残留阻塞 wheel 事件；
     若系统仍保留一根手指（iOS 手势识别打断 pinch），同样转为拖拽起点 */
  const handleTouchCancel = useCallback((e: React.TouchEvent) => {
    const remaining = e.touches.length;
    if (remaining === 1 && pinchRef.current.lastDist > 0) {
      const t = e.touches[0];
      const cur = transformRef.current;
      dragRef.current = {
        active: true,
        startX: t.clientX, startY: t.clientY,
        startTx: cur.x, startTy: cur.y,
      };
      pinchRef.current.lastDist = 0;
      setIsDragging(true);
      return;
    }
    dragRef.current.active = false;
    pinchRef.current.lastDist = 0;
    setTransform(transformRef.current);
    setIsDragging(false);
  }, []);

  /* ── 适应屏幕：宽度适配，左右边界对齐窗口 ── */
  const resetTransform = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageSize) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;

    const fitScale = cw / imageSize.width;

    setTransform({
      scale: fitScale,
      x: 0,
      y: (ch - imageSize.height * fitScale) / 2,
    });
  }, [containerRef, imageSize]);

  // 全局 mouseup（鼠标拖出容器外也能结束拖拽）
  useEffect(() => {
    const up = () => { dragRef.current.active = false; setIsDragging(false); };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // 注册滚轮事件（必须 non-passive 才能 preventDefault）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    // 移动端：强制 non-passive touchmove，阻止浏览器默认手势
    const preventTouchMove = (e: TouchEvent) => { e.preventDefault(); };
    el.addEventListener('touchmove', preventTouchMove, { passive: false });
    // iOS Safari：阻止 gesture 事件，防止浏览器自带缩放与自定义缩放冲突
    const preventGesture = (e: Event) => { e.preventDefault(); };
    el.addEventListener('gesturestart', preventGesture);
    el.addEventListener('gesturechange', preventGesture);
    el.addEventListener('gestureend', preventGesture);
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchmove', preventTouchMove);
      el.removeEventListener('gesturestart', preventGesture);
      el.removeEventListener('gesturechange', preventGesture);
      el.removeEventListener('gestureend', preventGesture);
    };
  }, [containerRef, handleWheel]);

  /* 触摸开始：同时处理拖拽 + 双击检测 */
  const handleTouchStartWithDoubleTap = useCallback((e: React.TouchEvent) => {
    handleTouchStart(e);
    handleDoubleTap(e);
  }, [handleTouchStart, handleDoubleTap]);

  return {
    transform,
    setTransform,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onTouchStart: handleTouchStartWithDoubleTap,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
      onDoubleClick: handleDoubleTap,
    },
    resetTransform,
  };
}
