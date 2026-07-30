# NUAAMap — 南京航空航天大学天目湖校区智能地图

为南航天目湖校区新生及访客提供交互式校园地图与智能问答服务。

## 核心功能

- **手绘校园地图**：以手绘风格地图为底图展示天目湖校区全貌（当前开发阶段使用官方卫星底图）
- **建筑详情查询**：点击建筑热区查看名称、功能、开放时间等详细信息
- **智能问答助手**：新生可通过自然语言提问，获取校园相关信息（由④组 QA 知识库和建筑数据共同驱动）

## 团队分工

| 小组 | 成员 | 职责 |
|------|------|------|
| ① 地图图纸与美工 | 刘玉涵、陈顾云 | 手绘校园地图、UI/UX 设计 |
| ② 交互功能 | 刘楚江、薄天乙 | 前端交互逻辑、地图热区点击与信息展示 |
| ③ 平台搭建 | 罗羽彤、李桂聿、郑应楠 | 项目架构、部署与运维 |
| ④ 调研与数据收集 | 李睿、蒋荀莉、张聿修、王小雯 | 校园 QA 问答知识库 + 建筑信息采集 |
| ⑤ 智能体训练 | 胡德文、李睿、姜禹锡 | AI 问答模型/RAG 系统搭建与训练 |
| ⑥ 数据转换 | 杜明泽 | 手绘地图像素坐标标注与数据合并 |

## 前置要求

在开始之前，请确保你的开发环境满足以下条件：

