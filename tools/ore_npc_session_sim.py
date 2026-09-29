# -*- coding: utf-8 -*-
"""
矿脉+NPC 成长叠加实测（CR 风险①验证）：20x 长会话模拟。

模拟口径（web 线 objects/npc 同族公式）：
- 玩家：1 千万开局，金属/晶体/重氢矿爬到 Lv30/25/20，太阳能跟上，20x 挂机 8 真实小时
- NPC：玩家积分爬升触发分段成长（50%/80%/110% 封顶），对比掠夺收益与攻击风险
- 问题：①矿脉储量在长会话里是否可感知地衰减；②NPC 增援是否让中后期收益骤降
"""
SPEED = 4
ORE_BASE = {"metal": 100e6, "crystal": 60e6, "deuterium": 30e6}
POS7 = {"metal": 1.0, "crystal": 1.0, "deuterium": 1.0}

def pf(level):
    return level * 1.1 ** level

def prod(res, lv):
    base = {"metal": 30, "crystal": 21, "deuterium": 12}[res]
    return base * pf(lv) * POS7[res] * SPEED * (1.3 if res == "deuterium" else 1)

# 8 真实小时 × 20x = 160 游戏小时
SESSION_GAME_HOURS = 160

# 矿脉消耗：Lv30 金属矿全程满产
dep_metal = ORE_BASE["metal"]
p = prod("metal", 30)
consumed = p * SESSION_GAME_HOURS
remaining = max(0, dep_metal - consumed)
pct = remaining / dep_metal
print(f"① 矿脉（Lv30 金属矿，位置7）：产量 {p:,.0f}/h × 160h = {consumed:,.0f}")
print(f"   储量 {dep_metal:,.0f} → 剩余 {pct*100:.1f}%（{'⚠ 低于衰减阈值 5%' if pct < 0.05 else '✓ 未到衰减区'}）")
# 再生：1%/h × 160h = 160% 初始 → 实际全程再生把消耗全吃回
regen = dep_metal * 0.01 * SESSION_GAME_HOURS
print(f"   再生 1%/h×160h = {regen:,.0f}（≥消耗 {consumed:,.0f} → {'储量恒满，衰减永不可感' if regen >= consumed else '消耗>再生，衰减可感'}）")

# NPC 成长：玩家积分（建筑投入/1000）随时间爬升
print()
print("② NPC 动态成长（玩家 Lv30 矿 + 配套建筑的积分轨迹）：")
# 积分近似：金属矿 Lv0→30 的累计投入 + 晶体 Lv0→25 + 重氢 Lv0→20 + 太阳能 Lv0~35 + 工厂/实验/船坞
def building_total(cost_base, factor, to_lv):
    return sum(cost_base * factor ** l for l in range(to_lv))

def prod_total(cost_m, cost_c, cost_d, factor, to_lv):
    return sum((cost_m + cost_c + cost_d) * factor ** l for l in range(to_lv))

invest = (
    prod_total(60, 15, 0, 1.5, 30)          # 金属矿
    + prod_total(48, 24, 0, 1.5, 25)         # 晶体矿
    + prod_total(225, 75, 0, 1.5, 20)        # 重氢
    + prod_total(75, 30, 0, 1.5, 35)         # 太阳能
    + prod_total(400, 120, 200, 2, 10)       # 机器人工厂
    + prod_total(200, 400, 200, 1.75, 8)     # 实验室
    + prod_total(400, 200, 100, 1.75, 8)     # 船坞
)
player_points = invest / 1000
print(f"   玩家积分 ≈ {player_points:,.0f}（{'>=20k 后期档' if player_points >= 20000 else '5k-20k 中期档' if player_points >= 5000 else '1k-5k 初期档'}）")

# NPC 增援量（npcDynamicGrowth 同参数）
difficulty = 2  # 高危区
tier = 3 if player_points >= 20000 else 2
n = min(12, 2 + tier * 2 + difficulty)
per_stage = {"204": n, "205": n // 3 if tier >= 2 else 0, "206": 1 + n // 6 if tier >= 3 else 0}
cost_n = 3000 * n + 6000 * (n // 3 if tier >= 2 else 0) + (20000 * (1 + n // 6) if tier >= 3 else 0)
cap = player_points * (0.5 if tier == 1 else 0.8 if tier == 2 else 1.1) * (0.6 + difficulty * 0.2)
stages_in_session = SESSION_GAME_HOURS // (6 - difficulty)
print(f"   NPC 每 {6-difficulty} 游戏时增援：轻战×{n} + 重战×{per_stage['205']} + 巡洋×{per_stage['206']} ≈ {cost_n:,} 资源/档")
print(f"   实测会话内增援档数：{stages_in_session} 档 ≈ {cost_n * stages_in_session:,.0f} 资源总增援")
print(f"   实力封顶：玩家积分×{0.5 if tier == 1 else 0.8 if tier == 2 else 1.1}×(0.6+0.4) = {cap:,.0f}")
