// Package game is FROZEN as of IWO-20260919-003 (2026-09-20).
//
// Go backend is not wired to the frontend — web/src/game/objects.ts is the
// canonical implementation (ships/buildings/techs/production formulas).
// Per code-review §4 P1-1, freeze (not delete, not align). Constants and
// formulas here are kept as reference only. DO NOT add new code here.
//
// IWO-20260919-003 CLOSED by CR-20260921-001 (2026-09-21): superseded by
// baseline V1.3 §13. Constants here are historical trial data only and are
// NOT a source for Balance Data RC1 (V1.3 table 28 config red line).
package game

import (
	"math"

	"ogame/internal/battle"
)

const SPEED = 4

type Resource struct {
	Metal     float64 `json:"metal"`
	Crystal   float64 `json:"crystal"`
	Deuterium float64 `json:"deuterium"`
}

type EngineType uint8

const (
	EngineCombustion EngineType = iota + 1
	EnginePulse
)

type Ship struct {
	ID        int16
	Name      string
	Attack    float64
	Shield    float64
	Hull      float64
	Speed     float64
	Cargo     float64
	Fuel      float64
	Engine    EngineType
	BaseTime  float64
	Cost      Resource
	Requires  map[int16]int
	Rapidfire map[int16]uint16
}

var Ships = map[int16]Ship{
	202: {ID: 202, Name: "小型运输船", Attack: 5, Shield: 10, Hull: 4000, Speed: 5000, Cargo: 5000, Fuel: 20, Engine: EngineCombustion, BaseTime: 3.2, Cost: Resource{Metal: 2000, Crystal: 2000}, Requires: map[int16]int{21: 2, 115: 2}},
	203: {ID: 203, Name: "大型运输船", Attack: 5, Shield: 25, Hull: 12000, Speed: 7500, Cargo: 25000, Fuel: 50, Engine: EngineCombustion, BaseTime: 9.6, Cost: Resource{Metal: 6000, Crystal: 6000}, Requires: map[int16]int{21: 4, 115: 6}},
	204: {ID: 204, Name: "轻型战斗机", Attack: 50, Shield: 10, Hull: 400, Speed: 12500, Cargo: 50, Fuel: 20, Engine: EngineCombustion, BaseTime: 2.4, Cost: Resource{Metal: 3000}, Requires: map[int16]int{21: 1, 115: 1}, Rapidfire: map[int16]uint16{210: 5}},
	205: {ID: 205, Name: "重型战斗机", Attack: 150, Shield: 25, Hull: 1000, Speed: 10000, Cargo: 100, Fuel: 75, Engine: EngineCombustion, BaseTime: 6.4, Cost: Resource{Metal: 6000, Crystal: 2000}, Requires: map[int16]int{21: 3, 117: 2}, Rapidfire: map[int16]uint16{210: 5}},
	206: {ID: 206, Name: "巡洋舰", Attack: 400, Shield: 50, Hull: 2700, Speed: 15000, Cargo: 800, Fuel: 300, Engine: EnginePulse, BaseTime: 24.8, Cost: Resource{Metal: 20000, Crystal: 7000, Deuterium: 2000}, Requires: map[int16]int{21: 5, 117: 4, 121: 2}, Rapidfire: map[int16]uint16{204: 3, 210: 5}},
	207: {ID: 207, Name: "战列舰", Attack: 1200, Shield: 200, Hull: 6000, Speed: 10000, Cargo: 1500, Fuel: 750, Engine: EnginePulse, BaseTime: 48, Cost: Resource{Metal: 45000, Crystal: 15000}, Requires: map[int16]int{21: 7, 117: 5, 121: 2}, Rapidfire: map[int16]uint16{210: 5}},
	208: {ID: 208, Name: "殖民船", Attack: 50, Shield: 100, Hull: 30000, Speed: 2500, Cargo: 7500, Fuel: 600, Engine: EnginePulse, BaseTime: 33.6, Cost: Resource{Metal: 10000, Crystal: 20000, Deuterium: 6000}, Requires: map[int16]int{21: 4, 117: 3}},
	210: {ID: 210, Name: "间谍探测器", Attack: 0, Shield: 0, Hull: 1000, Speed: 100000000, Cargo: 5, Fuel: 1, Engine: EngineCombustion, BaseTime: 0.8, Cost: Resource{Crystal: 1000}, Requires: map[int16]int{21: 3, 115: 3}},
}

