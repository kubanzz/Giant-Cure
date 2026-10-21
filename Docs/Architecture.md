# Giant Cure — UE5 Architecture v0.1

> 目标：只为 Heart Vertical Slice 建立“足够清晰、不过度设计”的架构。

## 1. 架构原则

1. C++ 负责稳定、复用的 Gameplay 核心。
2. Blueprint 负责关卡装配、表现触发与参数配置。
3. DataAsset 只在确实需要数据驱动时使用。
4. 不为肺/脑/免疫系统提前抽象完整框架。
5. Heartbeat、Flow 等跨场景同步系统必须有单一权威来源。
6. 每个 Task 必须可独立编译、进入 Editor 验证。

## 2. 推荐源码目录

```text
Source/GiantCure/
├── Core/
├── Player/
├── Interaction/
├── Scanner/
├── Treatment/
├── BiologicalLink/
├── Organ/
│   └── Heart/
├── Disease/
│   ├── Thrombus/
│   └── Cancer/
├── Combat/
├── Checkpoint/
└── UI/
```

## 3. 推荐 Content 目录

```text
Content/GiantCure/
├── Core/
├── Player/
├── Heart/
│   ├── Maps/
│   ├── Greybox/
│   ├── Flow/
│   ├── Heartbeat/
│   ├── Thrombus/
│   └── Conduction/
├── Cancer/
├── Treatment/
├── Scanner/
├── Materials/
├── VFX/
├── Audio/
├── UI/
├── Data/
└── Dev/
```

## 4. 核心类建议

### Player
`AGCPlayerCharacter`
- 基础移动
- 输入绑定
- 持有 Scanner / Treatment / Link 使用入口

`UGCSuitIntegrityComponent`
- CurrentIntegrity
- Damage / Restore
- Failure Event

### Interaction
`IGCInteractable`
- CanInteract
- BeginFocus / EndFocus
- Interact
- GetPrompt

`UGCInteractionComponent`
- Trace
- 当前 Focus Actor
- 调用交互接口

### Scanner
`UGCScannerComponent`
- Scan Active
- 扫描范围/视线
- 请求目标暴露 Scan Data

`IGCScannable`
- GetScanCategory
- GetScanState
- GetScanHighlightData

不要把具体 UI 文案硬编码到 Scanner。

### Treatment
`AGCTreatmentTool`
- Treatment / Combat 输入
- Magazine
- AmmoInMagazine
- InfiniteReserve = true
- Reload
- Fire / Treat

`UGCTreatableComponent`
- TreatmentProgress
- ApplyTreatment
- OnTreatmentCompleted

`UGCWeakPointComponent`
- DamageMultiplier
- Scan Visibility

### Biological Link
`UGCBiologicalLinkComponent`
- 当前 Source
- Target
- Link Sequence
- ValidateLink
- CompleteLink

Heart Slice 仅支持固定 Link Sequence，不做通用图网络系统。

### Heart
`AGCHeartController`
- HeartState
- BeatRate / BeatPhase
- 广播 BeatEvent
- 控制恢复演出

`UGCFlowSegmentComponent`
- FlowState
- PressureState
- UpdateVisualState / Force State

`AGCFlowNode`
- Bypass / Main Flow 关卡节点

### Thrombus
`AGCThrombusActor`
- ClotStability
- WeakPoints
- BypassRequirement
- CanTriggerBurst
- TriggerClearSequence

不要把 Thrombus 继承成“大而全 DiseaseBase”再预留几十种疾病接口。

### Cancer
`AGCHunterCancerCell`
- 最小状态机 / AI
- Weak Point
- Damage / Death

`AGCUnknownCancerGrowth`
- Dormant / Activated / Suppressed / Regrowing
- Scripted Spawn

### Checkpoint
`AGCSafeNode`
- Restore Integrity
- Register Session Checkpoint

`UGCSessionProgressSubsystem` 或轻量 Controller
记录 Heart Slice 当前重要状态：
- Segment
- Bypass A/B
- Thrombus
- Conduction
- Heart Recovery

不做磁盘 SaveGame。

### UI
`UGCHUDWidget`
- Integrity
- Objective
- Interaction

`UGCScannerWidget`
- Scan State
- Flow / Pressure / Signature

`UGCTreatmentProgressWidget`
- Treatment 进度

## 5. Blueprint 职责

Blueprint 适合：
- 关卡节点摆放
- 演出触发
- Niagara / Audio / Material 参数
- Heart Chamber Event Sequence
- 具体阀门动画
- Thrombus Clear Sequence
- 巨人外部最小反馈

C++ 不应承载大量一次性演出逻辑。

## 6. 事件关系

```text
Player
 ├─ ScannerComponent
 ├─ InteractionComponent
 ├─ SuitIntegrityComponent
 └─ TreatmentTool
        ↓
WeakPoint / Treatable / Cancer Cell

HeartController
 └─ BeatEvent
      ├─ Valve
      ├─ FlowSegment
      ├─ Camera Feedback
      ├─ Audio
      └─ Material/VFX

Bypass A/B
   ↓
Flow State
   ↓
Thrombus Conditions
   ↓
Main Flow Burst
   ↓
Heart Chamber / Conduction
   ↓
Heart Recovery
```

## 7. 明确禁止的提前抽象

当前不创建：
- Full CancerManager
- Full Disease Registry
- Full Organ Framework
- Generic Skill Tree
- Inventory
- Loot
- Ammo Pickup
- Complex Save System
- GAS（除非后续 Prototype 明确证明必要）
- 流体物理模拟框架

原则：
> 只有第二次真实复用出现时，才讨论抽象。
