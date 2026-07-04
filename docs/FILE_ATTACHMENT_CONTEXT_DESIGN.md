# 文件附件上下文设计

## 目标

BattleFlow 当前会把用户上传文件的文本内容直接注入到聊天 prompt 中。这会带来两个反复出现的问题：

- 大文档容易在进入 agent 前就被截断，导致关键章节缺失；
- prompt 上下文会快速膨胀，挤占正常对话、工具调用和模型输出空间。

本文档提出一个参考 Kanna 的附件处理方案：**上传文件持久化保存为项目文件，prompt 中只注入附件元数据和文件路径，由 agent 在需要时通过文件工具按需读取。**

## Kanna 参考实现

本次参考的是 `jakemor/kanna`，本地调研副本位于 `tmp/research-kanna`，提交版本为 `9873d72`。

Kanna 的关键做法：

- 上传文件会写入项目目录下的 `.kanna/uploads`。
- 同名文件不会覆盖，会自动追加序号，例如 `notes.txt` 和 `notes-1.txt`。
- 每个上传文件都会变成一个 `ChatAttachment`，包含：
  - `id`
  - `kind`
  - `displayName`
  - `absolutePath`
  - `relativePath`
  - `contentUrl`
  - `mimeType`
  - `size`
- 用户 prompt 不会被展开成完整文件正文。
- Kanna 只在 prompt 后追加一个很小的 XML 风格附件提示：

```xml
<kanna-attachments>
<attachment kind="file" mime_type="application/pdf" path="/abs/project/.kanna/uploads/spec.pdf" project_path="./.kanna/uploads/spec.pdf" size_bytes="1234" display_name="spec.pdf" />
</kanna-attachments>
```

这个设计的关键点是：**模型知道文件在哪里，并且可以通过工具读取文件；但文件正文不会被提前塞进每一轮 prompt。**

## BattleFlow 目标行为

BattleFlow 应从“文件内容注入 prompt”改为“文件路径作为附件上下文”：

1. 用户在工作流聊天里上传或粘贴文件时，BattleFlow 先把文件保存到服务端磁盘。
2. 聊天消息中保存附件元数据。
3. agent prompt 中只包含简短的附件清单。
4. Claude Code 在运行时能访问对应工作目录，并通过文件工具读取附件。
5. 普通 AI 回复继续作为聊天消息展示。
6. 只有用户明确要求生成文档时，才由 BattleFlow 后端把模型输出的结构化文档内容落盘为工作流 artifact 或下载附件。

这样，上传文档会成为一等运行时资产，而不是每次都被转换成 prompt 文本块。

## 存储目录

建议使用工作流维度的附件目录：

```text
data/
└── workflows/
    └── <workspace-id>/
        └── <workflow-id>/
            └── attachments/
                └── <message-id>/
                    ├── <safe-name>.md
                    ├── <safe-name>.docx
                    └── <safe-name>-1.pdf
```

路径处理规则：

- 写入前清洗原始文件名；
- 元数据中保留用户看到的原始显示名；
- 同名文件自动生成唯一存储名，避免覆盖；
- 所有文件必须限制在当前工作流的附件目录下；
- 所有读取和删除 API 都必须拒绝绝对路径和路径穿越。

已确认限制：

- 单文件上限为 100MB；
- 单条消息最多上传 50 个文件；
- 附件放在工作流自己的数据目录下，不放到全局 `data/uploads`；
- prompt 不再按文件大小注入正文，因此附件大小限制只保护上传、存储和解析链路，不代表模型会一次性读取完整文件。

## 附件元数据

建议统一成类似下面的数据结构：

```ts
type WorkflowChatAttachment = {
  id: string;
  workflowId: string;
  stepId: string;
  messageId: string;
  kind: "file" | "image";
  displayName: string;
  storedName: string;
  absolutePath: string;
  relativePath: string;
  contentUrl: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
};
```

字段用途：

- `absolutePath`：给本地 agent runtime 使用。
- `relativePath`：用于 prompt 中的人类可读路径提示。
- `contentUrl`：用于浏览器预览和下载。
- `sha256`：用于去重、审计和后续排查。

## 上传流程

推荐流程：

1. 前端通过 `multipart/form-data` 上传文件。
2. 服务端校验用户身份，并检查当前用户是否有工作流访问权限。
3. 服务端校验文件数量、大小、扩展名和 MIME 类型。
4. 服务端把文件写入工作流附件目录。
5. 服务端把附件元数据写入工作流状态和 Postgres 资源元数据。
6. 前端只渲染附件 chip，不要把文件名自动插入输入框。
7. 用户发送消息时，消息内容保存用户文本和附件 ID。

