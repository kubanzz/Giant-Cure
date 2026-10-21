# Giant Cure — Project Plan v0.3

## 1. 状态定义

- `TODO`：未开始
- `READY`：前置完成，可以开始
- `IN_PROGRESS`：开发中
- `BLOCKED`：被依赖或问题阻塞
- `REVIEW`：已实现，等待人工验收
- `DONE`：验收通过
- `REWORK`：需返工
- `DROPPED`：取消
- `LOCKED`：当前阶段禁止开发

## 2. 优先级

- `P0`：阻塞当前 Gate
- `P1`：Heart Slice 必须
- `P2`：明显提升体验
- `P3`：可选
- `BACKLOG`：未来考虑

## 3. 阶段 Gate

```text
Sprint 0  工程初始化
   ↓
Sprint 1  Functional Prototype
   ↓ Gate A
Sprint 2  Gameplay Vertical Slice
   ↓ Gate B
Sprint 3  Visual Vertical Slice
   ↓ Gate C / Blind Playtest
GO / ITERATE / NO-GO
```

肺、脑、Immune Nexus、Primary Tumor：`LOCKED`

---

# Sprint 0 — Project Bootstrap

目标：建立可编译、可版本控制、Codex 可工作的 UE5 C++ 工程。

| ID | 状态 | P | 任务 | 依赖 | 产出 |
|---|---|---:|---|---|---|
| S0-001 | DONE | P0 | 创建 UE5 C++ First Person 工程 | - | `.uproject` |
| S0-002 | DONE | P0 | 初始化 Git + Unreal `.gitignore` | S0-001 | Git repo |
| S0-003 | DONE | P0 | 建立 Source / Content 目录 | S0-001 | 目录基线 |
| S0-004 | DONE | P0 | 加入 Docs 与 `AGENTS.md` | S0-002 | 工程文档 |
| S0-005 | DONE | P0 | 建立最小 Dev Test Map | S0-001 | `L_Dev_Core` |
| S0-006 | DONE | P0 | 验证 Development Build / Editor 编译 | S0-001 | 可编译基线 |

### Sprint 0 Done
- Editor 可启动
- C++ 编译通过
- Git 干净
- Codex 可读取文档
- Dev Test Map 可运行

---

# Sprint 1 — Functional Prototype / Gate A

目标：不用正式美术，跑通“Scan → Treat → Link → Flow → Heart Restore”核心功能。

## 1A — Player & Interaction

| ID | 状态 | P | 任务 | 依赖 | 验收 |
|---|---|---:|---|---|---|
| S1-001 | DONE | P0 | 基础移动 / Look / Jump / Sprint | S0 | PIE 正常控制 |
| S1-002 | DONE | P0 | `IGCInteractable` + Interaction Trace | S1-001 | 可 Focus/Interact 测试 Actor |
| S1-003 | DONE | P0 | Suit Integrity | S1-001 | 可受伤、归零触发失败 |
| S1-004 | DONE | P1 | Safe Node / Session Checkpoint 最小实现 | S1-003 | 可恢复并从最近点重试 |

## 1B — Scanner

| ID | 状态 | P | 任务 | 依赖 | 验收 |
|---|---|---:|---|---|---|
| S1-010 | DONE | P0 | Scanner Toggle | S1-001 | Q 可开关 |
| S1-011 | DONE | P0 | Scannable 接口 | S1-010 | 测试 Actor 暴露状态 |
| S1-012 | DONE | P1 | Flow / Pressure / Weak Point 基础高亮 | S1-011 | Dev Map 可区分三类信息 |

## 1C — Treatment Tool

| ID | 状态 | P | 任务 | 依赖 | 验收 |
|---|---|---:|---|---|---|
| S1-020 | DONE | P0 | Treatment Tool 基础 Actor/Component | S1-001 | 可发射/治疗 |
| S1-021 | DONE | P0 | Treatable Progress | S1-020 | 0→100 完成事件 |
| S1-022 | DONE | P0 | 弹匣 + 无限备弹 + Reload | S1-020 | 空弹匣不能射；Reload 恢复弹匣 |
| S1-023 | DONE | P0 | Weak Point 伤害倍率 | S1-020,S1-012 | 弱点明显高伤害 |
| S1-024 | TODO | P2 | Tool Heat Prototype | S1-020 | 仅在确有必要时做 |

## 1D — Biological Link

| ID | 状态 | P | 任务 | 依赖 | 验收 |
|---|---|---:|---|---|---|
| S1-030 | REVIEW | P0 | A→B Link | S1-002 | 可连接固定 Source/Target |
| S1-031 | REVIEW | P1 | A→B→C 顺序 Link | S1-030 | 顺序校验可用 |

