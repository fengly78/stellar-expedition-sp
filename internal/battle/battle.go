// Package battle is FROZEN as of IWO-20260919-003 (2026-09-20).
//
// Go backend is not wired to the frontend — web/src/game/battle.ts is the
// canonical implementation. Per code-review §4 P1-1, freeze (not delete, not
// align). The Simulate / combatPhase / cleanupSide functions here are kept as
// reference / future P2P-sync reference only. DO NOT add new code here.
//
// IWO-20260919-003 CLOSED by CR-20260921-001 (2026-09-21): superseded by
// baseline V1.3 §13. Role redefined: equivalence-test reference corpus for
// the Rust Classic combat module (same snapshot, seed, ruleset version).
package battle

import (
	"math/rand/v2"
	"sort"
)

type UnitSpec struct {
	UnitID    int16            `json:"unit_id"`
	Attack    float64          `json:"attack"`
	Shield    float64          `json:"shield"`
	Hull      float64          `json:"hull"`
	Rapidfire map[int16]uint16 `json:"rapidfire,omitempty"`
}

type UnitSpecWithAmount struct {
	Spec   UnitSpec `json:"spec"`
	Amount uint32   `json:"amount"`
}

type FleetInput struct {
	FleetMissionID uint32                       `json:"fleet_mission_id"`
	OwnerID        uint32                       `json:"owner_id"`
	Units          map[int16]UnitSpecWithAmount `json:"units"`
}

type BattleInput struct {
	AttackerFleets []FleetInput `json:"attacker_fleets"`
	DefenderFleets []FleetInput `json:"defender_fleets"`
}

type FleetResult struct {
	FleetMissionID uint32           `json:"fleet_mission_id"`
	OwnerID        uint32           `json:"owner_id"`
	UnitsStart     map[int16]uint32 `json:"units_start"`
	UnitsResult    map[int16]uint32 `json:"units_result"`
	UnitsLost      map[int16]uint32 `json:"units_lost"`
}

type BattleRound struct {
	AttackerShips          map[int16]uint32       `json:"attacker_ships"`
	DefenderShips          map[int16]uint32       `json:"defender_ships"`
	AttackerLosses         map[int16]uint32       `json:"attacker_losses"`
	DefenderLosses         map[int16]uint32       `json:"defender_losses"`
	AttackerLossesInRound  map[int16]uint32       `json:"attacker_losses_in_round"`
	DefenderLossesInRound  map[int16]uint32       `json:"defender_losses_in_round"`
	AbsorbedDamageAttacker float64                `json:"absorbed_damage_attacker"`
	AbsorbedDamageDefender float64                `json:"absorbed_damage_defender"`
	FullStrengthAttacker   float64                `json:"full_strength_attacker"`
	FullStrengthDefender   float64                `json:"full_strength_defender"`
	HitsAttacker           uint32                 `json:"hits_attacker"`
	HitsDefender           uint32                 `json:"hits_defender"`
	AttackerFleetResults   map[uint32]FleetResult `json:"attacker_fleet_results"`
	DefenderFleetResults   map[uint32]FleetResult `json:"defender_fleet_results"`
}

type BattleOutput struct {
	Rounds []BattleRound `json:"rounds"`
}

type unitInstance struct {
	spec    UnitSpec
	fleetID uint32
	ownerID uint32
	shield  float64
	hull    float64
}

// Simulate runs the 6-round combat loop per doc/ogame-design-input.md §2.
func Simulate(input BattleInput, seed uint64) BattleOutput {
	rng := rand.New(rand.NewPCG(seed, seed^0x9E3779B97F4A7C15))

	attackers := expandFleets(input.AttackerFleets)
	defenders := expandFleets(input.DefenderFleets)

	initialAttacker := countUnits(attackers)
	initialDefender := countUnits(defenders)

	var rounds []BattleRound

	for i := 0; i < 6; i++ {
		if len(attackers) == 0 || len(defenders) == 0 {
			break
		}

		round := BattleRound{
			AttackerShips:         map[int16]uint32{},
			DefenderShips:         map[int16]uint32{},
			AttackerLosses:        map[int16]uint32{},
			DefenderLosses:        map[int16]uint32{},
			AttackerLossesInRound: map[int16]uint32{},
			DefenderLossesInRound: map[int16]uint32{},
			AttackerFleetResults:  map[uint32]FleetResult{},
			DefenderFleetResults:  map[uint32]FleetResult{},
		}

		combatPhase(rng, attackers, defenders, &round, true)
		combatPhase(rng, defenders, attackers, &round, false)

		round.AttackerLossesInRound, attackers = cleanupSide(round.AttackerLossesInRound, attackers)
		round.DefenderLossesInRound, defenders = cleanupSide(round.DefenderLossesInRound, defenders)

		round.AttackerShips = countUnits(attackers)
		round.DefenderShips = countUnits(defenders)

		round.AttackerLosses = diffCounts(initialAttacker, round.AttackerShips)
		round.DefenderLosses = diffCounts(initialDefender, round.DefenderShips)

		round.AttackerFleetResults = fleetResults(input.AttackerFleets, attackers)
		round.DefenderFleetResults = fleetResults(input.DefenderFleets, defenders)

		rounds = append(rounds, round)
	}

	return BattleOutput{Rounds: rounds}
}