如果前端提供稳定的 client upload id，上传接口可以支持重试幂等；否则每次上传都应创建新的附件记录。

## Prompt 构造

Prompt 构造时，只追加一个紧凑的 BattleFlow 附件清单：

```xml
<battleflow-attachments>
<attachment id="..." kind="file" mime_type="text/markdown" path="/abs/.../attachments/msg-1/spec.md" workflow_path="./attachments/msg-1/spec.md" size_bytes="49152" display_name="VDI review.md" />
</battleflow-attachments>
```

规则：

- 默认不注入文件正文；
- 默认不把 `.md`、`.docx`、`.pdf`、图片等内容提前解析进 prompt；
- prompt 中要简短说明：附件可通过文件工具读取；
- XML 属性必须做转义；
- 附件清单本身要限制数量和总长度；
- 如果用户没有输入文字，只上传了文件，可以使用中性提示：`请检查这些附件文件。`
- 对大文件，prompt 只告诉模型“文件可按需读取”，不承诺模型会一次性读取完整文件。

## Agent Runtime 要求

agent runtime 需要满足：

- 运行目录可以访问当前工作流附件；
- 允许安全的文件读取和检索工具访问附件目录；
- 不允许越权访问 secrets、系统目录或其它工作流目录；
- prompt 中包含附件路径清单；
- 由模型根据任务需要决定读取、搜索或摘要哪些文件。

对 Claude Code 来说，推荐做法是：让 CLI 在工作流 runtime 目录中运行，并把附件文件放在该目录可访问范围内。对 Codex 类 runtime 也是同样思路：把附件挂载或复制到 agent 工作区，并传入路径清单。

## Claude Code 工具策略

当前 BattleFlow 的 AI 对话基于 `claude -p`。这个方案可以满足附件按需读取的目标，关键是不要把文件正文提前塞进 prompt，而是给 `claude -p` 一个受控工作目录和最小必要工具。

推荐默认工具：

| 工具 | 用途 | 默认启用 |
| --- | --- | --- |
| `Read` | 按路径读取用户上传的文本附件、解析后的 sidecar 文件、工作流产物 | 是 |
| `Grep` | 在大文件或多文件附件中按关键词查找相关片段 | 是 |
| `Glob` | 列出当前工作流附件目录中的可用文件 | 是 |
| `WebSearch` | 处理需要联网搜索的问题 | 是 |
| `WebFetch` | 读取用户提供的网页 URL | 是 |
| `Write` / `Edit` / `MultiEdit` | 直接写入或修改文件 | 否 |
| `Bash` | 执行任意命令 | 否 |

工具边界：

- 普通对话不需要给模型直接写文件能力。
- 用户明确要求生成文档时，模型返回结构化文档内容，BattleFlow 后端负责创建 artifact 文件。
- 如果后续需要让模型在某个目录内编辑产物，应单独设计“artifact 生成模式”，只允许写入受控 artifact 目录，不能把 `Write`、`Edit`、`MultiEdit` 作为全局默认工具。
- `.docx`、`.pdf`、表格等复杂文件的解析由 BattleFlow 服务端或受控解析工具完成，生成 `.extracted.md` / `.extracted.txt` sidecar 后再交给模型通过 `Read`、`Grep` 使用。
- 如需执行解析命令，也应由 BattleFlow 后端调度固定命令，不建议把广义 `Bash` 暴露给普通聊天 runtime。

实现注意：

- 运行 `claude -p` 时，需要确保工作目录或 `--add-dir` 覆盖当前工作流附件目录。
- 工具白名单已扩展为 `Read`、`Grep`、`Glob`、`WebSearch`、`WebFetch`，但仍保持默认最小授权。
- `Read`、`Grep`、`Glob` 只能看到当前工作流 runtime 目录；不能看到其它工作流、`.env`、凭据或系统路径。

## 文档解析策略

BattleFlow 不应该把所有上传文件都急切解析成 prompt 文本。解析应改为显式或按需行为：

- 小型文本文件、Markdown、JSON、CSV 可以由 agent 通过 `Read` 直接读取；
- 大型文本文件优先通过 `Grep` 定位，再读取局部片段；
- `.docx`、`.pdf`、表格等复杂文件，在服务端或受控解析工具中提取为 sidecar 文本文件，再由 agent 读取 sidecar；
- 只有用户明确把文件导入知识库时，才进入知识库索引流程；
- 不再自动把完整文档注入 prompt。

这样可以把三类场景区分清楚：

- 聊天附件：本轮或当前步骤对话中使用的文件；
- 工作流产物：某个工作流步骤生成的文件；
- 知识库文档：需要被索引并用于语义检索的资料。

