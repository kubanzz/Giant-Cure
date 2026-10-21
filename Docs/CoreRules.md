# Giant Cure — Core Rules v1

> 适用范围：Heart Vertical Slice。后续正式版可迭代。

## 1. 玩家移动

Heart Slice 初始拥有：
- Move
- Look
- Jump
- Sprint

初始不拥有 Dash；Heart 恢复后解锁 Circulatory Boost / Dash。

不做二段跳、攀墙、滑铲等复杂动作。

## 2. Suit Integrity

- Max Integrity：Prototype 初始值 100
- 癌细胞攻击、血流冲击、环境危险造成伤害
- 归零触发 Medical Unit Failure
- 不做 Armor / Shield / Resistance / Healing Item

Safe Biological Node 可恢复 Integrity。

## 3. Failure / Retry

- Integrity = 0 → 当前医疗设备失效
- 从最近 Safe Node 重启
- 已完成的大型治疗步骤保留
- Heart Slice **不因失败增加 Cancer Level**
- 不做完整 SaveGame，只做 Session Checkpoint

## 4. Scanner

操作：Q Toggle

原则：
- 不暂停世界
- 不耗能
- 中距离扫描
- 显示 Flow / Pressure / Disease / Weak Point / Link Node
- 提示“症状与状态”，不直接告诉解决方案

## 5. Treatment Tool

玩家从头到尾使用同一主医疗设备。

### 治疗模式
- 左键：Primary Treatment
- 右键：Precision / Aim
- 对病灶累计 Treatment Progress

### 射击模式
- 可攻击癌细胞
- 弱点伤害显著更高
- **无限备弹**
- **有弹匣容量**
- **需要 Reload**
- **不做弹药拾取**
- **不做备弹库存管理**

Prototype 推荐起点：
- Magazine：24 发（可调）
- Reload：1.7 秒（可调）
- Normal Hit：1x
- Weakpoint Hit：3x

是否加入 Heat：暂定 SHOULD，而不是 MUST。先验证“弹匣 + Reload”节奏。

## 6. Biological Link

Heart Slice 只支持：
- A → B
- A → B → C

错误连接：
- 立即失败/断开
- 可有轻微反馈
- 不产生永久惩罚

不做自由绘线、复杂网络、电路预算。

## 7. Interaction

统一 E：
- Activate Node
- Safe Node
- Main Flow Node
- Link Source / Target
- 简单环境交互

## 8. Heart Flow

不做真实流体模拟。

离散 Flow State：
- NoFlow
- Low
- Normal
- High
- Critical

离散 Pressure State：
- Low
- Safe
- High
- Critical

状态驱动：
- Niagara
- Audio
- Force Volume
- Material

血栓安全破除条件示例：

```text
BypassA == Active
AND BypassB == Active
AND ClotStability <= Threshold
```

满足后允许 Main Flow Burst。

## 9. Heartbeat

全关只有一个 Heartbeat Controller。

Heartbeat State：
- Critical
- Weak
- Recovering
- Stable

统一 BeatEvent 驱动：
- Valve
- Camera Shake
- Sound
- Material Pulse
- Environment Movement
- Blood Flow
- Light

禁止各 Actor 独立 Timeline 导致失同步。

## 10. Hunter Cancer Cell

Heart Slice 唯一敌人。

最小状态：
- Idle / Attached
- Detect
- Approach
- Charge
- Lunge
- Recover
- Dead

特点：
- 0.8–1.2 秒清晰扑击 Telegraph
- Scanner 可识别 Cellular Core 弱点
- 首次战斗 1 → 2 → 最多 3 只同屏
- 不做群体战术、掩体、远程攻击、精英变体

## 11. Cancer Growth

Heart Slice 只做脚本化 Unknown Cancer Growth：
- Dormant
- Activated
- Suppressed
- Regrowing

用于：
- 癌症伏笔
- 生成 Hunter
- 展示“普通治疗只能暂时压制”

不建立完整全局 Cancer System。

## 12. UI

常态：
- Suit Integrity
- Crosshair
- Interaction Prompt
- Objective

Scanner：
- Flow / Pressure / Biological Signature / Weak Point

Treatment：
- 简洁 Treatment Progress

普通癌细胞不显示传统血条。

不做：
- Mini Map
- Quest List
- XP
- Currency
- Damage Number
- Enemy Level

## 13. 核心玩家动词

Heart Slice 只要求玩家真正掌握：

**Move / Scan / Treat / Link / Shoot Weakpoint / Avoid Environment**

如果玩家需要记忆十几个系统，则视为设计失败。
