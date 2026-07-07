# Skill 加载机制重构设计稿

> 状态：设计讨论稿（未进入实现）。本稿聚焦 **Skill 加载机制、节点产物、Demo Handoff 适配、Agent SDK 迁移、HITL、自动上下文压缩**。Validation / self-check 与 snapshot 的适配不在本稿范围内，留待后续。

## 1. 背景与目标

BattleFlow 工作流由多个 Skill 节点串行或并行组成，通过各节点的输入/输出文档，最终汇成一份文档。当前 Skill 加载存在以下问题，需要重构：

- **加载方式**：Skill 通过系统提示词全文注入（`buildSystemPrompt()` 把整段 `skill_md` 塞进 system prompt），无隔离、无渐进披露。
- **无节点隔离**：所有节点共享同一个全局 CWD（APP 目录），彼此的 Skill、产物、写操作互相可见。
- **能力受限**：CLI 只开放 `Read/Grep/Glob/WebSearch/WebFetch`，无写入能力；无 HITL、无自动上下文压缩。

### 目标

1. **Skill 加载改为工具触发**：废弃系统提示词注入，改用 Claude 官方 Skill 发现机制（CWD 下 `.claude/skills/`）。
2. **节点隔离**：进入某节点会话时，只允许加载该节点绑定的 Skill，与其他节点隔离。
3. **新增工具**：在受控前提下开放 `Write`、`Edit`、`Skill` 工具。
4. **节点产物**：每个节点有各自产物，下游节点可复用上游产物，最终汇成一份文档。

### 关联的大方向（本稿依赖，但非本稿实现范围）

- **切换到 Claude Agent SDK**：CLI 子进程（`--no-session-persistence`、每轮重拼历史）无法支撑 HITL（`ask_user_question`）与自动上下文压缩。SDK 的有状态会话 + `canUseTool` + `hooks` 是这些能力的正解。本稿的落地以 SDK 为目标运行时。
- 后端确认为 Claude（经 `ANTHROPIC_BASE_URL`）。前端请求体里的 `model_id: 'doubao-...'` 是**死字段**，adapter 实际用 `CLAUDE_MODEL`，应清理。

## 2. 核心设计原则

### 2.1 读共享 / 写隔离是两条独立的轴

不要用一个目录同时扛"下游能读上游"和"节点间不互相污染"。拆成两轴后布局自然清晰：

| 轴 | 手段 | 目的 |
| --- | --- | --- |
| **写隔离** | `cwd = nodes/<stepId>/`，模型只写自己的 cwd | 并行节点各写各的，不互相覆盖 |
| **Skill 隔离** | `nodes/<stepId>/.claude/skills/` 只放绑定的那 1 个 Skill | 模型只能发现当前节点的 Skill |
| **读共享** | `artifacts/`（每工作流一个）以附加目录挂给所有节点，并由权限策略保持只读 | 下游能 Read 上游全部已产出产物 |

### 2.2 沙箱与隔离靠"配置 + 物化"，不靠 hook

- **`cwd` 是工作目录，不是 chroot**。它决定相对路径、项目发现起点、默认可写范围，但不是 OS 级文件系统沙箱；隔离还必须依赖 SDK `tools`/权限策略、`additionalDirectories` 控制、hook 白名单与服务端路径校验。
- **Skill 隔离靠磁盘上只物化 1 个 Skill**，不是 hook。
- **hook 是第二道防线**：`PreToolUse` 拦截越界写（绝对路径 / `../` 逃逸），是墙上的报警器，非墙本身。
- **强制激活没有 100% 机制保证**：只能靠"物化只放 1 个"（缩小可选集）+ "注入强指令"（hook 或 system prompt）叠加逼近。
- **项目级 Skill 发现会看父级项目目录**：当 `settingSources: ['project']` 且 runtime 目录仍放在 BattleFlow repo 内时，Claude 会从 `cwd` 往上寻找项目 `.claude/skills`，直到 repo root。当前 repo root 有 `.claude -> .agents`，因此理论上会发现 repo agent skills。阶段 1 的实际隔离验收必须同时验证 `skills: [currentSkillName]` / 工具策略能让会话只启用当前节点绑定的 Skill。

### 2.3 物化是"会话的副作用"，不是"创建的副作用"

Skill 拷贝在**进入节点会话时**按需物化（lazy materialize），不在创建节点时做。

- 创建时拷贝的问题：版本漂移（节点 pin 的版本会过期，需额外同步逻辑）、僵尸目录（未执行/已删节点留残留）、给纯元数据操作绑上磁盘 IO 失败路径。
- 会话时物化的优点：每次按 **pinned 版本**校验，版本永远对；只为真正执行的节点付磁盘成本；实现为一个幂等函数收在 chat 准备步骤里。

