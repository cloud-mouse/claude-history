# Claude History Viewer 站点实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 docs/ 目录下创建 Vitepress 站点，包含首页（Hero、功能卡片、截图、快速开始）并配置 GitHub Pages 部署

**Architecture:** 使用 Vitepress 作为静态站点生成器，自定义主题应用科技蓝配色，单页滚动式布局，复用现有的 preview/ 截图资源

**Tech Stack:** Vitepress, Vue 3, CSS

---

## 文件结构

```
docs/                                    # Vitepress 站点根目录
├── .vitepress/
│   ├── config.js                       # Vitepress 配置
│   └── theme/
│       ├── index.js                    # 主题入口
│       └── index.css                  # 自定义样式（科技蓝配色）
├── public/
│   └── preview/                        # 静态资源（截图/GIF 复用现有的）
│       ├── 1.png                      # 代表性截图
│       ├── 3.png                      # 深色主题截图
│       └── demo.gif                   # 完整演示 GIF
├── index.md                            # 首页（单页内容）
└── superpowers/
    ├── specs/                          # 设计文档
    │   └── 2026-04-30-claude-history-site-design.md
    └── plans                           # 本计划
        └── 2026-04-30-claude-history-site-plan.md
```

---

## 任务列表

### Task 1: 初始化 Vitepress 配置

**Files:**
- Create: `docs/.vitepress/config.js`
- Create: `docs/.vitepress/theme/index.js`
- Create: `docs/.vitepress/theme/index.css`
- Create: `docs/index.md`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p docs/.vitepress/theme docs/public/preview
```

- [ ] **Step 2: 创建 Vitepress 配置文件**

```javascript
// docs/.vitepress/config.js
export default {
  title: 'Claude History Viewer',
  description: 'Claude Code 对话历史的终极管理工具，支持 Markdown、代码高亮、主题切换和会话恢复',
  srcDir: '.',
  dest: '.vitepress/dist',
  themeConfig: {
    navbar: [
      { text: 'GitHub', link: 'https://github.com/your-username/claude-history' }
    ],
    sidebar: false  // 单页站点，禁用侧边栏
  }
}
```

- [ ] **Step 3: 创建主题入口文件**

```javascript
// docs/.vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme'
import './index.css'

export default {
  ...DefaultTheme
}
```

- [ ] **Step 4: 创建科技蓝配色样式**

```css
/* docs/.vitepress/theme/index.css */
:root {
  /* 科技蓝配色 */
  --vp-c-brand-1: #3b82f6;
  --vp-c-brand-2: #2563eb;
  --vp-c-brand-3: #1e40af;
  --vp-c-brand-soft: #dbeafe;

  /* 背景色 */
  --vp-c-bg: #ffffff;
  --vp-c-bg-soft: #f9fafb;

  /* 文字色 */
  --vp-text-1: #1f2937;
  --vp-text-2: #6b7280;
}

.VPHome {
  padding-bottom: 0;
}

.VPHero {
  padding: 80px 24px 40px;
}

.VPHero .title {
  font-size: 3rem;
  font-weight: 700;
  color: var(--vp-text-1);
}

.VPHero .text {
  font-size: 1.25rem;
  color: var(--vp-text-2);
}
```

- [ ] **Step 5: 创建首页内容**

```markdown
# Claude History Viewer

Claude Code 对话历史的终极管理工具

<!-- Hero CTA -->
<div class="hero-cta">
  <a href="https://github.com/your-username/claude-history" class="primary-btn">查看 GitHub</a>
</div>
```

- [ ] **Step 6: 提交**

```bash
git add docs/.vitepress/config.js docs/.vitepress/theme/index.js docs/.vitepress/theme/index.css docs/index.md
git commit -m "feat: initialize Vitepress configuration"
```

---

### Task 2: 创建 Hero 区域

**Files:**
- Modify: `docs/index.md`

- [ ] **Step 1: 更新首页内容，添加 Hero 区域**

```markdown
<div class="hero">
  <h1>Claude Code 对话历史的终极管理工具</h1>
  <p>支持 Markdown、代码高亮、主题切换和会话恢复</p>
  <div class="tags">
    <span class="tag">Markdown</span>
    <span class="tag">代码高亮</span>
    <span class="tag">主题切换</span>
    <span class="tag">会话恢复</span>
  </div>
  <div class="cta">
    <a href="https://github.com/your-username/claude-history" class="primary-btn">立即下载</a>
    <a href="https://github.com/your-username/claude-history" class="secondary-btn">查看 GitHub</a>
  </div>
</div>
```

- [ ] **Step 2: 更新 CSS，添加 Hero 样式**

在 `docs/.vitepress/theme/index.css` 中添加：

```css
.hero {
  text-align: center;
  padding: 60px 20px;
}

