package battle_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"ogame/internal/battle"
)

func lightFighters(n int) battle.FleetInput {
	return battle.FleetInput{
		FleetMissionID: 1,
		OwnerID:        1,
		Units: map[int16]battle.UnitSpecWithAmount{
			204: {
				Spec:   battle.UnitSpec{UnitID: 204, Attack: 50, Shield: 10, Hull: 400},
				Amount: uint32(n),
			},
		},
	}
}

func sumCounts(m map[int16]uint32) uint32 {
	var total uint32
	for _, v := range m {
		total += v
	}
	return total
}

func TestDeterminism(t *testing.T) {
	input := battle.BattleInput{
		AttackerFleets: []battle.FleetInput{lightFighters(100)},
		DefenderFleets: []battle.FleetInput{lightFighters(80)},
	}
	b1, err := json.Marshal(battle.Simulate(input, 42))
	if err != nil {
		t.Fatal(err)
	}
	b2, err := json.Marshal(battle.Simulate(input, 42))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(b1, b2) {
		t.Fatal("same seed produced different battle output")
	}
}

// 混合舰种的确定性回归。
// 单一舰种时 map 只有一个 key，单位展开顺序不影响任何东西，所以 TestDeterminism 无法发现
// expandFleets 直接遍历 map（迭代顺序随机）导致的不可复现问题。这个用例专门覆盖该路径。
func TestDeterminismMixedFleets(t *testing.T) {
	mixed := func(n int) battle.FleetInput {
		return battle.FleetInput{
			FleetMissionID: 1,
			OwnerID:        1,
			Units: map[int16]battle.UnitSpecWithAmount{
				204: {Spec: battle.UnitSpec{UnitID: 204, Attack: 50, Shield: 10, Hull: 400}, Amount: uint32(n)},
				205: {Spec: battle.UnitSpec{UnitID: 205, Attack: 150, Shield: 25, Hull: 1000}, Amount: uint32(n)},
				206: {Spec: battle.UnitSpec{UnitID: 206, Attack: 400, Shield: 50, Hull: 2700, Rapidfire: map[int16]uint16{204: 3}}, Amount: uint32(n)},
			},
		}
	}
	input := battle.BattleInput{
		AttackerFleets: []battle.FleetInput{mixed(40)},
		DefenderFleets: []battle.FleetInput{mixed(30)},
	}

	first, err := json.Marshal(battle.Simulate(input, 20240918))
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		got, err := json.Marshal(battle.Simulate(input, 20240918))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(first, got) {
			t.Fatalf("run %d: same seed produced different battle output", i)
		}
	}
}

func TestAttackerWins(t *testing.T) {
	input := battle.BattleInput{
		AttackerFleets: []battle.FleetInput{lightFighters(500)},
		DefenderFleets: []battle.FleetInput{lightFighters(10)},
	}
	out := battle.Simulate(input, 7)
	if len(out.Rounds) == 0 {
		t.Fatal("no rounds fought")
	}
	last := out.Rounds[len(out.Rounds)-1]
	if got := sumCounts(last.DefenderShips); got != 0 {
		t.Fatalf("defender should be wiped, got %d survivors", got)
	}
	if got := sumCounts(last.AttackerShips); got == 0 {
		t.Fatal("attacker should have survivors")
	}
}

func TestShieldBounce(t *testing.T) {
	defender := battle.FleetInput{
		FleetMissionID: 2,
		OwnerID:        2,
		Units: map[int16]battle.UnitSpecWithAmount{
			207: {
				Spec:   battle.UnitSpec{UnitID: 207, Attack: 0, Shield: 1000, Hull: 6000},
				Amount: 1,
			},
		},
	}
	weak := battle.FleetInput{
		FleetMissionID: 1,
		OwnerID:        1,
		Units: map[int16]battle.UnitSpecWithAmount{
			204: {
				Spec:   battle.UnitSpec{UnitID: 204, Attack: 1, Shield: 10, Hull: 400},
				Amount: 1,
			},
		},
	}
	input := battle.BattleInput{
		AttackerFleets: []battle.FleetInput{weak},
		DefenderFleets: []battle.FleetInput{defender},
	}
	out := battle.Simulate(input, 99)
	if len(out.Rounds) == 0 {
		t.Fatal("no rounds fought")
	}
	if len(out.Rounds) != 6 {
		t.Fatalf("battle should run full 6 rounds, got %d", len(out.Rounds))
	}
	var hits uint32
	for _, r := range out.Rounds {
		hits += r.HitsAttacker + r.HitsDefender
	}
	if hits != 0 {
		t.Fatalf("all attacks must bounce (1 dmg < 1%% of 1000 shield), got %d hits", hits)
	}
}