### 2.4 产物写入共享区由服务端 promote，不由模型写

`artifacts/` 对节点**只读**。注意：SDK `additionalDirectories` / CLI `--add-dir` 只是在文件系统权限上额外暴露目录，本身不表达"只读"；只读语义必须由工具策略、`PreToolUse` 路径白名单、沙箱配置和服务端 `promoteArtifact()` 独占写入共同保证。节点完成时，由服务端把选定产物**拷贝**进 `artifacts/`（复用现有 `candidate → step.output` 的提升语义），同时写 registry 记录。这样共享区完整性可控、对并行安全，模型无法改别人的产物。

## 3. 目标架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (workflows/page.tsx)                          │
│  进入节点 N → 对话   │  右侧上下文面板: 全局产物列表(A) + 按产出节点分组(B)     │
│                      │    · 看整份文档一块块拼起来  · 点产物跳回源节点/重跑    │
└──────────┬───────────────────────────────────────────▲───────────────────────┘
           │ POST /api/chat {workflow_id, step_id}      │ SSE: tool/msg/usage
           ▼                                             │
┌─────────────────────────────────────────────────────────────────────────────┐
│                    /api/chat  (route handler, runtime=nodejs)                  │
│  1. authz: workflow.read + skill.run(skill_id)                                 │
│  2. 解析 step → skillId + PINNED skillVersion                                  │
│  3. materializeNodeWorkspace()   ◄── 幂等/懒物化 (会话副作用, 非创建副作用)     │
│  4. 组装目录:  cwd = nodes/<stepId>/                                            │
│                addDir = [ artifacts/(只读), attachments/ ]                      │
│  5. SDK adapter (Skill 工具触发, 非 system-prompt 注入 skill_md)               │
│  ── 节点完成时: promoteArtifact() 拷贝产物 → artifacts/ + 写 registry 归属 ──   │
└──────────┬─────────────────────────────────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              agent-adapters/claude-agent-sdk.ts   (重写 CLI adapter)            │
│   query({                                                                      │
│     cwd:          nodes/<stepId>/        ◄── 沙箱主力(墙) + skill隔离 + 写隔离   │
│     addDirs:      [ artifacts/(policy-RO), attachments/ ]   ◄── 读共享          │
│     tools:        Read,Grep,Glob,Write,Edit,Skill,WebSearch,WebFetch,          │
│                   AskUserQuestion                                              │
│     allowedTools: 自动批准子集；不是可用工具白名单                              │
│     settingSources: ['project'] 发现 .claude/skills/                           │
│     skills:       [当前节点 Skill 名]                                           │
│   })  ── 有状态会话 ⇒ auto-compaction 自然接管                                  │
└──────────┬─────────────────────────────────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Claude (后端=Claude, 经 ANTHROPIC_BASE_URL; model=CLAUDE_MODEL) │
└─────────────────────────────────────────────────────────────────────────────┘

  FILESYSTEM (runtime, gitignored)                        REGISTRY (源, 只读)
  data/workflows/<wfId>/                            data/skill-registry/packages/
    ├── artifacts/            ◄── 共享产物区(单一真相源)    <skillId>/<version>/
    │     ├── <stepA>-需求说明.md   · 所有节点 addDir 只读      SKILL.md + assets
    │     └── <stepB>-竞品分析.md   · 只由 promote 写入          (live, 禁止被写)
    │                               · registry 记录带                  │
    │                                 producedByStepId              拷贝副本
    └── nodes/<stepId>/        ◄── 节点私有 cwd (写在此, 隔离)         │
          ├── .claude/skills/<name>/  ◄── 只放绑定的那1个 ◄───────────┘
          └── (模型 Write/Edit 草稿)
```

## 4. 数据流图（一次节点对话 + 产物流转）

```
用户在节点 N 输入
      │
      ▼
POST /api/chat {workflow_id, step_id}
      │
      ▼
┌─ authz: workflow.read + skill.run ─┐
└──────────────┬─────────────────────┘
               ▼
      step → skillId + PINNED version
               │
               ▼
┌─ materializeNodeWorkspace (幂等) ─────────────────────────────┐
│  nodes/<stepId>/.claude/skills/  存在? & 版本匹配?             │
│     ├─ 是 → 复用 (≈0 成本)                                     │
│     └─ 否 → 从 registry 拷贝 pinned 副本 (只放绑定的1个 skill) │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
      组装:  cwd    = nodes/<stepId>/           (写隔离 + skill隔离)
             addDir = artifacts/ (只读)          (读共享: 看得到上游全部产物)
                    + attachments/
               │
               ▼