## 1E — Heart Systems

| ID | 状态 | P | 任务 | 依赖 | 验收 |
|---|---|---:|---|---|---|
| S1-040 | TODO | P0 | Heartbeat Controller | S0 | 单一 BeatEvent |
| S1-041 | TODO | P0 | Flow Segment 离散状态 | S1-040 | Flow/Pressure 可切换 |
| S1-042 | TODO | P0 | Bypass A/B 状态 | S1-041,S1-030 | 两条侧支可分别恢复 |
| S1-043 | TODO | P0 | Thrombus Stability + Weak Points | S1-021,S1-041 | 可软化、满足条件 |
| S1-044 | TODO | P0 | Main Flow Burst / Clear Thrombus | S1-042,S1-043 | 正确条件下冲开 |
| S1-045 | TODO | P0 | Conduction Nodes | S1-031,S1-040 | 完成后切 Stable |
| S1-046 | TODO | P0 | Heart Recovery State | S1-044,S1-045 | 可触发恢复 |

## Gate A 验收

必须在 Greybox/Dev Map 跑通：

**Scan → 找血栓 → 恢复 Bypass A/B → 软化弱点 → Flow Burst → 修复传导 → Heart Stable**

若不好玩，不进入视觉制作。

---

# Sprint 2 — Gameplay Vertical Slice / Gate B

目标：完成 12–15 分钟完整可玩 Heart Flow。

| ID | 状态 | P | 任务 |
|---|---|---:|---|
| S2-001 | TODO | P0 | Heart Greybox 7 区域 |
| S2-002 | TODO | P0 | Segment 流程与触发器 |
| S2-003 | TODO | P0 | Hunter Cancer Cell 最小 AI |
| S2-004 | TODO | P0 | Hunter Weak Point / Damage / Death |
| S2-005 | TODO | P1 | Unknown Cancer Growth 脚本 Actor |
| S2-006 | TODO | P1 | Scanner 最小 UI |
| S2-007 | TODO | P1 | Treatment / Reload / Interaction Feedback |
| S2-008 | TODO | P1 | Integrity / Failure / Checkpoint 流程 |
| S2-009 | TODO | P1 | Heart Recovery 演出占位 |
| S2-010 | TODO | P1 | Circulatory Boost / Dash 解锁并立即使用 |
| S2-011 | TODO | P1 | 巨人外部反馈占位镜头 |
| S2-012 | TODO | P0 | 第一次内部完整通关测试 |
| S2-013 | TODO | P0 | Blind Playtest Build |

## Gate B 验收

- 首次流程 12–15 分钟附近
- 玩家能理解 Scanner
- 血栓治疗不是“按住左键”
- 弱点战斗成立
- Heart Recovery 有明显情绪反馈
- 至少多数测试者愿意继续玩 Lung

不通过：ITERATE，不进入正式美术。

---

# Sprint 3 — Visual Vertical Slice / Gate C

只有 Gate B 通过才解锁。

| ID | 状态 | P | 任务 |
|---|---|---:|---|
| S3-001 | LOCKED | P0 | Heart Art Direction Lock |
| S3-002 | LOCKED | P0 | Modular Asset List |
| S3-003 | LOCKED | P1 | AI Concept → Meshy → Blender Pipeline |
| S3-004 | LOCKED | P1 | Organic Master Material |
| S3-005 | LOCKED | P1 | Blood Flow Niagara |
| S3-006 | LOCKED | P1 | Scanner Post Process |
| S3-007 | LOCKED | P1 | Heartbeat WPO / Environment Pulse |
| S3-008 | LOCKED | P1 | Cancer Growth / Hunter Visual |
| S3-009 | LOCKED | P1 | Core Audio Pass |
| S3-010 | LOCKED | P1 | Lighting Pass |
| S3-011 | LOCKED | P1 | Giant External Shot |
| S3-012 | LOCKED | P0 | Release Candidate Playtest |

---

# WON'T — Heart Slice 禁止

- Lung / Brain / Immune Nexus / Primary Tumor
- Full Cancer Level
- 完整 Disease Framework
- 多敌人类型
- Boss
- Inventory
- Loot
- Crafting
- Skill Tree
- Optional Build System
- Multiple Weapons
- 弹药拾取 / 有限备弹库存
- Complex SaveGame
- Steam Integration
- Achievements
- Localization
- Difficulty Modes
- Advanced AI
- Procedural Organ Generation
- Real Fluid Simulation
- Multiplayer
