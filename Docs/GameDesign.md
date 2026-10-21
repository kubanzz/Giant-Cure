# Giant Cure — Game Design Baseline v0.3

## 1. 产品定位

### 类型
3D 第一人称、生物奇观冒险、治疗/环境机制驱动、轻探索、轻战斗。

### 核心卖点
玩家进入濒死巨人体内，穿越巨大的器官世界，诊断并治疗病灶，阻止癌细胞扩散；随着器官逐步恢复，巨人的身体反过来赋予玩家能力，最终与免疫系统协同反攻原发肿瘤。

### 一句话体验
**进入濒死巨人体内，治愈器官、修复生命系统，并用巨人自身的力量发动最终抗癌反攻。**

## 2. 体验比例

全游戏目标比例：
- 治疗 / 环境机制：50%
- 探索：25%
- 战斗：25%

Heart 作为教学章可暂时偏向：
- 治疗 / 环境机制：55%
- 探索：30%
- 战斗：15%

最终原发肿瘤章节可阶段性提升至约 70% 战斗，以兑现前期成长。

## 3. 核心 Gameplay Loop

**Explore → Scan → Understand → Treat → Fight → Restore**

中文表达：
**探索 → 发现异常 → 扫描诊断 → 理解病因 → 操纵环境/治疗 → 抵抗疾病反应 → 器官恢复**

核心原则：
> 疾病不能只是“换皮怪物”。治疗本身必须成为 Gameplay。

## 4. 三个基础工具

### Scanner
负责发现：
- 血流与压力异常
- 疾病信号
- 弱点
- Biological Link 节点

原则：Scanner 告诉玩家“发生了什么”，不直接告诉玩家“应该怎么做”。

### Treatment Tool
同一套医疗设备承担：
- 治疗病灶
- 净化/压制异常组织
- 对癌细胞进行射击战斗

战斗资源规则：
- **无限备弹**
- **存在弹匣容量**
- **需要 Reload**
- **不需要搜刮、拾取或管理备弹**
- 后期由 Antibody Targeting + Cytotoxic Payload 将同一武器升级为高效抗癌武器

### Biological Link
负责：
- 连接断裂身体结构
- 激活节点
- 恢复传导
- 校正部分生物系统

Heart Slice 只支持 A→B 与 A→B→C，不做复杂网络布线。

## 5. 疾病设计语言

### FLOW — 血栓
控制血流 → 恢复侧支 → 软化血栓 → 利用身体自身血流冲开。

### CONTAIN — 感染
追踪感染链 → 隔离传播路径 → 净化感染核心 → 引导免疫系统清扫。

### CONNECT — 神经异常
追踪错误信号 → 找到断点/错序 → 建立连接 → 恢复同步。

### TARGET — 癌变
识别癌变 → 控制外围 → 切断供养 → 压制/取样 → 免疫靶向 → 终局反攻。

癌症不是与前三类并列的普通疾病，而是贯穿全局的主线敌人。

## 6. 能力成长体系

### 基础工具
- Scanner
- Treatment Tool
- Biological Link

### 主线器官能力
- Heart → **Circulatory Boost**：机动 / Dash
- Lung → **Oxygen Overdrive**：短时爆发，加快治疗、射击、连接与动作节奏
- Brain → **Neural Overclock**：感知加速 / 世界减速

### Immune Nexus 终局强化
- **Antibody Targeting**：更快速识别癌细胞弱点
- **Cytotoxic Payload**：高效率、低误伤抗癌攻击模式
- **Immune Beacon**：召唤免疫细胞协同作战

### Optional Biological Nodes
每章约 2–3 个可选节点；只强化已有能力，不无限新增主动技能。

探索奖励应让最终战“更爽”，而不是简单让 Boss HP 更低。

## 7. 五章主线

### Prologue
巨人倒在山谷，生命指标濒危。玩家进入体内。

### Chapter 1 — Heart / FLOW
- 血栓 + 心脏传导异常
- 学习 Scanner / Treatment / Biological Link
- 初遇少量癌细胞
- 解锁 Circulatory Boost
- 留下 UNKNOWN CELLULAR ANOMALY 伏笔

### Chapter 2 — Lung / CONTAIN
- 肺部感染
- 追踪感染源、隔离、净化
- 第一次利用免疫系统协同
- 异常组织出现再生
- 解锁 Oxygen Overdrive

### Chapter 3 — Brain / CONNECT
- 神经断裂、错序与异常信号
- 正式确认转移性癌症
- 获取 Tumor Sample
- 解锁 Neural Overclock

### Chapter 4 — Immune Nexus
- 短而强的 Power Transformation
- 解除免疫抑制
- 分析 Tumor Sample
- 获得 Antibody Targeting / Cytotoxic Payload / Immune Beacon
- 锁定原发肿瘤位置

### Chapter 5 — Primary Tumor
复用 FLOW / CONTAIN / CONNECT / TARGET：
1. 切断肿瘤供血
2. 解除免疫抑制
3. Cancer War 爽射
4. 深入肿瘤内部
5. Targeted Therapy 终结核心
6. 巨人苏醒

## 8. 视觉方向

不走医学写实与纯血肉恐怖。

关键词：
- Stylized Biological
- Organic
- Monumental
- Surreal
- Bioluminescent
- Giant Scale

要求：关闭 HUD 后，心脏、肺、脑、癌变区必须具有清晰视觉语言差异。

## 9. Scope 护栏

禁止第一版加入：
- 开放世界
- 联机
- Crafting
- Loot
- 装备随机词条
- 大型技能树
- 多武器体系
- 真流体模拟
- 程序化完整器官生成
- 复杂经济系统
- 大量敌人 Archetype

第一款目标：小而完整。
