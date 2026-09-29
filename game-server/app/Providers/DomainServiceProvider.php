<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domain\Command\GameCommandBus;
use App\Domain\Command\Handlers\BuildEnqueueHandler;
use App\Domain\Command\Handlers\BuildStartHandler;
use App\Domain\Command\Handlers\BuildCancelHandler;
use App\Domain\Command\Handlers\FleetDispatchHandler;
use App\Domain\Command\Handlers\FleetRecallHandler;
use App\Domain\Command\Handlers\GovernorCommandHandler;
use App\Domain\Command\Handlers\GovernorGrantHandler;
use App\Domain\Command\Handlers\GovernorRevokeHandler;
use App\Domain\Command\Handlers\ResearchStartHandler;
use App\Domain\Command\Handlers\ShipOrderHandler;
use App\Domain\Combat\CombatEngine;
use App\Domain\Ruleset\RulesetLoader;
use Illuminate\Support\ServiceProvider;

/**
 * DomainServiceProvider：领域服务与命令总线装配。
 * 总线为单例；10 个客户端命令 handler 在此注册（API-01 §3；
 * COLONIZE_RESOLVE/COMBAT_RESOLVE 属抵达事件，由 FleetArrivalService 直接结算，不经总线）。
 * 2026-09-29 新增 BUILD_CANCEL——此前建造队列没有任何取消手段，
 * 队首一旦付不起就把该星球的建造能力永久锁死（多人对抗实测，三名 agent 独立复现）。
 */
class DomainServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(RulesetLoader::class);

        $this->app->singleton(CombatEngine::class, fn () => new CombatEngine(
            (string) config('services.combat.library_path', ''),
        ));

        $this->app->singleton(GameCommandBus::class, function ($app) {
            $bus = new GameCommandBus($app->make(RulesetLoader::class));
            // 先落位再解析 handlers：GovernorCommandHandler 构造器注入总线，
            // 若实例未入容器会在闭包执行期间二次解析 → 无限递归 OOM（2026-09-23 首运行回归）。
            $this->app->instance(GameCommandBus::class, $bus);
            $bus->register($app->make(BuildEnqueueHandler::class));
            $bus->register($app->make(BuildStartHandler::class));
            // 2026-09-29：补建造队列取消（此前队列一旦有付不起的队首即永久死锁、不可自愈）
            $bus->register($app->make(BuildCancelHandler::class));
            $bus->register($app->make(ResearchStartHandler::class));
            $bus->register($app->make(ShipOrderHandler::class));
            $bus->register($app->make(FleetDispatchHandler::class));
            $bus->register($app->make(FleetRecallHandler::class));
            $bus->register($app->make(GovernorGrantHandler::class));
            $bus->register($app->make(GovernorRevokeHandler::class));
            $bus->register($app->make(GovernorCommandHandler::class));
            return $bus;
        });
    }
}