type Building struct {
	ID       int16
	Name     string
	Cost     Resource
	Factor   float64
	BaseTime float64
	Requires map[int16]int
	MaxLevel int
}

var Buildings = map[int16]Building{
	1:  {ID: 1, Name: "金属矿", Cost: Resource{Metal: 60, Crystal: 15}, Factor: 1.5, BaseTime: 60, Requires: map[int16]int{4: 1}},
	2:  {ID: 2, Name: "晶体矿", Cost: Resource{Metal: 48, Crystal: 24}, Factor: 1.6, BaseTime: 60, Requires: map[int16]int{4: 1}},
	3:  {ID: 3, Name: "重氢合成器", Cost: Resource{Metal: 225, Crystal: 75}, Factor: 1.5, BaseTime: 60, Requires: map[int16]int{4: 1}},
	4:  {ID: 4, Name: "太阳能电站", Cost: Resource{Metal: 75, Crystal: 30}, Factor: 1.5, BaseTime: 60},
	14: {ID: 14, Name: "机器人工厂", Cost: Resource{Metal: 400, Crystal: 120, Deuterium: 200}, Factor: 2, BaseTime: 60, Requires: map[int16]int{1: 2, 2: 2, 3: 2}},
	21: {ID: 21, Name: "船坞", Cost: Resource{Metal: 400, Crystal: 200, Deuterium: 100}, Factor: 2, BaseTime: 60, Requires: map[int16]int{14: 2}},
	22: {ID: 22, Name: "金属仓库", Cost: Resource{Metal: 1000}, Factor: 2, BaseTime: 60, Requires: map[int16]int{1: 1}, MaxLevel: 10},
	23: {ID: 23, Name: "晶体仓库", Cost: Resource{Metal: 1000, Crystal: 500}, Factor: 2, BaseTime: 60, Requires: map[int16]int{2: 1}, MaxLevel: 10},
	24: {ID: 24, Name: "重氢罐", Cost: Resource{Metal: 1000, Crystal: 1000}, Factor: 2, BaseTime: 60, Requires: map[int16]int{3: 1}, MaxLevel: 10},
	31: {ID: 31, Name: "研究实验室", Cost: Resource{Metal: 200, Crystal: 400, Deuterium: 200}, Factor: 2, BaseTime: 60, Requires: map[int16]int{1: 3, 2: 3, 3: 3}},
}

type Tech struct {
	ID       int16
	Name     string
	Cost     Resource
	Factor   float64
	MaxLevel int
	Requires map[int16]int
}

var Techs = map[int16]Tech{
	106: {ID: 106, Name: "间谍技术", Cost: Resource{Metal: 200, Crystal: 1000, Deuterium: 200}, Factor: 2, Requires: map[int16]int{31: 3}},
	108: {ID: 108, Name: "计算机技术", Cost: Resource{Crystal: 400, Deuterium: 600}, Factor: 2, MaxLevel: 4, Requires: map[int16]int{31: 1}},
	109: {ID: 109, Name: "武器技术", Cost: Resource{Metal: 800, Crystal: 200}, Factor: 2, Requires: map[int16]int{31: 4}},
	110: {ID: 110, Name: "护盾技术", Cost: Resource{Metal: 200, Crystal: 600}, Factor: 2, Requires: map[int16]int{31: 4, 113: 3}},
	111: {ID: 111, Name: "装甲技术", Cost: Resource{Metal: 1000}, Factor: 2, Requires: map[int16]int{31: 2}},
	113: {ID: 113, Name: "能源技术", Cost: Resource{Crystal: 800, Deuterium: 400}, Factor: 2, Requires: map[int16]int{31: 1}},
	115: {ID: 115, Name: "燃烧引擎", Cost: Resource{Metal: 400, Deuterium: 600}, Factor: 2, Requires: map[int16]int{31: 1, 113: 1}},
	117: {ID: 117, Name: "脉冲引擎", Cost: Resource{Metal: 2000, Crystal: 4000, Deuterium: 600}, Factor: 2, Requires: map[int16]int{31: 2, 113: 1}},
	120: {ID: 120, Name: "激光技术", Cost: Resource{Metal: 200, Crystal: 100}, Factor: 2, Requires: map[int16]int{31: 1, 113: 2}},
	121: {ID: 121, Name: "离子技术", Cost: Resource{Metal: 1000, Crystal: 300, Deuterium: 100}, Factor: 2, Requires: map[int16]int{31: 4, 120: 5, 113: 4}},
}