┌─ SDK query() 有状态会话 ──────────────────────────────────────┐
│   Skill 工具 → 加载当前节点方法 (渐进披露)                     │
│   Read/Grep  → artifacts/ 里上游产物 + 附件                    │
│   Write/Edit → 只写 cwd 内 nodes/<stepId>/ 草稿                │
│   历史变长   → auto-compaction 接管 (无需手动重拼)             │
└──────────────┬─────────────────────────────────────────────────┘
               ▼ SSE: tool_call / assistant_message / usage
        浏览器渲染对话
               │
               ▼
┌─ 节点完成 → promoteArtifact() (服务端做, 非模型写) ───────────┐
│   选定产物 ──拷贝──► artifacts/<stepId>-<title>.md            │
│              └──► registry 产物记录 { producedByStepId,       │
│                     title, path, version, createdAt }        │
└──────────────┬─────────────────────────────────────────────────┘
               │
               ├──► 右侧面板: 全局列表(A) 刷新, 按 producedByStepId 分组(B)
               │
               ▼
      下一节点 N+1 进会话 → addDir=artifacts/ 已含 N 的产物 → 可复用
               │
               ▼
      (串行/跨执行组: 可读上游)   ⚠ 同组并行 A│B: B 读不到 A(未 promote)
                                    → 并行分支各自产出, 由后续汇总节点消费
               │
               ▼
      末端汇总节点消费 artifacts/ 全部产物 → 产出最终一份文档
```

## 5. 文件系统布局

```
data/workflows/<orgId>/<wfId>/    (runtime, gitignored)
  ├── artifacts/                  共享产物区，单一真相源
  │     ├── <stepA>-需求说明.md    · 所有节点以附加目录挂载，策略上只读
  │     └── <stepB>-竞品分析.md    · 仅由服务端 promoteArtifact 写入
  └── nodes/<stepId>/             节点私有工作目录 (cwd)
        ├── .claude/skills/<name>/SKILL.md   只放绑定的那 1 个 Skill 的 pinned 副本
        ├── attachments/          该节点附件
        └── (模型 Write/Edit 草稿)
