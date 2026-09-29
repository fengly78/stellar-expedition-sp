<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Command\GameCommandBus;
use Tests\TestCase;

/**
 * 回归测试（2026-09-23 首次运行验证发现）：
 * GovernorCommandHandler 与 ProcessDueBuildTasks 构造器注入 GameCommandBus，
 * 而总线单例闭包解析 handler 时自身实例尚未写入容器 instance 表，
 * 容器再次解析总线 → 无限递归 → 内存耗尽（任何 artisan 启动即崩）。
 * 修复 = DomainServiceProvider 闭包内先 instance() 落位再解析 handlers。
 * 本测试锁定「容器解析总线必须可终止且保持单例」。
 */
class GameCommandBusWiringTest extends TestCase
{
    public function testBusResolvesFromContainerWithoutCircularDependency(): void
    {
        $bus = $this->app->make(GameCommandBus::class);

        self::assertInstanceOf(GameCommandBus::class, $bus);
        self::assertSame($bus, $this->app->make(GameCommandBus::class), '总线必须保持单例语义');
    }

    public function testBusHasAllTenMvpHandlers(): void
    {
        $bus = $this->app->make(GameCommandBus::class);

        $prop = new \ReflectionProperty(GameCommandBus::class, 'handlers');
        $handlers = $prop->getValue($bus);

        // 10 个客户端总线命令（API-01 §3 + 2026-09-29 补的 BUILD_CANCEL）。
        // COLONIZE_RESOLVE/COMBAT_RESOLVE 是抵达事件，由 FleetArrivalService
        // 直接调领域服务结算，不经总线。
        //
        // 为什么补 BUILD_CANCEL：建造队列是 FIFO 且此前无任何取消/跳过命令，
        // 队首一旦付不起就把该星球的建造能力永久锁死（多人对抗实测三名 agent
        // 各自独立复现，其中两条根本不需要发错 id）。计数变更是**预期的**，
        // 若这里再次失败说明有人又删了 handler 或又加了一个却没改这里。
        self::assertCount(10, $handlers, '10 个客户端命令 handler 必须全部注册');
        self::assertArrayHasKey('BUILD_CANCEL', $handlers, '必须有建造队列取消命令');
    }
}