func ProductionFactor(level int) float64 {
	return float64(level) * math.Pow(1.1, float64(level))
}

func MetalProduction(level int, posCoef float64) float64 {
	return 30 * ProductionFactor(level) * posCoef * SPEED
}

func CrystalProduction(level int, posCoef float64) float64 {
	return 20 * ProductionFactor(level) * posCoef * SPEED
}

func DeuteriumProduction(level int, tempMax float64) float64 {
	kt := 1.44 - 0.004*tempMax
	return 12 * ProductionFactor(level) * kt * SPEED
}

func SolarOutput(level int, energyTech int) float64 {
	return 20 * ProductionFactor(level) * (1 + 0.05*float64(energyTech)) * SPEED
}

func EnergyConsumption(level int, deuterium bool) float64 {
	if deuterium {
		return 20 * ProductionFactor(level)
	}
	return 10 * ProductionFactor(level)
}

func WithEnergyDeficit(production, output, consumption float64) float64 {
	if consumption <= 0 {
		return production
	}
	ratio := output / consumption
	if ratio > 1 {
		ratio = 1
	}
	if ratio < 0.2 {
		ratio = 0.2
	}
	return production * ratio
}

func StorageCapacity(storageLevel int) float64 {
	return 10000 * math.Pow(2, float64(storageLevel))
}

func BuildingCost(b Building, currentLevel int) Resource {
	f := math.Pow(b.Factor, float64(currentLevel))
	return Resource{
		Metal:     b.Cost.Metal * f,
		Crystal:   b.Cost.Crystal * f,
		Deuterium: b.Cost.Deuterium * f,
	}
}

func BuildingTime(b Building, currentLevel, roboticsLevel int) float64 {
	return b.BaseTime * math.Pow(b.Factor, float64(currentLevel)) / SPEED / math.Pow(2, float64(roboticsLevel))
}

func ShipBuildTime(s Ship, shipyardLevel int) float64 {
	return s.BaseTime / SPEED / math.Pow(2, float64(shipyardLevel))
}

func ResearchTime(t Tech, labLevel int) float64 {
	return (t.Cost.Metal + t.Cost.Crystal) / SPEED / (1 + float64(labLevel))
}

func CanResearch(techLevel, labLevel int) bool {
	return labLevel > techLevel
}

func MeetsRequires(levels map[int16]int, requires map[int16]int) bool {
	for id, need := range requires {
		if levels[id] < need {
			return false
		}
	}
	return true
}

type Coordinate struct {
	Galaxy   int `json:"galaxy"`
	System   int `json:"system"`
	Position int `json:"position"`
}

func absi(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func Distance(a, b Coordinate) float64 {
	switch {
	case a == b:
		return 5
	case a.Galaxy == b.Galaxy && a.System == b.System:
		return float64(absi(a.Position-b.Position))*1000 + 5
	case a.Galaxy == b.Galaxy:
		return 27000 + float64(absi(a.System-b.System))*95
	default:
		return float64(absi(a.Galaxy-b.Galaxy)) * 1000000
	}
}

func FlightTime(distance, speed float64) float64 {
	t := 60 * distance / speed
	if t < 30 {
		return 30
	}
	return t
}

func FuelConsumption(baseFuel float64, count int, distance float64) int64 {
	return int64(math.Ceil(float64(count) * baseFuel * distance / 35000))
}

func ShipSpec(id int16, techs map[int16]int) battle.UnitSpec {
	s := Ships[id]
	w := 1 + 0.10*float64(techs[109])
	sh := 1 + 0.10*float64(techs[110])
	h := 1 + 0.10*float64(techs[111])
	return battle.UnitSpec{
		UnitID:    id,
		Attack:    s.Attack * w,
		Shield:    s.Shield * sh,
		Hull:      s.Hull * h,
		Rapidfire: s.Rapidfire,
	}
}

func ShipSpeed(id int16, techs map[int16]int) float64 {
	s := Ships[id]
	switch s.Engine {
	case EngineCombustion:
		return s.Speed * (1 + 0.10*float64(techs[115]))
	case EnginePulse:
		return s.Speed * (1 + 0.20*float64(techs[117]))
	}
	return s.Speed
}

func FleetSlots(techs map[int16]int) int {
	slots := 1 + techs[108]
	if slots > 5 {
		slots = 5
	}
	return slots
}

func EspionageLevel(ownTech, targetTech, probes int) int {
	return ownTech - targetTech + probes/5
}
