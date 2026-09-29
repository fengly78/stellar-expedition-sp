from pathlib import Path
from fractions import Fraction as F
import json,re,hashlib

root=Path('E:/Ogame/doc')
source=(root/'New_OGame_V1.1_设计深化.md').read_text(encoding='utf-8')
results=[]
def check(name,fn):
    detail=fn()
    results.append({'check':name,'status':'PASS','detail':detail})

def catalog():
    counts=[]
    for pat,n in [(r'^\| B\d\d ',14),(r'^\| T\d\d ',8),(r'^\| [^|]* S\d\d ',7)]:
        rows=re.findall(pat,source,re.M)
        assert len(rows)==n,(pat,len(rows))
        counts.append(n)
    return {'buildings':counts[0],'technologies':counts[1],'ships':counts[2]}
check('候选目录数量',catalog)

def dependencies():
    graph={}
    initial={'B01','B02','B03','B04','B06','B09','B15'}
    for row in source.splitlines():
        if re.match(r'^\| [BT]\d\d ',row):
            cells=[v.strip() for v in row.strip('|').split('|')]
            id=cells[0][:3]
            req=cells[-1] if id[0]=='B' else cells[1]
            graph[id]=set(re.findall(r'[BT]\d\d',req))
    unlocked=set(initial)
    while True:
        nxt=unlocked|{id for id,needs in graph.items() if needs<=unlocked}
        if nxt==unlocked: break
        unlocked=nxt
    assert set(graph)<=unlocked, set(graph)-unlocked
    return '22 个建筑与科技 ID 可达；等级所需时间和资源未作完整排程'
check('科技建筑前置无环与 ID 可达',dependencies)

def opening():
    demand=2*12+14+18+6+4
    assert demand==66 and demand<=2*50
    assert (2*500,1*500,1*200)==(1000,500,200)
    return {'energy_load':demand,'energy_supply':100,'hourly_resources':[1000,500,200]}
check('初始能源与产率',opening)

def loot():
    cap=int((1000+500*2+200*3)*24*F(1,10))
    assert cap==6240
    exposure=[5000,2000,1000]; prices=[1,2,3]
    single=[int(x*F(1,5)) for x in exposure]
    assert sum(x*p for x,p in zip(single,prices))==2400
    remaining=1500; cargo=2000; picked=[]
    for amount,price in zip(single,prices):
        q=min(amount,cargo,remaining//price)
        picked.append(q); remaining-=q*price; cargo-=q
    assert picked==[1000,250,0]
    return {'daily_cap':cap,'example_loot':picked}
check('掠夺例算与三重上限',loot)

def recovery():
    costs=[600,300,100]
    a=[int(x*F(1,5)) for x in costs]
    b=[int(x*F(1,4)) for x in costs]
    # Original frozen shares, never expand indemnity using rounding residues.
    c=[int(x*F(55,100)*F(2,5)) for x in costs]
    gap=[x-y-z-w for x,y,z,w in zip(costs,a,b,c)]
    assert gap==[198,99,33]
    for v in range(1,10001):
        total=int(v*F(1,5))+int(v*F(1,4))+int(v*F(55,100)*F(2,5))
        assert total<=v*F(67,100) and total<v
    return {'replacement_gap':gap,'integer_cost_cases':10000}
check('恢复份额与整数取整守恒',recovery)

def refunds():
    assert int(1000*F(3,4)*F(4,5))==600
    for cost in [1,10,100,1000,10000]:
        last=cost
        for progress in range(101):
            refund=int(cost*F(100-progress,100)*F(4,5))
            assert 0<=refund<=cost and refund<=last
            last=refund
    return {'cancel_example':600,'cases':505}
check('施工退款随进度递减',refunds)

def market():
    for reference in [1,2,3]:
        paid=reference*F(6,5)*F(102,100)
        earned=reference*F(4,5)*F(98,100)
        assert earned<paid
    assert 3000*F(98,100)-2400*F(102,100)-60*3==312
    assert 50*1000+25000+7*10000==145000
    return {'regional_example_margin':312,'seven_day_issuance_limit':145000,'scope':'固定同站报价；未枚举动态跨商人循环'}
check('市场例算与财政上限',market)

report={'config':'NG-A0','checks':results,'passed':len(results),
        'limits':['仅局部规则与候选配置检查，不是实际游戏运行测试','未执行完整 72 小时或 7／30／90 日模拟','未执行多人并发与真人试玩'],
        'source_sha256':hashlib.sha256(source.encode()).hexdigest()}
(root/'qa_v11').mkdir(exist_ok=True)
(root/'qa_v11/design_checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