func expandFleets(fleets []FleetInput) []unitInstance {
	var units []unitInstance
	// Go map 的迭代顺序是不确定的。若直接遍历，同一份输入在同一 seed 下会得到不同的单位
	// 展开顺序，进而改变 RNG 调用序列，使战斗结果不可复现。这里对舰种 id 升序排列后再
	// 展开，保证 battle_reports.seed 能支持精确回放。
	ids := make([]int16, 0, 8)
	for _, f := range fleets {
		ids = ids[:0]
		for id := range f.Units {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		for _, id := range ids {
			u := f.Units[id]
			for j := uint32(0); j < u.Amount; j++ {
				units = append(units, unitInstance{
					spec:    u.Spec,
					fleetID: f.FleetMissionID,
					ownerID: f.OwnerID,
					shield:  u.Spec.Shield,
					hull:    u.Spec.Hull,
				})
			}
		}
	}
	return units
}

func combatPhase(rng *rand.Rand, attackers, defenders []unitInstance, round *BattleRound, attackerSide bool) {
	for i := range attackers {
		spec := attackers[i].spec
		for {
			if len(defenders) == 0 {
				return
			}
			target := &defenders[rng.IntN(len(defenders))]

			damage := spec.Attack
			if damage < 0.01*target.spec.Shield {
				break // design-input §2.2-4: below 1% of full shield, attack negated
			}

			var absorbed float64
			if target.shield > 0 {
				if damage <= target.shield {
					absorbed = damage
					target.shield -= damage
				} else {
					absorbed = target.shield
					target.hull -= damage - target.shield
					target.shield = 0
				}
			} else {
				target.hull -= damage
			}

			if ratio := target.hull / target.spec.Hull; ratio < 0.7 {
				if rng.Float64() < 1.0-ratio {
					target.hull = 0
					target.shield = 0
				}
			}

			if attackerSide {
				round.HitsAttacker++
				round.FullStrengthAttacker += damage
				round.AbsorbedDamageDefender += absorbed
			} else {
				round.HitsDefender++
				round.FullStrengthDefender += damage
				round.AbsorbedDamageAttacker += absorbed
			}

			rf, ok := spec.Rapidfire[target.spec.UnitID]
			if !ok {
				break
			}
			if rng.Float64() < 1.0-1.0/float64(rf) {
				continue // design-input §2.2-7: rapidfire grants another attack
			}
			break
		}
	}
}

func cleanupSide(losses map[int16]uint32, units []unitInstance) (map[int16]uint32, []unitInstance) {
	kept := units[:0]
	for _, u := range units {
		if u.hull <= 0 {
			losses[u.spec.UnitID]++
			continue
		}
		u.shield = u.spec.Shield
		kept = append(kept, u)
	}
	return losses, kept
}

func countUnits(units []unitInstance) map[int16]uint32 {
	counts := map[int16]uint32{}
	for _, u := range units {
		counts[u.spec.UnitID]++
	}
	return counts
}

func diffCounts(initial, current map[int16]uint32) map[int16]uint32 {
	diff := map[int16]uint32{}
	for id, start := range initial {
		if start > current[id] {
			diff[id] = start - current[id]
		}
	}
	return diff
}

func fleetResults(fleets []FleetInput, survivors []unitInstance) map[uint32]FleetResult {
	startByFleet := map[uint32]map[int16]uint32{}
	for _, f := range fleets {
		counts := map[int16]uint32{}
		for _, u := range f.Units {
			counts[u.Spec.UnitID] += u.Amount
		}
		startByFleet[f.FleetMissionID] = counts
	}

	resultByFleet := map[uint32]map[int16]uint32{}
	for _, u := range survivors {
		if resultByFleet[u.fleetID] == nil {
			resultByFleet[u.fleetID] = map[int16]uint32{}
		}
		resultByFleet[u.fleetID][u.spec.UnitID]++
	}

	results := map[uint32]FleetResult{}
	for _, f := range fleets {
		start := startByFleet[f.FleetMissionID]
		result := resultByFleet[f.FleetMissionID]
		if result == nil {
			result = map[int16]uint32{}
		}
		lost := map[int16]uint32{}
		for id, n := range start {
			if n > result[id] {
				lost[id] = n - result[id]
			}
		}
		results[f.FleetMissionID] = FleetResult{
			FleetMissionID: f.FleetMissionID,
			OwnerID:        f.OwnerID,
			UnitsStart:     start,
			UnitsResult:    result,
			UnitsLost:      lost,
		}
	}
	return results
}
