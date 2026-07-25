# 核心前端组件使用指南

> 面向新成员快速上手，读完就能改。配合 `frontend/src/types/index.ts` 类型定义食用更佳。

---

## 组件总览

| 组件 | 路径 | 职责 | 关键依赖 |
|------|------|------|----------|
| `MapView` | `components/MapView/` | 地图容器，缩放/拖拽/热区点击 | `useMapInteraction` |
| `HotspotLayer` | `components/MapView/HotspotLayer` | 渲染建筑热区标记点 | 无 |
| `BuildingPopover` | `components/BuildingPopover/` | 建筑详情弹窗 + 周边 + AI 问答 | 无 |
| `ChatWidget` | `components/ChatWidget/` | 右下角 AI 浮动聊天 | 无 |
| `FreshmanWindow` | `components/FreshmanWindow/` | 新生问答窗口（预设 QA + 提问） | QA JSON 数据 |
| `Minimap` | `components/Minimap/` | 左下角缩略图导航 | 无 |
| `TopBar` | `components/TopBar/` | 顶部导航栏 + 搜索 | `utils/pinyin` |
| `SearchBar` | `components/SearchBar/` | 建筑搜索栏（移动端） | 无 |
| `ErrorBoundary` | `components/ErrorBoundary/` | 错误兜底，防白屏 | 无 |

---

## MapView — 地图容器

**文件**：`components/MapView/MapView.tsx`

### 用途
地图交互的核心容器。渲染地图底图（`<img>`），叠加建筑热区层（`HotspotLayer`），处理缩放/拖拽/点击事件。

### Props

```typescript
interface MapViewProps {
  buildings: Building[];              // 全部 36 栋建筑数据
  selectedBuilding: Building | null;  // 当前选中的建筑（null = 无弹窗）
  onBuildingClick: (data: BuildingClickData | null) => void;  // 点击建筑回调
  onMapStateChange?: (state: MapViewState) => void;           // 地图状态变化（供 Minimap 同步）
}
```

### 关键常量

```typescript
const MAP_SRC = '/tianmuhu-map.jpg';  // 底图路径，替换手绘地图时改这里
```

### 内部状态
- `imageMeta`：从 `img.naturalWidth/naturalHeight` 读取，**不硬编码尺寸**
- `transform`：`{ scale, x, y }`，由 `useMapInteraction` hook 管理
- `containerSize`：`ResizeObserver` 追踪容器尺寸

### 事件流
```
用户滚轮 → useMapInteraction → setTransform → CSS transform 更新层
用户拖拽 → useMapInteraction → setTransform → CSS transform 更新层
用户点击热区 → HotspotLayer.onBuildingClick → 父组件 setSelectedBuilding
```

### 新增建筑热区
在 `mock-buildings.json` 中添加建筑对象，包含 `hotspot: { x, y, width, height }`（像素坐标，以地图图片左上角为原点）。

---

## HotspotLayer — 热区层

**文件**：`components/MapView/HotspotLayer.tsx`

### 用途
在 MapView 内部渲染建筑的热区标记点（彩色圆点 + 脉冲动画）。

### Props

```typescript
interface HotspotLayerProps {
  buildings: Building[];
  imageWidth: number;        // 地图原图宽度（用于计算热区相对位置）
  imageHeight: number;       // 地图原图高度
  transform: MapTransform;   // 当前地图缩放/平移状态
  onBuildingClick: (data: BuildingClickData | null) => void;
  selectedBuildingId?: string;
  disabled?: boolean;        // 弹窗打开时禁用热区 hover
}
```

### 颜色映射
热区标记颜色根据 `building.category` 自动分配（分类色标体系，见 `types/index.ts`）。

---

## BuildingPopover — 建筑气泡弹窗

**文件**：`components/BuildingPopover/BuildingPopover.tsx`

### 用途
点击建筑热区后弹出的详情面板。包含：图片轮播、建筑描述、开放时间、周边设施横滑、内嵌 AI 问答。

### Props

```typescript
interface BuildingPopoverProps {
  building: Building;                  // 要展示的建筑
  screenX: number; screenY: number;    // 热区在视口上的屏幕坐标
  screenWidth: number; screenHeight: number;
  containerWidth: number; containerHeight: number;  // 地图容器尺寸（定位边界）
  buildings: Building[];               // 全部建筑（计算周边设施用）
  onClose: () => void;                 // 关闭弹窗
  onNavigateToBuilding: (building: Building) => void;  // 点击周边卡片跳转
}
```

### 定位逻辑
- 优先放建筑**上方**（`arrowDir = 'bottom'`）
- 上方空间不够 → 放**下方**（`arrowDir = 'top'`）
- 钳制在容器边界内（不超出屏幕）
- 移动端降级为**底部 Sheet**（`max-height: 65dvh`，上圆角）

### 关键常量

```typescript
const POPOVER_W = 300;       // 弹窗宽度
const POPOVER_MAX_H = 500;   // 弹窗最大高度
```

### 修改周边设施
周边设施根据建筑距离排序（取 `hotspot` 中心点的欧氏距离），前 4 栋显示。

---

## ChatWidget — AI 浮动聊天

**文件**：`components/ChatWidget/ChatWidget.tsx`

