-- =====================================================================
--  Mini Golf Parabólico - esquema de base de datos (MySQL 8.0.16+ / MariaDB 10.5+)
--  Uso:  npm run db:init      (o: mysql -u root -p < database/schema.sql)
--  Es idempotente: se puede ejecutar varias veces sin perder datos.
--  El servidor crea los niveles de ejemplo de cada sala; no hacen falta datos aquí.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS minigolf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minigolf;

-- Para reiniciar todo, descomenta este bloque:
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP VIEW  IF EXISTS v_leaderboard, v_creator_points, v_level_stats, v_error_map;
-- DROP TABLE IF EXISTS shots, ratings, player_levels, level_rects, levels, players, rooms;
-- SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Salas (una por clase). El docente se autentica con teacher_key.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code              CHAR(4)      NOT NULL UNIQUE,            -- código que ven los estudiantes
  teacher_key       VARCHAR(32)  NOT NULL,
  locked            TINYINT(1)   NOT NULL DEFAULT 0,         -- entrada cerrada
  creating_open     TINYINT(1)   NOT NULL DEFAULT 1,         -- se pueden crear niveles
  moderate          TINYINT(1)   NOT NULL DEFAULT 0,         -- niveles nuevos quedan "pending"
  featured_level_id INT UNSIGNED NULL,                       -- "hoyo del día" (sin FK: la app lo mantiene)
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Estudiantes (se identifican por nombre dentro de la sala)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(20)  NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_player_room_name (room_id, name),
  CONSTRAINT fk_players_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Niveles (hoyos). author_player_id NULL = nivel del docente.