- **[Node.js](https://nodejs.org/)** ≥ 18.x（推荐使用最新的 LTS 版本）
- **[Git](https://git-scm.com/)** ≥ 2.x
- 一个现代的代码编辑器（推荐 [VS Code](https://code.visualstudio.com/)）

> 💡 安装 Node.js 时会自动附带 npm 包管理器。可以通过以下命令确认安装成功：
> ```bash
> node --version   # 应输出 v18.x.x 或更高
> npm --version    # 应输出 9.x.x 或更高
> ```

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/programmingWTF/nuaa-map.git
cd nuaa-map

# 2. 进入前端目录
cd frontend

# 3. 安装项目依赖（首次运行必须执行）
npm install

# 4. 启动开发服务器
npm run dev
```

浏览器打开 http://localhost:5173 即可看到地图页面。

> [!WARNING]
> **常见问题**：如果直接执行 `npm run dev` 提示 `'vite' 不是内部或外部命令`，说明还没有安装依赖——请先运行 `npm install`（即上述第 3 步），再执行第 4 步。`node_modules/` 目录不会纳入 Git 版本控制，因此每次在新环境中 clone 仓库后都需要重新安装。

> 前端已完成：手绘地图底图 + 36 栋建筑精灵图热区 + 地图交互（缩放/拖拽）+ AI 聊天 + 新生问答 + 建筑搜索 + 缩略图导航。后端 RAG 服务已就绪（Express + 本地分词匹配 + DeepSeek LLM），同时支持 Cloudflare Pages Functions + D1 数据库部署。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 19 + TypeScript | 组件化开发，类型安全 |
| 构建工具 | Vite 8 | 极速 HMR 开发体验 |
| 样式方案 | CSS Custom Properties | 设计令牌体系，全局主题切换 |
| 地图方案 | 手绘扫描图 + CSS Transform | 不依赖 GIS 库，像素坐标热区叠加 |
| 后端 API | Node.js Express | RESTful API，RAG 检索增强生成 |
| AI/智能体 | DeepSeek API + 本地分词匹配 | QA 知识库检索 + LLM 流式回复 |
| 边缘函数 | Cloudflare Pages Functions + D1 | 线上部署方案的 Chat/QA API |
| 数据格式 | JSON | 建筑信息 + QA 知识库，统一 JSON Schema |

## 前端架构

```
frontend/src/
├── components/
│   ├── TopBar/           # 顶部导航栏（Logo + 搜索入口）
│   ├── SearchBar/        # 建筑搜索栏（支持空间搜索）
│   ├── MapView/          # 地图容器（缩放/拖拽）+ 热区层
│   │   └── HotspotLayer  # 建筑标记（航路点风格，脉冲发光动画）
│   ├── BuildingPopover/  # 建筑气泡弹窗（内嵌建筑专属AI问答）
│   ├── ChatWidget/       # AI 浮动聊天组件（呼吸光晕按钮）
│   ├── FreshmanWindow/   # 新生问答窗口（航迹云主题动画）
│   └── Minimap/          # 缩略图导航（左下角，支持拖拽实时平移）
├── hooks/
│   └── useMapInteraction # 地图交互 Hook（滚轮/捏合缩放、拖拽平移）
├── types/                # TypeScript 类型定义
└── data/                 # 建筑数据（36栋真实天目湖建筑 + 真实像素坐标）+ QA 知识库
```

## 文档导航

| 文档 | 内容 |
|------|------|
| [团队协作规范](CONTRIBUTING.md) | 分支策略、提交规范、跨组接口 |
| [团队职责](docs/team.md) | 各组详细职责与对接关系 |
| [GitHub 协作入门指南](docs/github-guide.md) | 零基础学 Git/GitHub，从安装到 PR |
| [标签体系说明](docs/labels.md) | Issue/PR 标签分类与王者荣耀段位评级 |
| [Bot 自动化系统](docs/bot-automation.md) | GitHub Bot 自动化管理（自动标签、过时清理、AI 分类） |
| [AI 工具使用指南](AGENTS.md) | 各组如何用 AI Agent 提效 |
| [AI 自动化协作系统规格](ai-automation-spec.md) | Bot 系统技术规格与部署方案 |
| [项目规则书](CLAUDE.md) | AI 自动遵守的项目规范与架构 |
| [部署配置](#部署) | Docker 部署、自动 CI/CD、部署文件说明 |
| [QA 知识库模板](docs/templates/qa-knowledge.json) | ④组：问答数据模板 |
| [建筑信息模板](docs/templates/building-info.json) | ④组：建筑信息模板 |

## 常用命令

### 前端

```bash
cd frontend

npm run dev      # 启动开发服务器（热更新）
npm run build    # 生产构建
npm run preview  # 预览生产构建
```

### 后端（RAG 问答服务）

```bash
cd backend

cp .env.example .env    # 创建环境配置（首次运行）
# 编辑 .env，填入 LLM_API_KEY

npm install             # 安装依赖（首次运行）
npm run dev             # 启动后端（端口 3000，文件变更自动重启）
```

> [!NOTE]
> 后端依赖 `backend/data/` 下的 QA 知识库和建筑数据，与前端共享同一数据源。
> 如果不配置 `LLM_API_KEY`，后端仍可启动，但 AI 问答会降级为本地关键词匹配。
> 前端开发时设置 `VITE_RAG_API_URL=http://localhost:3000`（`frontend/.env.local`）即可对接本地后端。

## 部署

本项目通过 Docker 部署在内网 NAS 服务器上，由 GitHub Actions 驱动自动部署。

| 配置项 | 值 |
|--------|-----|
| 服务器 | `192.168.0.150`（内网） |
| 部署路径 | `/vol1/1000/Docker/NUAAMap/` |
| 服务端口 | `3100` |
| 外网访问 | Cloudflare Tunnel |

### 自动部署流程

```
main 分支 push → GitHub Actions → SSH 到服务器
    → git pull origin main → docker compose up -d --build
```

### ⚠️ 部署文件（禁止随意修改）

> [!WARNING]
> 以下文件直接关联生产环境自动部署，**非管理员请勿修改**。如需变更，必须同步更新服务器上的对应配置。

| 文件 | 用途 |
|------|------|
| `Dockerfile` | Docker 多阶段构建（Node.js 编译 → Nginx 静态服务） |
| `docker-compose.yml` | Docker 服务编排（端口 3100 → 容器 80） |
| `.dockerignore` | Docker 构建上下文排除规则 |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署工作流 |