```

路径以 `<orgId>` 为租户前缀（见 §15；§3/§4 图为简洁省略了该前缀）。Skill 副本来源：`data/skill-registry/packages/<skillId>/<version>/`（live 注册表，只读，**禁止被模型写**）。必须拷贝副本，不能软链到 live 目录——否则开 Write 后模型会污染共享 Skill 包，影响所有工作流。

> 当前落地决策：runtime 工作区暂时仍放在 BattleFlow repo 内的 `data/workflows/<orgId>/<wfId>/`，以降低本轮改造范围。TODO：后续评估迁移到 repo 外部专用 runtime root（例如 `$BATTLEFLOW_RUNTIME_DIR/workflows/...`），以进一步减少父目录项目 Skill 发现、git 工作树污染、误提交 runtime 数据和 repo 级配置串入节点会话的风险。

## 6. 关键组件职责

### 6.1 `materializeNodeWorkspace(workflowId, stepId, skill)`

- 时机：`/api/chat` 中、spawn/`query()` 之前的准备步骤。
- 幂等：每次进会话都调，内部检查目录是否存在、版本是否匹配；命中则复用（≈0 成本），未命中或版本不匹配才拷贝/覆盖。
- 依据 **pinned skillVersion** 拷贝，天然解决版本漂移。
- 只物化该节点绑定的 1 个 Skill → Skill 隔离成立。

### 6.2 目录组装

- `cwd = data/workflows/<orgId>/<wfId>/nodes/<stepId>/`
- `addDirs = [ data/workflows/<orgId>/<wfId>/artifacts/ (策略上只读), nodes/<stepId>/attachments/ ]`（`attachments/` 在 cwd 内，本已可读，列出仅为示意；`additionalDirectories` 本身不提供只读语义）

### 6.3 `promoteArtifact(workflowId, stepId, output)`

- 时机：节点完成、产物确认时（复用现有 `candidate → step.output` 提升语义）。
- 动作：把选定产物拷贝到 `artifacts/<stepId>-<title>.md`；写一条 registry 产物记录。
- 只由服务端执行，保证共享区只读、并行安全。

## 7. Artifact 数据模型

产物的两个硬诉求：**用户可下载**、**每个节点都能引用上游产物（每个节点都需知道有哪些上游产物）**。据此定型如下。

### 7.1 一个产物 = 一个文件 + 一条记录 + 一份清单

- **文件**：落在 `data/workflows/<orgId>/<wfId>/artifacts/` 下的真实文件，携带真实文件名与 MIME，可直接下载。
- **记录**：registry 中一条 `ArtifactRecord`，承载溯源、下载元数据、版本。
- **清单**：`artifacts/manifest.json`，由 `promoteArtifact` 每次自动重写，是"每个节点都能知道上游有哪些产物"的**索引**（单一真相源的目录）。

### 7.2 `ArtifactRecord` 字段

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定产物 ID，如 `art_<stepId>_<n>` |
| `workflowId` | 所属工作流 |
| `producedByStepId` | 产出节点 ID（溯源 / 重跑归属 / 面板分组依据） |
| `producedByStepName` | 产出节点名（展示用，避免二次查询） |
| `title` | 产物标题（取自 Markdown H1，回退节点名） |
| `summary` | 一句话摘要（进 manifest，供下游**不读全文**即可判断是否相关） |
| `fileName` | 下载文件名，如 `需求说明.md` |
| `path` | 相对工作流目录的路径，如 `artifacts/<stepId>-需求说明.md` |
| `format` | `markdown` / `json` / `text` / …（渲染与图标） |
| `mimeType` | 下载用 MIME，如 `text/markdown` |
| `size` | 字节数 |
| `checksum` | sha256，完整性 / 去重 |
| `version` | 同节点重跑递增；同一 `producedByStepId` 保留最新，历史可选留档 |
| `createdAt` / `updatedAt` | 时间戳 |

### 7.3 `manifest.json` 结构

```json
{
  "workflowId": "<wfId>",
  "updatedAt": "<iso>",
  "artifacts": [
    {
      "id": "art_stepA_1",
      "producedByStepId": "stepA",
      "producedByStepName": "需求澄清",
      "title": "TR1 需求说明",
      "summary": "面向评审的需求说明，含目标/范围/验收",
      "fileName": "需求说明.md",
      "path": "artifacts/stepA-需求说明.md",
      "format": "markdown"
    }
  ]
}
```

清单里只放**轻量子集**（不含全文），保持上下文精简——渐进披露：节点先读清单知道"有什么"，再按需 `Read` 具体文档。

### 7.4 下载

新增 `GET /api/workflows/artifacts?workflow_id=&artifact_id=`：

- 权限 `workflow.read`。
- 由 `artifact_id` 查记录，取 `path`，**校验 resolve 后仍在该工作流 `artifacts/` 目录内**（防路径逃逸），再流式返回。
- 响应头 `Content-Disposition: attachment; filename="<fileName>"` + 正确 `Content-Type`。

### 7.5 每个节点如何"知道并引用"上游产物

三层配合，缺一不可：

1. **可读**：`artifacts/` 以**只读** addDir 挂进每个节点会话 → 模型能 `Read` 任意上游产物文件。
2. **可知**：`artifacts/manifest.json` 存在于该只读目录中 → 模型有一份"目录"可查。
3. **被提示**：节点 system prompt 注入一段**紧凑清单**（每条 `title｜summary｜fileName`）+ 一句指引"上游产物已挂载为只读目录，清单见 `manifest.json`，需要时用 Read 打开具体文档"。让模型无需先读文件就知道有哪些、该不该用。

### 7.6 重跑与增量编辑

同节点重跑时，不必从零重生成——利用 `Edit` 在**上一版产物的副本**上增量编辑：

- **播种（seed）**：重跑进会话时，`materializeNodeWorkspace` 把当前已 promote 的 artifact **拷回该节点 cwd** 作工作草稿（`nodes/<stepId>/<fileName>`）。
- **增量编辑**：模型对 cwd 里的草稿用 `Edit` 局部修改，而非重写整篇（也保留从零重写的自由）。
- **只读约束不破**：模型改的是**自己 cwd 的副本**，不是共享 `artifacts/`（后者对节点只读，仅由 promote 写）。
- **落地**：`promoteArtifact` 从草稿更新 artifact——**覆盖当前版** + `version++`（历史可选留档）；`checksum` 变化才算真正更新。

由此"覆盖 vs 历史版本"（promote 的行为）与"增量编辑 vs 重生成"（靠把旧稿播种进 cwd 让 `Edit` 可用）解耦。

## 8. 展示方案

**全局展示（A）+ 节点归属（B）**，一份数据两种视角：

- 单一真相源 = `artifacts/` 文件 + registry 产物记录（带 `producedByStepId`）。
- 右侧上下文面板按 A 展示：累积产物列表，用户看着最终文档一块块拼起来，便于发现可复用产物、看整体进度。
- 每条产物按 `producedByStepId` 归属到源节点：可分组、可跳回源节点、重跑时知道回哪。

不选纯 A（丢溯源，重跑不知回哪个节点）；不选纯 B（看不到"一共产出了哪些"，下游难发现可复用）。

## 9. 进入节点引导（Node Onboarding）

目标：用户进入某 Skill 节点后，不至于面对空白输入框发懵——**告诉他这个节点能做什么、该给什么输入、可以怎么开始**。

### 9.1 前提认知：触发已不需要"念咒语"

改成 Skill 工具化后，Skill 在进节点时已物化好、由 SDK 自动发现，用户**无需靠特定话术去"触发"**。因此引导的真正目标不是"教触发"，而是**降低认知空白**：解释节点职责 + 明确所需输入 + 提供可点的起手式。

### 9.2 方案选型

| 方案 | 形态 | 结论 |
| --- | --- | --- |
| A 按钮点开提示词 | 点按钮才显示 | 克制但易被忽略，用户可能不知有 |
| B 直接填满输入框 | 进节点即把完整提示词塞进输入框 | ✗ 输入框是用户地盘，塞满有压迫感；预设静态文案对"需动态引用上游产物"的场景不准 |
| **C 结构化引导卡 + 可选填充** | 引导卡解释 + 建议起手式点击才填入 | ✓ **采用**：解释与填充解耦，兼取 A 的克制与 B 的便捷 |

### 9.3 引导卡形态

仅在**对话为空**时于对话区顶部显示（已有历史对话则不显示）：

```
┌─────────────────────────────────────────────┐
│  📋 需求澄清节点                               │
│  本节点：把立项材料转成 TR1 需求说明           │  ← SKILL.md description
│                                               │
│  需要你提供：一段需求背景 / 或选一份上游产物    │
│  ┌─────────────────────────────────────────┐ │
│  │ 上游可引用： 《竞品分析》 《用户旅程》 ▸   │ │  ← 来自 §7 manifest
│  └─────────────────────────────────────────┘ │
│                                               │
│  试试这样开始（点击填入输入框，可编辑后再发）： │
│   ▸ 基于上游《竞品分析》，生成大需求评审版      │  ← starters / description 回退
│   ▸ 我描述一个新需求，帮我出小需求评审版        │
│   ▸ 这个节点能产出哪些版本？                    │
└─────────────────────────────────────────────┘
```

- **上半（解释）**：节点 `title` + Skill `description` 摘要 + "需要你提供什么"。
- **中段（上游引用）**：直接消费 §7 的 `manifest.json`，列出可引用的上游产物；点击把引用带进起手式。这是"每个节点可引用上游产物"在 UI 上的兑现。
- **下半（建议起手式）**：2–4 条，**点击才填入输入框**（A 的克制），**填入后可编辑再发**（避开 B 的死板）。

### 9.4 数据来源

- **引导文案**：Skill 的 `SKILL.md` frontmatter `description`（现成，本就写"何时使用"）。
- **起手式 starters**：Skill 新增**可选** frontmatter 字段 `starters: string[]`（见 §7 与下方约束）。缺省时回退：用 `description` 生成一条通用起手式（"按本节点方法处理我的以下输入：…"）。质量随 skill 作者投入提升，又不强制。
- **上游引用项**：`manifest.artifacts[].title`（供展示）+ `id`/`path`（供点击注入引用）。

### 9.5 与其他部分的数据依赖

- 依赖 §7 `manifest.json`：中段上游引用、起手式里的动态引用均取自它；无上游产物时中段隐藏。
- 依赖 Skill 模型新增 `starters` 字段（可选）；registry 导入/规范化/序列化需比照现有 Skill 校验契约字段（`acceptanceCriteria` 等可选兼容字段）的处理方式**予以保留**。

## 10. Demo Handoff 适配

Demo Handoff（把完成节点交付到外部 Frieren Demo 平台）保持**节点作用域**不变，但内容来源从"原始 `step.output` markdown"切换为"该节点的 artifact"。

现状（`src/lib/integrations/frieren-demo.ts` + `/api/demos/handoffs`）：

- `externalWorkflowId` = 节点 stepId；`externalProjectKey` = 工作流 ID；`documents[0]` = `step.output` markdown；`title` 取输出首个 H1。
- HMAC-SHA256 签名原始 body，`POST /api/integrations/workflows/handoff`，返回 `studioUrl` 存入 `workflow.demoHandoffs`（`studioUrl` 是本地幂等标记）。

调整：

- `documents[0]` 改为读**该节点 artifact**（`ArtifactRecord.path` 对应的文件内容）；`title` 取 `ArtifactRecord.title`。
- 触发前置从"存在 `step.output`"改为"该节点已 `promoteArtifact`"——artifact 是产物的权威载体。
- `externalWorkflowId` / `externalProjectKey` / HMAC / 幂等标记 / 文档数量与字节上限**均不变**。
- 兼容：markdown 节点的 artifact 内容通常等于 `step.output`，因此这是**来源切换**而非协议变更，外部平台无感。

> 注：本轮不动 validation 促成 `candidate → step.output` 的既有语义；artifact 由 `promoteArtifact` 在节点完成时另行落地，两者可共存。Handoff 以 artifact 为准。

## 11. Agent SDK 迁移细节

目标：用 `@anthropic-ai/claude-agent-sdk` 的 `query()` 替换 `spawn('claude', ['-p', ...])` 子进程，保留对上层稳定的 `AgentTurnInput` / `AgentEvent` 接口，使 `route.ts` 改动最小。

### 11.1 新旧映射

| 当前 CLI（`claude-code-cli.ts`） | SDK `query({ options })` | 备注 |
| --- | --- | --- |
| `spawn('claude','-p',...,stream-json)` | `query({ prompt, options })` 异步迭代 | 结构化消息流替代手写行解析 |
| `cwd: getClaudeWorkspaceDir()` | `options.cwd = nodes/<stepId>/` | 每节点独立 |
| `--add-dir <dirs>` | `options.additionalDirectories` | `artifacts/`(策略上只读) + `attachments/`；只读靠权限策略/Hook/服务端校验，不靠 addDir 字段 |
| `--tools / --allowedTools` | `options.tools` + `options.allowedTools` + `disallowedTools` | `tools` 才是可用工具集合；`allowedTools` 只是自动批准集合。阶段 1 加 `Skill`，阶段 3 再加 `Write`/`Edit` |
| `--model CLAUDE_MODEL` | `options.model` | |
| `--system-prompt-file` | `options.systemPrompt` | 直接传字符串，不再写临时文件 |
| `--permission-mode dontAsk` | `options.permissionMode` + `canUseTool` | 见 §12 |
| （无） | `options.mcpServers` | MCP 接入点 + HITL 工具（§12） |
| （无，靠 CWD 隐式发现） | `options.settingSources: ['project']` + `options.skills` | **关键**：`project` 加载项目 `.claude/skills/`；`skills` 限定本轮启用的 Skill，但不是文件系统沙箱 |
| `--max-budget-usd` | `options.maxBudgetUsd` | 按实际 SDK 类型校验字段名 |
| `--no-session-persistence` + 每轮重拼历史 | 有状态会话（§13） | 废弃 `buildConversationPrompt` 重拼 |
| 手写 `ClaudeCodeStreamEvent` 解析 | SDK `SDKMessage`（system/assistant/user/result/stream_event） | 映射到既有 `AgentEvent` |

> 字段名以实际 SDK 版本为准；上表为映射意图，落地时需对照 SDK 类型定义校正。

### 11.2 保留与替换

- **保留**：`AgentTurnInput` / `AgentEvent` / `AgentToolCallEvent` 类型；`streamAgentEventsAsSse` 的 SSE 桥接；tool 结果的截断归一化（`normalizeToolResult` 等，防超大输出）。
- **替换**：`spawn` + 行缓冲 + `handleLine` 全部由迭代 `query()` 的 `SDKMessage` 取代；临时 system-prompt 文件写入取消。
- **鉴权**：SDK 认 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`，与现有代理路由兼容（后端已确认 Claude）。
- **阶段 0 等价性**：为保持现有行为，先设置 `persistSession: false`、不开 `Skill`/`Write`/`Edit`，`cwd` 仍沿用当前工作区；阶段 1 再切节点 cwd 与 project Skill 发现。
- **hooks**：`PreToolUse`（越界写路径白名单）、`SessionStart`（注入 Skill 强制激活指令）在 `options.hooks` 挂载。注意：已被 `allowedTools` 自动批准的工具不会再进入 `canUseTool`，因此路径安全不能只放在 `canUseTool`。

