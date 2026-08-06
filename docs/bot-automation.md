# Bot 自动化系统

NUAAMap 项目使用 GitHub Actions 和自定义 Bot 脚本实现 Issue/PR 的自动化管理，减少人工维护成本。

## 系统组成

| 组件 | 位置 | 功能 |
|------|------|------|
| **自动打标签** | `.github/workflows/bot-labels.yml` | 根据 PR 修改的文件路径自动添加中文标签 |
| **过时管理** | `.github/workflows/bot-stale.yml` | 自动标记和关闭长期不活跃的 Issue |
| **AI 维护 Bot** | `scripts/bot/sweep.mjs` | 使用 AI 对 Issue/PR 进行智能分类、评估和标签管理 |

---

## 1. 自动打标签（bot-labels.yml）

### 触发条件

- PR 创建时（`opened`）
- PR 更新时（`synchronize`）

### 工作原理

使用 GitHub 官方的 `actions/labeler@v5`，根据 PR 修改的文件路径自动添加对应的中文标签（如 `小组：①手绘地图`、`小组：②交互功能` 等）。

**纯确定性规则，无需 AI 调用。**

### 配置

标签规则定义在仓库根目录的 `.github/labeler.yml`（如果存在）。

---

## 2. 过时管理（bot-stale.yml）

### 触发条件

- 定时任务：每天凌晨 3:30（UTC）
- 手动触发：`workflow_dispatch`

### 工作流程

```
Issue 30 天无活动 → 标记「状态：已过时」+ 发送提醒
    ↓
再过 7 天无活动 → 自动关闭 Issue
```

### 豁免规则

带有以下标签的 Issue 不会被标记为过时：
- `优先级：紧急`
- `优先级：高`
- `状态：进行中`

### 配置参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `days-before-stale` | 30 | 多少天无活动后标记为过时 |
| `days-before-close` | 7 | 标记过时后多少天自动关闭 |
| `days-before-pr-stale` | -1 | 不对 PR 应用过时规则（-1 = 禁用） |
| `operations-per-run` | 30 | 每次运行最多处理 30 个 Issue |

---

## 3. AI 维护 Bot（sweep.mjs）

### 功能

模仿 [OpenClaw ClawSweeper](https://github.com/openclaw/openclaw) 风格，使用 AI 对 Issue 和 PR 进行：
- **智能分类**：自动识别类型（Bug / 功能请求 / 文档 / 设计优化 / 问题咨询）
- **规模评估**：XS / S / M / L / XL
- **优先级评估**：P0（紧急）/ P1（高）/ P2（中）/ P3（低）
- **质量评级**：使用**王者荣耀段位**系统（倔强青铜 → 秩序白银 → 荣耀黄金 → 永恒钻石 → 至尊星耀 → 最强王者）
- **自动回复**：根据评估结果生成中文评论

### 部署位置

**NAS 服务器**（内网 `192.168.0.150`），通过 EasyConnect VPN 访问南航 DeepSeek API。

### 运行方式

```bash
# 日常维护（处理最近的 Issue/PR）
GH_TOKEN=ghp_xxx DEEPSEEK_KEY=sk-xxx node scripts/bot/sweep.mjs daily

# 回填历史数据（处理所有未分类的 Issue/PR）
GH_TOKEN=ghp_xxx DEEPSEEK_KEY=sk-xxx node scripts/bot/sweep.mjs backfill
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `GH_TOKEN` | GitHub Personal Access Token（需要 `repo` 权限） |
| `DEEPSEEK_KEY` | 南航 DeepSeek API Key（从 `token.nuaa.edu.cn` 获取） |

### AI 模型

- **API 端点**：`https://token.nuaa.edu.cn/v1/chat/completions`（OpenAI 兼容接口）
- **模型**：`glm-5.2`（2026-07-19 从 `deepseek-v4-pro` 切换）
- **代理**：通过 EasyConnect SOCKS5 代理访问（NAS 部署时需要）

### 状态管理

Bot 使用 `scripts/bot/state.json` 记录已处理的 Issue/PR，避免重复处理。

---

## 标签体系

详见 [docs/labels.md](labels.md)。

标签体系模仿 ClawSweeper，包括：
- **规模**：XS / S / M / L / XL
- **优先级**：P0 / P1 / P2 / P3
- **段位**：王者荣耀 7 级（未定级 / 倔强青铜 / 秩序白银 / 荣耀黄金 / 永恒钻石 / 至尊星耀 / 最强王者）
- **类型**：Bug / 功能请求 / 文档 / 设计优化 / 问题咨询
- **小组**：①手绘地图 / ②交互功能 / ③平台搭建 / ④数据采集 / ⑤AI智能体 / ⑥坐标标注
- **状态**：需要更多信息 / 等待确认 / 已确认 / 进行中 / 等待审核 / 准备合并 / 已过时

---

## 开发背景

### 为什么需要 Bot？

14 人团队，6 个小组，Issue 和 PR 数量多，人工分类和标签管理成本高。Bot 自动化可以：
- 减少重复性人工操作
- 保证标签一致性
- 及时清理过期 Issue
- 提供质量反馈（段位评级）

### 技术选型

- **GitHub Actions**：用于简单的确定性规则（自动打标签、过时管理）
- **自定义 Node.js 脚本**：用于需要 AI 判断的复杂任务（智能分类、质量评估）
- **南航 DeepSeek API**：学校提供的免费 AI 资源，支持 reasoning_content

### 已知问题与修复记录

- **2026-07-17**：诊断并修复 Bot 评论循环问题（NAS 定时任务运行了错误的 BOT_LOGIN）
- **2026-07-18**：修复静默跳过 Bug（AI 调用失败时仍保存 `state.reviewed`，导致后续不会重试）
- **2026-07-19**：模型从 DeepSeek v4 Pro 切换为 GLM-5.2（更稳定）

---

## 相关文档

- [标签体系说明](labels.md)
- [AI 自动化协作系统规格](../ai-automation-spec.md)
- [GitHub 协作入门指南](github-guide.md)

---

<sub>🦞 Bot 由 @nuaamap-bot 运营 · 有问题请联系李桂聿</sub>