-- Campo de 20 x 12 unidades; tee y hoyo están en el suelo (y = 0).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS levels (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id          INT UNSIGNED NOT NULL,
  author_player_id INT UNSIGNED NULL,
  title            VARCHAR(30)  NOT NULL,
  tee              TINYINT UNSIGNED NOT NULL,
  hole             TINYINT UNSIGNED NOT NULL,
  builtin          TINYINT(1)   NOT NULL DEFAULT 0,
  status           ENUM('pending','approved','hidden') NOT NULL DEFAULT 'approved',
  n_solutions      SMALLINT UNSIGNED NOT NULL,                -- calculado por el servidor al publicar
  difficulty       ENUM('facil','media','dificil') NOT NULL,  -- <=3 dificil, <=8 media, resto facil
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_level_tee  CHECK (tee  BETWEEN 1 AND 19),
  CONSTRAINT ck_level_hole CHECK (hole BETWEEN 1 AND 19 AND ABS(CAST(hole AS SIGNED) - CAST(tee AS SIGNED)) >= 3),
  KEY ix_levels_room (room_id, status),
  CONSTRAINT fk_levels_room   FOREIGN KEY (room_id)          REFERENCES rooms(id)   ON DELETE CASCADE,
  CONSTRAINT fk_levels_author FOREIGN KEY (author_player_id) REFERENCES players(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Obstáculos: rectángulos [x0,y0,x1,y1] en cuadrícula de 0.5 (máx. 4 por nivel, lo valida el servidor)
CREATE TABLE IF NOT EXISTS level_rects (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  level_id INT UNSIGNED NOT NULL,
  x0 DECIMAL(3,1) NOT NULL, y0 DECIMAL(3,1) NOT NULL,
  x1 DECIMAL(3,1) NOT NULL, y1 DECIMAL(3,1) NOT NULL,
  CONSTRAINT ck_rect_x CHECK (x0 >= 0 AND x0 < x1 AND x1 <= 20),
  CONSTRAINT ck_rect_y CHECK (y0 >= 0 AND y0 < y1 AND y1 <= 12),
  CONSTRAINT fk_rects_level FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Progreso de cada estudiante en cada nivel
-- points incluye el bono de ecuación (+30). sol_h/sol_k = vértice del tiro ganador.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_levels (
  player_id   INT UNSIGNED NOT NULL,
  level_id    INT UNSIGNED NOT NULL,
  shots       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  solved      TINYINT(1)   NOT NULL DEFAULT 0,
  points      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  equation_ok TINYINT(1)   NOT NULL DEFAULT 0,
  rated       TINYINT(1)   NOT NULL DEFAULT 0,
  sol_h       DECIMAL(3,1) NULL,
  sol_k       DECIMAL(3,1) NULL,
  PRIMARY KEY (player_id, level_id),
  CONSTRAINT fk_pl_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_level  FOREIGN KEY (level_id)  REFERENCES levels(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Calificaciones (una por estudiante y nivel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  level_id   INT UNSIGNED NOT NULL,
  player_id  INT UNSIGNED NOT NULL,
  stars      TINYINT UNSIGNED NOT NULL,
  difficulty_vote ENUM('easy','fair','impossible') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rating (level_id, player_id),
  CONSTRAINT ck_stars CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT fk_ratings_level  FOREIGN KEY (level_id)  REFERENCES levels(id)  ON DELETE CASCADE,
  CONSTRAINT fk_ratings_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Bitácora de tiros: alimenta el "mapa de errores" del docente
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shots (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id    INT UNSIGNED NOT NULL,
  player_id  INT UNSIGNED NOT NULL,
  level_id   INT UNSIGNED NOT NULL,
  h          DECIMAL(3,1) NOT NULL,
  k          DECIMAL(3,1) NOT NULL,
  result     ENUM('hole','short','long','wall','out','invalid') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_shots_room (room_id, result),
  KEY ix_shots_level (level_id),
  CONSTRAINT fk_shots_room   FOREIGN KEY (room_id)   REFERENCES rooms(id)   ON DELETE CASCADE,
  CONSTRAINT fk_shots_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT fk_shots_level  FOREIGN KEY (level_id)  REFERENCES levels(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  Vistas (misma lógica de puntos que usa el servidor)
-- =====================================================================

-- Estadísticas por nivel: intentos, resolvieron, estrellas
CREATE OR REPLACE VIEW v_level_stats AS
SELECT l.id AS level_id, l.room_id, l.title, l.status, l.difficulty, l.n_solutions,
       (SELECT COUNT(*) FROM player_levels pl WHERE pl.level_id = l.id AND pl.shots > 0) AS attempts,
       (SELECT COUNT(*) FROM player_levels pl WHERE pl.level_id = l.id AND pl.solved = 1) AS solvers,
       (SELECT ROUND(AVG(r.stars), 1) FROM ratings r WHERE r.level_id = l.id)            AS stars,
       (SELECT COUNT(*) FROM ratings r WHERE r.level_id = l.id)                           AS votes
FROM levels l;

-- Puntos del creador: 10 por cada compañero que resuelve (máx. 100)
-- + 30 si resuelve entre 30 % y 80 % de quienes lo intentan (mínimo 3 intentos)
CREATE OR REPLACE VIEW v_creator_points AS
SELECT s.author_player_id AS player_id,
       SUM(LEAST(10 * s.solvers, 100)
           + CASE WHEN s.attempts >= 3 AND s.solvers / s.attempts BETWEEN 0.3 AND 0.8 THEN 30 ELSE 0 END) AS points
FROM (SELECT l.author_player_id, st.attempts, st.solvers
      FROM levels l JOIN v_level_stats st ON st.level_id = l.id
      WHERE l.builtin = 0 AND l.status = 'approved' AND l.author_player_id IS NOT NULL) s
GROUP BY s.author_player_id;

-- Ranking de la sala
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT p.room_id, p.id AS player_id, p.name,
       COALESCE((SELECT SUM(pl.points) FROM player_levels pl WHERE pl.player_id = p.id), 0) AS play_points,
       COALESCE(cp.points, 0) AS creator_points,
       COALESCE((SELECT SUM(pl.points) FROM player_levels pl WHERE pl.player_id = p.id), 0)
         + COALESCE(cp.points, 0) AS total
FROM players p LEFT JOIN v_creator_points cp ON cp.player_id = p.id;

-- Mapa de errores por sala (choques = altura k; cortos/pasados = eje h)
CREATE OR REPLACE VIEW v_error_map AS
SELECT room_id, result, COUNT(*) AS total FROM shots GROUP BY room_id, result;

-- =====================================================================
--  Consultas útiles
-- =====================================================================
-- Ranking:          SELECT name, play_points, creator_points, total FROM v_leaderboard WHERE room_id = ? ORDER BY total DESC;
-- Niveles:          SELECT * FROM v_level_stats WHERE room_id = ?;
-- Errores:          SELECT result, total FROM v_error_map WHERE room_id = ?;
-- Pendientes:       SELECT id, title FROM levels WHERE room_id = ? AND status = 'pending';
-- Hoyo del día:     UPDATE rooms SET featured_level_id = ? WHERE id = ?;