## 12. HITL 人机协同

两类人机交互，统一走"会话内暂停 → SSE 通知浏览器 → 用户响应 → 恢复同一会话"：

- **工具批准**（如 `Write` 确认）：`options.canUseTool(toolName, input)` 回调，返回 `{ behavior: 'allow' }` 或 `{ behavior: 'deny', message }`。路径安全仍需 `PreToolUse` 覆盖，因为 `allowedTools` 自动批准的工具不会触发 `canUseTool`。
- **主动提问 `AskUserQuestion`**：优先使用 Claude Agent SDK 内置工具，不再自定义 `ask_user_question` MCP。BattleFlow 负责把 SDK 事件映射成 SSE pending 卡片、持久化 pending 状态，并在用户回答后把响应交回同一 run/session。

### 12.1 交互流

```
模型 → canUseTool / AskUserQuestion
        │
        ▼
服务端: 生成 pending(promptId), 挂起一个 deferred Promise
        │  SSE ──► 浏览器渲染确认框/提问框 (带 runId + promptId)
        ▼
用户点击/回答
        │  POST /api/chat/respond { runId, promptId, answer|decision }
        ▼
服务端: 找到 deferred → resolve(answer) → canUseTool/tool 返回 → 会话继续
```

### 12.2 要点

- **长连接 + 关联 ID**：`/api/chat` 在 HITL 期间保持会话存活；复用现有 `ChatRunRecord.id` 作 `runId` 关联响应。会话须能跨 HITL 暂停不中断（SDK streaming input 模式支持）。
- **新增端点** `POST /api/chat/respond`：按 `runId + promptId` resolve 对应 deferred。
- **超时/取消**：deferred 需带超时与 abort 联动，用户不响应时安全 deny/结束，避免会话悬挂。
- **与安全联动**：`Write`/`Edit` 的 `canUseTool` 同时做**路径白名单**（落在 `nodes/<stepId>/` 外一律 deny），HITL 与沙箱共用同一闸门。