对 100MB 级文件的处理原则：

- 模型不应该尝试一次性读完整文件；
- 先用文件名、MIME、大小、页数或解析摘要理解文件类型；
- 再根据用户问题用 `Grep`、章节目录、页码、标题或关键词定位相关片段；
- 如果确实需要全量处理，应走后台索引、分块摘要或知识库检索链路，而不是单轮 prompt 注入。

## AI 回复与文档产物的展示规则

当前 UI 还需要区分普通回复和生成文档：

- 普通解释型回复继续作为 AI 聊天气泡展示；
- 只有模型明确创建文件，或用户明确要求生成文档时，才展示为附件或 artifact；
- 不应该把每一段 AI 回复都自动保存成 Markdown 输出文档；
- artifact 卡片应该引用真实保存的文件，而不是普通聊天文本。
- 对 `claude -p` 来说，“生成文档”不要求模型拥有写文件工具；模型输出文档内容或结构化 artifact payload，BattleFlow 后端负责保存文件并返回附件卡片。

这样可以避免“普通回答被错误展示成 Skill 输出文档”的问题。

## 安全边界

必须具备的安全控制：

- 上传、预览、下载、删除都必须鉴权；
- 服务附件前必须检查当前用户是否有工作流访问权限；
- 所有路径必须 normalize，并拒绝路径穿越；
- 限制单文件大小、单消息附件数量和总大小；
- MIME 类型和文件大小以服务端检测为准；
- 上传的 runtime 数据不能提交进 Git；
- 无权限用户不能看到绝对路径；
- 用户取消发送或上传失败时，要清理孤儿附件。

当前实现补充：

- 服务端会把上传文件写入 `data/workflows/<workspace-id>/<workflow-id>/attachments/<message-id>/`。
- 前端发送消息时只携带附件 ID 和元数据；`/api/chat` 会重新从服务端 workflow 记录中查找附件，避免信任客户端传入的绝对路径。
- `.doc`、`.docx`、`.pdf`、`.xlsx` 会在服务端生成 `.extracted.md` sidecar，模型可优先读取 sidecar。
- 服务端和前端均限制单文件 100MB；前端限制单条消息最多 50 个文件，服务端也按 `messageId` 做数量兜底。
- 下载接口通过 `/api/workflows/uploads?workflow_id=...&attachment_id=...` 提供，需要当前用户具备工作流读取权限。

## 迁移策略

建议分阶段落地：

1. 新上传附件默认使用路径型附件存储和 prompt manifest。
2. 修改聊天输入框：粘贴或上传文件时只创建附件 chip，不再把文件名插入输入框。
3. 修改 agent prompt：只传附件元数据，不传文件正文。
4. 修改 agent runtime：允许 `Read`、`Grep`、`Glob` 访问当前工作流附件目录。
5. 修改工作流输出逻辑：普通 AI 回复保持聊天消息，不自动变成文档 artifact。
6. 对历史已经注入 prompt 的附件，不做内容回填迁移；历史消息保留原样，避免再次放大上下文。
7. 如果历史记录还能找到原始附件文件或 asset 记录，可以补充附件元数据链接；如果找不到原始文件，就不反向生成虚假附件。
8. 路径型附件稳定后，移除或降低当前上传文件 prompt 字符上限。

## 验证计划

最低验证项：

- 上传同名文件，确认两个文件都被保留；
- 上传一个较大的 Markdown 文件，确认 prompt 里只有附件元数据；
- 让 agent 检查附件内容，确认它通过文件路径读取；
- 粘贴文件到输入框，确认不会自动插入文件名；
- 取消上传或取消发送，确认孤儿文件被清理；
- 非授权用户访问附件，确认被拒绝；
- 普通 AI 回复不会被转换成文档 artifact；
- 明确要求生成文档时，仍然能返回可下载附件。

## 已确认决策摘要

- 单文件上限：100MB。
- 单条消息文件数上限：50 个。
- 附件目录：放在工作流自己的 `data/workflows/<workspace-id>/<workflow-id>/attachments/` 下。
- `.docx` / `.pdf` 解析：由 BattleFlow 服务端或受控解析工具生成 sidecar 文本文件，agent 只读取 sidecar 或原始可读文本。
- 历史 prompt 注入内容：保留历史消息，不把已注入正文重新迁移进新 prompt；能找到原始文件时只补附件元数据链接。
- `claude -p` 可继续作为 AI 对话 runtime，但需要默认启用 `Read`、`Grep`、`Glob`、`WebSearch`、`WebFetch` 这类最小必要工具。
- 写文件能力不作为默认工具开放；文档生成由模型输出内容、BattleFlow 后端负责落盘。
