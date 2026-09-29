-- 0001_init.sql — OGame-like MVP core schema (Postgres)
-- Design refs: doc/ogame-design-input.md §3 (tick events), §4 (schema lessons)

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- buildings stored as JSONB: the building set evolves across versions and
-- levels are never queried relationally, so a fixed column set would force
-- a migration per new building.
CREATE TABLE IF NOT EXISTS planets (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    galaxy          INT NOT NULL CHECK (galaxy >= 1),
    system          INT NOT NULL CHECK (system >= 1),
    position        INT NOT NULL CHECK (position BETWEEN 1 AND 15),
    planet_type     SMALLINT NOT NULL DEFAULT 1 CHECK (planet_type IN (1, 2)),
    fields          INT NOT NULL,
    temperature_max INT NOT NULL,
    metal           DOUBLE PRECISION NOT NULL DEFAULT 0,
    crystal         DOUBLE PRECISION NOT NULL DEFAULT 0,
    deuterium       DOUBLE PRECISION NOT NULL DEFAULT 0,
    levels          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT planets_pos_unique UNIQUE (galaxy, system, position, planet_type)
);
CREATE INDEX IF NOT EXISTS idx_planets_user ON planets (user_id);

CREATE TABLE IF NOT EXISTS fleet_missions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id),
    mission_type  SMALLINT NOT NULL,
    from_galaxy   INT NOT NULL,
    from_system   INT NOT NULL,
    from_position INT NOT NULL,
    to_galaxy     INT NOT NULL,
    to_system     INT NOT NULL,
    to_position   INT NOT NULL,
    fleet         JSONB NOT NULL,
    resources     JSONB NOT NULL DEFAULT '{}'::jsonb,
    state         SMALLINT NOT NULL DEFAULT 0 CHECK (state IN (0, 1, 2, 3)),
    arrive_at     TIMESTAMPTZ,
    return_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_user ON fleet_missions (user_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_arrive ON fleet_missions (arrive_at) WHERE state = 0;
CREATE INDEX IF NOT EXISTS idx_fleet_missions_return ON fleet_missions (return_at) WHERE state = 1;

CREATE TABLE IF NOT EXISTS events (
    id         BIGSERIAL PRIMARY KEY,
    type       TEXT NOT NULL,
    execute_at TIMESTAMPTZ NOT NULL,
    payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    status     SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_due ON events (execute_at) WHERE status = 0;

CREATE TABLE IF NOT EXISTS building_queue (
    id         BIGSERIAL PRIMARY KEY,
    planet_id  BIGINT NOT NULL REFERENCES planets(id),
    object_id  SMALLINT NOT NULL,
    level      INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finish_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_building_queue_planet ON building_queue (planet_id);

CREATE TABLE IF NOT EXISTS research_queue (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    object_id  SMALLINT NOT NULL,
    level      INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finish_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_research_queue_user ON research_queue (user_id);

CREATE TABLE IF NOT EXISTS unit_queue (
    id         BIGSERIAL PRIMARY KEY,
    planet_id  BIGINT NOT NULL REFERENCES planets(id),
    object_id  SMALLINT NOT NULL,
    amount     INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    finish_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unit_queue_planet ON unit_queue (planet_id);

CREATE TABLE IF NOT EXISTS battle_reports (
    id            BIGSERIAL PRIMARY KEY,
    attacker_id   BIGINT NOT NULL REFERENCES users(id),
    defender_id   BIGINT NOT NULL REFERENCES users(id),
    battle_input  JSONB NOT NULL,
    battle_output JSONB NOT NULL,
    seed          BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_battle_reports_attacker ON battle_reports (attacker_id);
CREATE INDEX IF NOT EXISTS idx_battle_reports_defender ON battle_reports (defender_id);