### 12.3 `ask_user_question` UI

- **形态**：对话流内**内联卡片**，而非模态弹窗。理由：贴合对话节奏、支持连续多问、不打断用户对整个会话的浏览；回答后卡片收敛为一条 user 轮次留在对话里，保留可追溯性。
- **卡片内容**：由工具入参驱动——问题文本、可选 `options`（渲染为按钮）、是否 `multiSelect`、是否允许自由文本（"其他"输入框）。工具批准类（如 Write 确认）渲染为 approve/deny 卡片，附拟写文件路径/摘要。
- **状态联动**：提问期间该节点处于 `waiting_human`（见 §14），视觉区别于"运行中"；即使用户切到别的节点，也应有"需输入"badge 提示。
- **刷新/重连**：pending 提问是 **run 状态的一部分并持久化**（见 §14）。刷新或重连后，前端按 run 状态重新渲染未回答的卡片，不丢失。
- **超时/取消**：卡片可显示剩余时限；超时按 §12.2 安全 deny/结束，并在卡片上给出"已超时自动跳过"的落地态。

## 13. 自动上下文压缩

前置条件：**改为有状态会话**。当前 `--no-session-persistence` + 每轮 `buildConversationPrompt` 重拼历史，等于自管上下文，harness 的 auto-compaction 从未接管。