.hero h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 16px;
}

.hero p {
  font-size: 1.2rem;
  color: #6b7280;
  margin-bottom: 24px;
}

.tags {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 32px;
}

.tag {
  background: #dbeafe;
  color: #1e40af;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
}

.cta {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.primary-btn {
  background: #3b82f6;
  color: white;
  padding: 12px 28px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s;
}

.primary-btn:hover {
  background: #2563eb;
}

.secondary-btn {
  background: white;
  color: #3b82f6;
  padding: 12px 28px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  border: 2px solid #3b82f6;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: #dbeafe;
}
```

- [ ] **Step 3: 提交**

```bash
git add docs/index.md docs/.vitepress/theme/index.css
git commit -m "feat: add hero section with CTA buttons"
```

---

### Task 3: 创建功能特性区（9 个卡片）

**Files:**
- Modify: `docs/index.md`
- Modify: `docs/.vitepress/theme/index.css`

- [ ] **Step 1: 添加功能卡片区域**

在 `docs/index.md` 的 Hero 区域后添加：

```markdown
## 功能特性

<div class="features">

| 序号 | 标题 | 简述 |
|------|------|------|
| 1 | 三栏可折叠布局 | 项目列表 → 对话列表 → 消息详情，左右面板支持一键收起/展开 |
| 2 | Markdown 渲染 | 支持 Markdown 渲染、代码高亮、表格样式 |
| 3 | 四种主题切换 | 简约白 / 深邃黑 / 暖色调 / Monokai |
| 4 | 会话恢复 | 一键在终端中恢复历史会话，继续之前的对话 |
| 5 | 工具展示 | Agent 子代理、AskUserQuestion、TodoWrite、Edit/Write diff 等专用组件 |
| 6 | 智能标题提取 | 自动从对话内容中提取并生成标题 |
| 7 | 中文界面 | 完整的本地化支持 |
| 8 | 安全删除 | 支持删除对话和项目，同时移除磁盘文件和数据库记录 |
| 9 | 截图预览 | 图片点击放大预览 |

</div>
```

- [ ] **Step 2: 添加功能卡片 CSS 样式**

在 `docs/.vitepress/theme/index.css` 中添加：

```css
.features {
  padding: 40px 24px;
  background: #f9fafb;
}

.features h2 {
  text-align: center;
  font-size: 1.8rem;
  color: #1f2937;
  margin-bottom: 32px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 24px;
  transition: box-shadow 0.2s, transform 0.2s;
}

.feature-card:hover {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
  transform: translateY(-2px);
}

.feature-icon {
  width: 48px;
  height: 48px;
  background: #3b82f6;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  font-size: 1.5rem;
}

.feature-card h3 {
  font-size: 1.1rem;
  color: #1f2937;
  margin-bottom: 8px;
}

.feature-card p {
  font-size: 0.9rem;
  color: #6b7280;
  line-height: 1.5;
}
```

- [ ] **Step 3: 提交**

```bash
git add docs/index.md docs/.vitepress/theme/index.css
git commit -m "feat: add features section with 9 feature cards"
```

---

### Task 4: 创建截图展示区

**Files:**
- Modify: `docs/index.md`
- Modify: `docs/.vitepress/theme/index.css`

- [ ] **Step 1: 复制现有截图到 docs/public/preview/**

```bash
cp preview/3.png docs/public/preview/
cp preview/demo.gif docs/public/preview/
```

- [ ] **Step 2: 在 index.md 中添加截图区域**

在功能卡片区域后添加：

```markdown
## 截图预览

<div class="screenshots">
  <div class="screenshot-primary">
    <img src="/preview/3.png" alt="Claude History Viewer 三栏布局" />
    <p class="caption">三栏布局 - 项目列表 / 对话列表 / 消息详情</p>
  </div>
</div>

## 完整演示

<div class="demo">
  <img src="/preview/demo.gif" alt="完整使用演示" />
</div>
```

- [ ] **Step 3: 添加截图区域 CSS**

```css
.screenshots {
  padding: 40px 24px;
  text-align: center;
}

.screenshot-primary img {
  max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.caption {
  margin-top: 12px;
  color: #6b7280;
  font-size: 0.9rem;
}

.demo {
  padding: 0 24px 40px;
  text-align: center;
}

.demo img {
  max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
```

- [ ] **Step 4: 提交**

```bash
git add docs/public/preview/3.png docs/public/preview/demo.gif
git add docs/index.md docs/.vitepress/theme/index.css
git commit -m "feat: add screenshots section with preview images"
```

---

### Task 5: 创建快速开始区域

**Files:**
- Modify: `docs/index.md`
- Modify: `docs/.vitepress/theme/index.css`

- [ ] **Step 1: 添加快速开始区域**

在截图区域后添加：

```markdown
## 快速开始

### 安装依赖

```bash
# 方式一：cnpm（国内网络推荐）
npm install -g cnpm --registry=https://registry.npmmirror.com
cnpm install

# 方式二：pnpm
pnpm install

# 如果 Electron 下载慢，使用镜像
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm install
```

### 开发模式

```bash
pnpm electron:dev
```

### 构建应用

```bash
pnpm electron:build
```

构建完成后，应用会生成在 `out` 目录下。
```

- [ ] **Step 2: 添加快速开始区域 CSS**

```css
.quickstart {
  padding: 40px 24px;
  background: #f9fafb;
}

.quickstart h2 {
  text-align: center;
  font-size: 1.8rem;
  color: #1f2937;
  margin-bottom: 32px;
}

.quickstart code {
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
}
```

- [ ] **Step 3: 提交**

```bash
git add docs/index.md docs/.vitepress/theme/index.css
git commit -m "feat: add quick start section with installation instructions"
```

---

### Task 6: 创建 Footer 和最终完善

**Files:**
- Modify: `docs/index.md`
- Modify: `docs/.vitepress/theme/index.css`

- [ ] **Step 1: 在 index.md 末尾添加 Footer**

```markdown
---

<div class="footer">
  <p>MIT License · Claude History Viewer</p>
  <p><a href="https://github.com/your-username/claude-history">GitHub</a></p>
</div>
```

- [ ] **Step 2: 添加 Footer CSS**

```css
.footer {
  text-align: center;
  padding: 40px 24px;
  border-top: 1px solid #e5e7eb;
  color: #6b7280;
}

.footer a {
  color: #3b82f6;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: 完善 index.md 结构**

确保 index.md 完整内容包含：
1. Hero 区域
2. 功能特性区（9 个卡片）
3. 截图展示区（单图 + GIF）
4. 快速开始区域
5. Footer

- [ ] **Step 4: 提交**

```bash
git add docs/index.md docs/.vitepress/theme/index.css
git commit -m "feat: add footer and finalize site structure"
```

---

### Task 7: 配置 GitHub Actions 自动部署

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 创建 GitHub Actions workflow**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Install Vitepress
        run: npm install vitepress

      - name: Build site
        run: npm run docs:build
        env:
          NODE_ENV: production

      - name: Deploy
        uses: peaceiris/actions-ghpages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: docs/.vitepress/dist
```

- [ ] **Step 2: 添加 package.json scripts**

在项目根目录的 `package.json` 中添加：

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/deploy.yml
git add package.json
git commit -m "ci: add GitHub Actions workflow for GitHub Pages deployment"
```

---

### Task 8: 本地测试站点

**Files:**
- (无文件变更，仅测试)

- [ ] **Step 1: 安装 Vitepress（如尚未安装）**

```bash
npm install vitepress
```

- [ ] **Step 2: 本地启动开发服务器**

```bash
npm run docs:dev
```

预期输出：`Local: http://localhost:5173/`

- [ ] **Step 3: 验证站点内容**

检查以下内容是否正常显示：
- [ ] Hero 区域（标题、副标题、标签、CTA 按钮）
- [ ] 功能特性区（9 个卡片，3 列网格）
- [ ] 截图展示区（图片和 GIF 正常加载）
- [ ] 快速开始区域（代码块样式正确）
- [ ] Footer

- [ ] **Step 4: 停止开发服务器**

按 `Ctrl+C` 停止

---

### Task 9: 构建并验证

- [ ] **Step 1: 构建生产版本**

```bash
npm run docs:build
```

预期输出：`docs/.vitepress/dist/` 目录包含构建产物

- [ ] **Step 2: 本地预览构建结果**

```bash
npm run docs:preview
```

- [ ] **Step 3: 验证构建产物**

检查 `docs/.vitepress/dist/` 目录存在且包含 `index.html`

- [ ] **Step 4: 提交所有更改**

```bash
git add -A
git commit -m "feat: complete Vitepress documentation site"
```

---

## 验收标准

- [ ] 本地开发服务器正常启动
- [ ] Hero 区域正确显示（标题、副标题、标签、CTA）
- [ ] 9 个功能卡片正确排列（3 列网格）
- [ ] 截图和 GIF 正常加载
- [ ] 快速开始区域代码块样式正确
- [ ] 生产构建成功生成 dist 目录
- [ ] GitHub Actions workflow 已提交

---

## 备注

- GitHub 用户名需要替换为实际值（搜索 `your-username` 替换）
- 截图路径使用现有的 preview/ 目录内容
- 科技蓝配色通过 CSS 变量定义，便于后续调整