### 用途
右下角浮动聊天按钮，点击展开为对话面板。预留 `/api/chat` 接口。

### Props

```typescript
interface ChatWidgetProps {
  selectedBuilding: Building | null;
  onViewBuilding: (building: Building) => void;
}
```

### 交互
- 关闭时：圆形按钮（呼吸光晕动画）
- 打开时：对话面板（消息列表 + 输入框）
- 输入消息 → 调用 `/api/chat`（TODO）→ 流式展示回复

---

## FreshmanWindow — 新生问答窗口

**文件**：`components/FreshmanWindow/FreshmanWindow.tsx`

### 用途
新生 QA 面板。支持：提问（调用后端 API）、常见问题浏览、关键词搜索过滤。

### 数据来源
1. **预设 QA**：`frontend/src/data/qa-新生问答.json`（④组维护）
2. **后端 API**：`GET/POST /api/freshman-questions`
3. **本地缓存**：`localStorage`（key: `nuaa-map-freshman-qa`）

### 搜索过滤
- `searchTerm` 状态驱动 `filteredEntries`（`useMemo`）
- 同时匹配 `question` 和 `answer`，大小写不敏感
- 匹配关键词用 `<mark>` 高亮（`utils/highlight.ts`）

### 动画
- 面板入场/退场：CSS animation（`panelPhase` 状态机）
- 条目交错入场：`animation-delay` 递增

---

## Minimap — 缩略图导航

**文件**：`components/Minimap/Minimap.tsx`

### 用途
左下角缩略图，显示当前视野范围（蓝色半透明矩形），支持：
- **点击跳转**：点击缩略图任意位置，地图飞入
- **拖拽实时平移**：在缩略图上拖动，主地图跟随移动

### Props

```typescript
interface MinimapProps {
  imageSrc: string;
  imageWidth: number; imageHeight: number;
  transform: MapTransform;
  containerWidth: number; containerHeight: number;
  onNavigate: (t: MapTransform) => void;
}
```

### 实现
- 缩略图按比例缩小（约 150px 宽），X/Y 轴独立 scale
- 视野矩形：`{ left: -x/scale * miniScale, ... }`
- 拖拽通过 `window.dispatchEvent('map-navigate', ...)` 通信

---

## TopBar — 顶部导航栏 + 搜索

**文件**：`components/TopBar/TopBar.tsx`

### 用途
顶部栏：NUAA Logo + 标题 + 搜索框。搜索支持：
- **中文模糊匹配**（`fuzzyMatch`：字符按顺序出现即匹配）
- **拼音全拼**（`xuntian` → 巡天楼）
- **拼音首字母**（`xtl` → 巡天楼）
- **智能推荐**（搜索无结果时编辑距离推荐相似建筑名）

### Props

```typescript
interface TopBarProps {
  buildings: Building[];
  onSearchSelect: (building: Building) => void;
}
```

### 快捷键
- `Ctrl+K`：聚焦搜索框
- `↓↑`：结果列表导航
- `Enter`：选中当前高亮结果
- `Escape`：关闭搜索面板

---

## ErrorBoundary — 错误边界

**文件**：`components/ErrorBoundary/ErrorBoundary.tsx`

### 用途
React Class 组件，捕获子组件渲染错误，显示友好降级 UI 而非白屏。

### Props

```typescript
interface Props {
  children: ReactNode;
  name?: string;           // 区域名称（显示在降级 UI 中）
  fallback?: ReactNode;    // 自定义降级 UI
}
```

### 使用示例

```tsx
<ErrorBoundary name="地图">
  <MapView ... />
</ErrorBoundary>
```

降级 UI 包含：错误提示文字 + 错误信息 + 「重试」按钮（重置 error state）+ 「刷新页面」按钮（硬刷新）。

---

## 工具函数

| 文件 | 导出 | 用途 |
|------|------|------|
| `utils/pinyin.ts` | `toPinyin()`, `toPinyinAbbr()` | 中文→拼音（搜索用） |
| `utils/search.ts` | `levenshtein()`, `findSimilar()` | 编辑距离 + 相似推荐 |
| `utils/highlight.ts` | `highlightMatch()` | 关键词高亮（返回 JSX 片段） |

---

## 数据流速查

```
mock-buildings.json (36栋建筑 + 像素坐标)
  │
  ├── TopBar (搜索过滤) → onSearchSelect → setSelectedBuilding
  ├── MapView (底图渲染)
  │     ├── HotspotLayer (热区点击) → onBuildingClick → setSelectedBuilding
  │     └── BuildingPopover (详情 + 周边 + AI问答)
  ├── Minimap (缩略图 ← onMapStateChange)
  ├── ChatWidget (AI 聊天)
  └── FreshmanWindow (新生问答 ← qa-新生问答.json)
```

## 设计系统速查

- **主题**：航迹云 (Contrail)
- **设计令牌**：`frontend/src/index.css` 的 `:root {}` 中集中管理
- **CSS 变量**：`--color-blue-*`、`--glass-*`、`--gradient-sky`、`--ease-spring`、`--radius-*`
- **字体**：`--font-display`（标题）、`--font-body`（正文）
- **移动端**：`--touch-target-min`（44px）、`--mobile-gutter`（16px）、`--topbar-height-mobile`（56px）