设计：

- **每节点一个会话**。节点内多轮对话复用同一 SDK 会话，由 harness 维护历史并在接近上下文上限时自动压缩。
- **跨轮恢复**：turn 之间用 `session_id` `resume`（以 stepId 为键存储），而非重拼历史。
- **turn 内保活**：单轮若含 HITL 暂停（§12），会话在该轮内保持打开直至恢复。
- **精简手动注入**：知识库片段、附件清单等尽量下沉为按需 `Read`（附件已走 addDir），减少每轮塞进上下文的量，让压缩作用在干净会话上。
- **边界**：会话与 stepId 绑定；节点重跑或工作流归档时废弃对应会话，避免脏历史串味。

## 14. 运行态可靠性与状态保持

核心原则：**生成与页面连接解耦（分离式运行 / detached run）**。任务生成在服务端独立进行，SSE 只是订阅者。

现状缺口：`chatRuns` 是内存 Map，且 SSE 流 `cancel()` 会 `kill` 子进程——刷新页面、切换节点都会**误中断**正在跑的任务。必须改。

### 14.1 分离式运行模型

- **run 状态持久化到 Postgres**（线上库，经 `BATTLEFLOW_DATABASE_URL`），键为 `(orgId, workflowId, stepId, runId)`，独立于任何 SSE 连接：状态机、累积输出、tool 调用、pending HITL 提问、`session_id` 都落库，不只在内存。选 Postgres 而非文件型 registry 的原因：**多实例部署天然共享、可跨进程/实例重启恢复**。
- **生成不依赖客户端在线**：客户端断开时**继续跑**，输出写入 run 的可重放事件缓冲。
- **SSE 变为可重连订阅**：`GET /api/chat?run_id=...` 订阅某 run，配合 `Last-Event-ID` / offset **重放已缓冲事件 + 续接实时**。

### 14.2 三个场景的落地

