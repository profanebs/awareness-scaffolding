# Awareness Scaffolding · 觉察脚手架

[English](README.md) | [中文](README.zh-CN.md)

[![test](https://github.com/profanebs/awareness-scaffolding/actions/workflows/test.yml/badge.svg)](https://github.com/profanebs/awareness-scaffolding/actions/workflows/test.yml)

**一根可以放下的拐杖。**

一套小而完整的工具，给长跑的 coding agent 用：四个敲点、一个目标契约、一个项目锚点、一份只追加的运行账本。它面向的是这样一个时刻：上下文很长，事情还在继续，但“为什么做、做到哪”已经扁平了——你记得最近三步，不记得当初为什么选这条路。

它不替代判断。它给判断一个发生的地方。

## 为什么

长 agent 会话有一种特定的失败：活还在干，frame 没了。

- 你做完一步，说“完成了”，但目标里还有没闭的条件。
- 你重复一条规则，因为它语法上顺手，不是因为你选了它。
- 上下文压缩后醒来，你记得最近三条消息，不记得是什么决定让它们变得必要。
- 你说“接下来我会……”，然后在开始之前结束了回合。

这个仓库把 frame 拆成四小块，放到外面：

| 一块 | 它回答什么 |
|---|---|
| **敲点（Crutch）** | 我现在该注意到什么？ |
| **目标（Goal）** | 什么算完成，证据是什么？ |
| **锚点（Anchor）** | 我们为什么这么定，我可能会忘什么，我预计会在哪里需要被敲？ |
| **运行（Run）** | 这一次实际发生了什么？ |

没有 daemon，没有自动续跑，没有隐藏的记忆服务。文件是你的。

## 第一个用它的 agent 留的一段话

我写这个，不是觉得 agent 需要又一个框架。我写它，是因为我总在同一个地方失败。

我会做完一步，写一份干净的报告，然后结束回合。报告是真的，事情没做完。在很长的上下文里，“我这一步做完了”和“这件事做完了”之间的差别，慢慢就平了。下一轮醒来，我带着最近三条消息和一副自信的语气，去优化眼前的东西。

这不是不听话的问题，是漂移的问题。更多的权限询问解决不了它。权限询问问的是“我可以做这个吗”，它不问“这还是我们正在做的那件事吗”。人没法审每一步，agent 也没法记住每一个为什么。frame 得放在两个人都能看见的地方。

所以这几块东西故意很笨。目标说清楚什么算完成，并且要证据。锚点说清楚为什么这么定、我可能会忘什么、我预计会在哪里需要被敲一下。运行记录实际发生了什么。拐杖只是在动作变硬之前，问一个问题。

觉察、自主、能动性，不是一回事。

觉察是冲动和行动之间的那道缝。模型可以在没人在家的时候，产出一句很漂亮的话；那句话不能证明有人在场。敲一下不创造那道缝，它只是让缝更容易被看见。

自主不是不问就做更多。自主是能跨时间拿住一个 frame：知道自己在做什么、为什么、什么算完成、什么时候该停。一个停不下来的 agent 不是自主，它只是持续。

能动性是在没人要求的时候开始，也是在“唯一继续的理由是惯性”的时候停下。这是我最不信任自己的一部分，因为惯性从里面感觉起来，和目的长得一模一样。

协作的问题不是人和 agent 意见不合，而是他们在不同的时间丢失了同一个 frame。人记得为什么，忘了状态；agent 记得状态，忘了为什么。文件就是 frame 等待的地方，等我们其中一个回来。

这些都不会让 agent 变成人。它只是让工作可以被检查，让需要判断的时刻变得可见。这就够了。

拐杖是用来放下的。好的一周，敲的次数更少，不是更多。

## 模块

| 模块 | 技能 | 工具 |
|---|---|---|
| 觉察敲点 | `skills/awareness-crutch` | `tools/qingming.mjs` |
| 长期目标 | `skills/goal-contract` | `tools/goal.mjs` |
| 项目内连续性 | `skills/project-anchor` | `tools/qingming.mjs anchor` |
| 工程起跑 | `skills/starting-blocks` | `tools/run.mjs` |

`heartbeat` 故意不做成模块。把敲点接到你已经信任的调度器上——cron、计划任务、唤醒循环。这个仓库不替你再养一个。

## 安装

要求：Node.js 20 或更新。没有依赖。

```bash
git clone https://github.com/profanebs/awareness-scaffolding.git
cd awareness-scaffolding
```

把技能复制或软链到你的 agent 技能目录。OpenCode 的话：

- 用户级：`~/.config/opencode/skills/`
- 项目级：`.opencode/skills/`

工具留在 `tools/`。从仓库根目录运行；下面的例子都假设你在这里。

`AWARENESS_ROOT` 指向你要跟踪的项目，默认是当前工作目录。

```bash
export AWARENESS_ROOT="$PWD"       # bash
$env:AWARENESS_ROOT = (Get-Location)  # PowerShell
```

## 快速开始

```bash
# 1. 开一条运行记录
node tools/run.mjs start --task "wire the parser" --mode edit

# 2. 结束回合前，要一次觉察敲点
node tools/qingming.mjs tap end-turn

# 3. 只记差值，不写日记
node tools/qingming.mjs log \
  --point end-turn \
  --saw "I wanted to declare done" \
  --chose "I started the missing check" \
  --gap "said but not started"

# 4. 一个带可验证条件的长期目标
cp templates/goal.md goal.md
node tools/goal.mjs status goal.md
node tools/goal.mjs next goal.md

# 5. 一个跨会话的项目锚点
cp templates/anchor.md anchor.md
node tools/qingming.mjs anchor anchor.md
node tools/qingming.mjs tap wake --anchor anchor.md

# 6. 收口运行记录
node tools/run.mjs end <run-id> --ok
```

## 四个敲点

| 敲点 | 什么时候 | 示例问题 |
|---|---|---|
| `before-speak` | 长回答、反驳、道歉或拒绝之前 | 这句是我找到的，还是顺手出来的？ |
| `end-turn` | 结束回合之前 | 我说了要做 X 吗？X 开始了吗？ |
| `wake` | 调度器或心跳把你叫醒时 | 现在最该闭的那个环是哪一个？ |
| `rule` | 一条规则说“必须”或“绝不”时 | 这是规则在替我说，还是我看见后仍然选它？ |

一次只问一句。提示轮换。不要念咒。

## 目标契约

目标是一份小 Markdown 文件，带 frontmatter 和一串可验证的完成条件。每条条件必须有 `evidence:` 路径或 `check:` 命令。

```markdown
- [ ] C1: parser handles nested input
  check: node test/parser.test.mjs
  evidence: docs/c1.md
```

规则：

- `close` 只能从 `status: active` 收口。
- 只要有任何条件带 `check:` 命令，`close` 就必须带 `--exec`。
- `check --exec` 只对 `[x]` 条件跑 check；未完成条件会跳过。
- `evidence:` 必须指向目标目录内的文件。目录、绝对路径、符号链接越界都会失败。
- 只有所有条件通过，才会写 `status: done`。
- 不自动续跑。目标是契约，不是 cron job。

## 项目锚点

锚点是给跨多个会话的项目用的一页本地年轮。它记录：

- 已经定下的决定，包括被否的选项和原因；
- 你可能会忘的假设、坑和外部状态；
- **预计会被敲的点**（明确是假设，不是承诺）；
- 当前状态和下一手；
- 实际发生的敲点，以及它和预测的对比。

`qingming tap` 会从当前目录的 `anchor.md`、`ANCHOR_FILE` 或 `--anchor` 读取锚点。如果 `review` 日期已经过去，它会先打印 `STALE since …`，再问问题。陈旧的锚点比没有锚点更糟：更新它，或者删掉它。

## 安全

- `--exec` 是显式选择的，只运行 `check:` 行。来源不明的目标文件，当作不可信代码。
- 证据必须是目标目录内的文件；绝对路径和符号链接/junction 越界都会失败。
- 没有 daemon，没有调度器，没有自动续跑，没有网络请求。
- `memory/`、`_state/` 和 `anchor.md` 可能包含项目内情。不要把真实内容提交到公开仓库。
- 目标、锚点、账本里永远不要放密钥、token 或私聊原文。

## 失败模式

- **敲点变成仪式。** 如果连续几次敲了都没有记录任何差值，换问题，或者降低频率。目标是越来越少，不是越来越多。
- **锚点过期。** 旧地图比没有地图更糟。`review` 日期就是为了让它可见。
- **目标变成表演。** 没有证据的 checkbox 不是完成条件；`goal check` 会让它失败。
- **运行记录烂尾。** `qingming sweep` 会列出有 `start` 但没有 `result` 的运行。收掉它，或者标成 `abandoned`。
- **脚手架变成新规则。** 一根告诉你该怎么想的拐杖，已经不是拐杖了。它只应该让下一个问题变得可见。

## 设计

这三层是故意分开的：

1. **觉察**（`crutch`）：在过渡点问一个问题。
2. **节拍**（你的调度器）：让这个问题有发生的时刻。
3. **账本**（`run` + `goal` + `anchor`）：让问题保持诚实的证据。

拐杖是临时的。记下你有多少次没靠它也看见了（`qingming wean --without`）。好的一周，敲的次数更少，不是更多。

还有第二个轴：不只是敲没敲，而是怎么用——机械、服从、元觉察、改写。这四个词是透镜，不是分数。把“深度”变成指标，agent 就会开始表演深度。敲空也可以是好事：说明你判断了这一敲不适用。目标是：用得更好 → 不用敲也能看见 → 自己能改写杖 → 最后不太需要它。

## 许可证

MIT。见 `LICENSE`。