1. **页面刷新（诉求1）**：刷新后前端按 `(workflowId, stepId)` 查活跃 run → 拿 `runId` → 重新订阅 → 回放已产出内容 + 续接。会话不丢。
2. **切换节点后返回（诉求2）**：切走 = 仅退订 SSE，**不 abort**；run 按 stepId 继续。切回 = 重新订阅。返回上一个工作目录空间若 run 未完成，同样按 stepId 找到活跃 run 续看。
3. **节点 loading（诉求3）**：节点运行态由**服务端真相**驱动（按 stepId 查 run 状态），非仅本地 state。页面加载时拉取全部活跃 run 恢复指示器。

### 14.3 run 状态机

```
idle ──► running ──► completed
            │  ▲          
            │  └──(HITL 回答)   
            ▼                  
        waiting_human ──(超时/取消)──► failed/aborted
            ▲                              ▲
            └──────────── running ─────────┘ (用户显式 stop)
```

- `waiting_human` 与 `running` 视觉区分；跨节点用"需输入"badge 提示。

### 14.4 中断语义（必须细分）

| 触发 | 处理 |
| --- | --- |
| 客户端断开（刷新/切节点/网络抖动） | **继续跑**，不 abort |
| 用户显式点 Stop | abort 当前 run + 结束 SDK 会话 |
| TTL / 最大运行时长兜底 | 强制 abort，防僵尸 run |
| HITL 超时无响应 | 按 §12.2 安全 deny/结束 |

## 15. 多租户隔离

平台多用户/多组织使用。工作流空间的租户前缀该用 **organization ID，不是 user ID**。

- **前缀 ≠ 访问权（关键澄清）**：orgId 前缀只决定**文件在磁盘上的位置**，不授权任何人。"谁能进入某工作流、能否对话"完全由**权限层**（`workflow.read` / resource grants）逐请求判定——可能是组织全员，也可能只是被授权的子集。用 orgId 前缀**不等于**放开组织全员访问。orgId 决定"东西放哪"，权限决定"谁能用"，两者不挂钩。
- **为什么不是 userId**：不是"userId 能挡住别人"，而是工作流是**可共享、可移交的团队资源**（同一 workflow 可被多用户经授权访问）。把文件钉死在 `<userId>/` 下，等于把"归属某一个人"写进物理路径——用户 B 被授权后文件却在 A 名下，GC/配额/归属都别扭。orgId 是资源生命周期的稳定归属者。
- **为什么用 orgId**：路径 `data/workflows/<orgId>/<wfId>/` 带来按租户的**配额、GC、审计、离场批量清理**，且与既有 org 权限模型一致，提供防御纵深。
- **安全澄清（关键）**：路径前缀是**运营/组织收益，不是安全边界**。真正的隔离来自——
  1. 请求层 `requireOrganizationContext` + `workflow.read` / `skill.run` 权限校验；
  2. `cwd` 沙箱 + `PreToolUse` 路径白名单（`../` 能跨任何路径前缀，前缀本身挡不住逃逸）。
- **会话/run 复用门禁**：`session_id` / `runId` 的订阅与 resume 必须先过 `workflow.read` authz，防跨租户 resume 别人的会话。

## 16. 已知约束与待决项

- **并行时序**：同一执行组内并行节点 A、B 同时跑，B 读不到 A 的产物（A 尚未 promote）。"下游复用上游"仅在**串行依赖或跨执行组**成立。并行分支应各自产出，由后续**汇总节点**消费。此约束与"串行/并行最终汇成一份文档"吻合。
- **强制激活**：无 100% 机制保证，靠"物化只放 1 个 Skill" + "注入强指令"叠加逼近。
- **安全前置顺序**：CWD 隔离必须先于开放 Write/Edit 落地；共享 Skill 副本、`artifacts/` 均设只读。开写权限是安全姿态变更，落地时需同步更新 `docs/SECURITY.md`、`scripts/start.sh`、`Dockerfile`、`docker-compose.yml` 的工具默认值，并覆盖 `/api/agent-runtime` 校验。
- **磁盘生命周期**：节点目录随执行累积。工作流归档/删除时递归删 `data/workflows/<orgId>/<wfId>/`；再加按 mtime 的兜底 GC。
- **会话生命周期**：`session_id` 与 run 状态一并存 Postgres 并与 stepId 关联；多实例共享、进程/实例重启后可恢复。节点重跑或工作流归档时废弃对应会话。
- **死字段清理**：前端 `model_id: 'doubao-...'` 未被 adapter 使用，应清理。
- **产物重跑**（已定）：重跑把当前 artifact 播种进 cwd，模型用 `Edit` 增量编辑（或从零重写）；`promoteArtifact` 覆盖当前版 + `version++`，历史可选留档（见 §7.6）。

## 17. 本稿范围外（后续单独讨论）

- Validation / self-check 路径如何在纯工具化后拿到同一 Skill（当前 no-tool 运行）。
- Snapshot 在产物语义调整后的适配。
