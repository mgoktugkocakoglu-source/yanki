/**
 * Şema göçleri (PostgreSQL). Uygulanan sürüm `schema_migrations` tablosunda
 * izlenir; uygulanmış bir göç asla değiştirilmez, değişiklik yeni bir göç
 * olarak eklenir.
 *
 * Tür kuralları: zaman damgaları epoch milisaniye olarak BIGINT tutulur
 * (uygulamanın tamamı bu birimle çalışır), bayraklar 0/1 değerli BIGINT'tir,
 * kimlikler uygulamanın ürettiği metinlerdir.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: SQLite döneminin on göçünün birleşik hali (27 tablo).
  `
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('demo', 'live')),
  created_at  BIGINT NOT NULL
  );

CREATE TABLE projects (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  query          TEXT NOT NULL,
  connector_ids  TEXT NOT NULL DEFAULT '[]',
  color_slot     BIGINT NOT NULL DEFAULT 0,
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
  );

CREATE TABLE project_topics (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_name   TEXT NOT NULL,
  name         TEXT NOT NULL,
  name_folded  TEXT NOT NULL,
  query        TEXT NOT NULL,
  position     BIGINT NOT NULL DEFAULT 0
  );

CREATE TABLE mentions (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connector_id          TEXT NOT NULL,
  source_type           TEXT NOT NULL,
  source_name           TEXT NOT NULL,
  external_id           TEXT NOT NULL,
  url                   TEXT NOT NULL,
  title                 TEXT NOT NULL,
  content               TEXT NOT NULL,
  search_text           TEXT NOT NULL,
  author_name           TEXT,
  author_handle         TEXT,
  author_followers      BIGINT,
  language              TEXT NOT NULL,
  published_at          BIGINT NOT NULL,
  collected_at          BIGINT NOT NULL,
  likes                 BIGINT,
  comments              BIGINT,
  shares                BIGINT,
  views                 BIGINT,
  engagement            BIGINT,
  reach                 BIGINT,
  reach_basis           TEXT,
  sentiment             TEXT NOT NULL,
  sentiment_score       DOUBLE PRECISION NOT NULL,
  sentiment_confidence  DOUBLE PRECISION NOT NULL,
  emotion               TEXT NOT NULL,
  is_sarcastic          BIGINT NOT NULL DEFAULT 0,
  intent                TEXT NOT NULL,
  story_key             TEXT NOT NULL,
  analyzer_version      TEXT NOT NULL,
  sentiment_override    TEXT,
  is_irrelevant         BIGINT NOT NULL DEFAULT 0,
  is_demo               BIGINT NOT NULL DEFAULT 0, ai_sentiment TEXT, ai_model TEXT, ai_classified_at BIGINT,
  UNIQUE (project_id, connector_id, external_id)
  );

CREATE TABLE mention_topics (
  mention_id  TEXT NOT NULL REFERENCES mentions(id) ON DELETE CASCADE,
  topic_id    TEXT NOT NULL REFERENCES project_topics(id) ON DELETE CASCADE, source TEXT NOT NULL DEFAULT 'rule',
  PRIMARY KEY (mention_id, topic_id)
  );

CREATE TABLE collection_runs (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connector_id  TEXT NOT NULL,
  started_at    BIGINT NOT NULL,
  finished_at   BIGINT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ok', 'empty', 'error', 'skipped')),
  fetched       BIGINT NOT NULL DEFAULT 0,
  matched       BIGINT NOT NULL DEFAULT 0,
  inserted      BIGINT NOT NULL DEFAULT 0,
  message       TEXT
  );

CREATE TABLE audit_events (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT,
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  object_type   TEXT NOT NULL,
  object_id     TEXT,
  detail        TEXT,
  created_at    BIGINT NOT NULL
  , org_id TEXT);

CREATE TABLE app_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
  );

CREATE TABLE ai_summaries (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  range_key       TEXT NOT NULL,
  range_from      BIGINT NOT NULL,
  range_to        BIGINT NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  themes          TEXT NOT NULL DEFAULT '[]',
  mentions_sent   BIGINT NOT NULL,
  mentions_total  BIGINT NOT NULL,
  input_tokens    BIGINT,
  output_tokens   BIGINT,
  created_at      BIGINT NOT NULL
  );

CREATE TABLE claim_runs (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  range_key          TEXT NOT NULL,
  range_from         BIGINT NOT NULL,
  range_to           BIGINT NOT NULL,
  model              TEXT NOT NULL,
  mentions_sent      BIGINT NOT NULL,
  mentions_total     BIGINT NOT NULL,
  factcheck_status   TEXT NOT NULL CHECK (factcheck_status IN ('ok', 'disabled', 'error')),
  factcheck_message  TEXT,
  created_at         BIGINT NOT NULL
  );

CREATE TABLE claims (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
  position       BIGINT NOT NULL,
  text           TEXT NOT NULL,
  first_seen_at  BIGINT NOT NULL,
  platforms      TEXT NOT NULL DEFAULT '{}'
  );

CREATE TABLE claim_mentions (
  claim_id    TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  mention_id  TEXT NOT NULL REFERENCES mentions(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, mention_id)
  );

CREATE TABLE claim_checks (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  publisher_name  TEXT NOT NULL,
  publisher_site  TEXT,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  rating          TEXT NOT NULL,
  review_date     BIGINT,
  claim_text      TEXT NOT NULL,
  language        TEXT
  );

CREATE TABLE report_shares (
  token         TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  range_key     TEXT NOT NULL,
  created_at    BIGINT NOT NULL,
  revoked_at    BIGINT
  );

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  credit_pool   BIGINT NOT NULL DEFAULT 0 CHECK (credit_pool >= 0),
  seat_limit    BIGINT CHECK (seat_limit IS NULL OR seat_limit > 0),
  created_at    BIGINT NOT NULL,
  suspended_at  BIGINT
  );

CREATE TABLE organization_domains (
  org_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain  TEXT NOT NULL,
  PRIMARY KEY (org_id, domain)
  );

CREATE TABLE organization_ledger (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  delta       BIGINT NOT NULL,
  reason      TEXT NOT NULL,
  actor       TEXT NOT NULL,
  user_id     TEXT,
  created_at  BIGINT NOT NULL,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY
  );

CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('sysadmin', 'admin', 'analyst')),
  org_id               TEXT REFERENCES organizations(id),
  password_hash        TEXT NOT NULL,
  credits              BIGINT NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at           BIGINT NOT NULL,
  disabled_at          BIGINT,
  password_changed_at  BIGINT,
  last_login_at        BIGINT,
  -- Sistem yöneticisi kurum dışıdır; diğer herkes bir kuruma bağlıdır.
  CHECK ((role = 'sysadmin') = (org_id IS NULL))
  );

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
  );

CREATE TABLE credit_ledger (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       BIGINT NOT NULL,
  reason      TEXT NOT NULL,
  object_id   TEXT,
  created_at  BIGINT NOT NULL,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY
  );

CREATE TABLE project_owners (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );

CREATE TABLE user_permissions (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  granted_by  TEXT NOT NULL,
  granted_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, permission)
  );

CREATE TABLE invitations (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
  credits      BIGINT NOT NULL DEFAULT 0 CHECK (credits >= 0),
  permissions  TEXT NOT NULL DEFAULT '[]',
  invited_by   TEXT NOT NULL,
  created_at   BIGINT NOT NULL,
  expires_at   BIGINT NOT NULL,
  accepted_at  BIGINT,
  revoked_at   BIGINT
  );

CREATE TABLE password_resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  used_at     BIGINT
  );

CREATE TABLE news_feeds (
  id               TEXT PRIMARY KEY,
  outlet           TEXT NOT NULL,
  domain           TEXT NOT NULL,
  url              TEXT NOT NULL UNIQUE,
  kind             TEXT NOT NULL CHECK (kind IN ('rss', 'sitemap')),
  language         TEXT NOT NULL DEFAULT 'tr',
  origin           TEXT NOT NULL CHECK (origin IN ('seed', 'manual')),
  enabled          BIGINT NOT NULL DEFAULT 1,
  etag             TEXT,
  last_modified    TEXT,
  last_fetched_at  BIGINT,
  last_ok_at       BIGINT,
  last_status      TEXT CHECK (last_status IN ('ok', 'unchanged', 'error', 'robots')),
  last_error       TEXT,
  last_item_count  BIGINT NOT NULL DEFAULT 0,
  failures         BIGINT NOT NULL DEFAULT 0,
  next_due_at      BIGINT NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL
  );

CREATE TABLE news_robots (
  host        TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  fetched_at  BIGINT NOT NULL
  );

CREATE TABLE news_articles (
  id             BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  feed_id        TEXT NOT NULL,
  outlet         TEXT NOT NULL,
  domain         TEXT NOT NULL,
  url            TEXT NOT NULL UNIQUE,
  external_id    TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL,
  search_text    TEXT NOT NULL,
  language       TEXT NOT NULL,
  published_at   BIGINT NOT NULL,
  first_seen_at  BIGINT NOT NULL
  );

CREATE INDEX idx_projects_workspace ON projects (workspace_id, created_at);

CREATE INDEX idx_topics_project ON project_topics (project_id, position);

CREATE INDEX idx_mentions_project_time ON mentions (project_id, published_at DESC);

CREATE INDEX idx_mentions_project_story ON mentions (project_id, story_key);

CREATE INDEX idx_mention_topics_topic ON mention_topics (topic_id);

CREATE INDEX idx_runs_project ON collection_runs (project_id, started_at DESC);

CREATE INDEX idx_audit_time ON audit_events (created_at DESC);

CREATE INDEX idx_ai_summaries_project ON ai_summaries (project_id, range_key, created_at DESC);

CREATE INDEX idx_claim_runs_project ON claim_runs (project_id, range_key, created_at DESC);

CREATE INDEX idx_claims_run ON claims (run_id, position);

CREATE INDEX idx_claim_checks_claim ON claim_checks (claim_id);

CREATE INDEX idx_report_shares_project ON report_shares (project_id, created_at DESC);

CREATE UNIQUE INDEX idx_organizations_name ON organizations (lower(name));

CREATE INDEX idx_org_ledger ON organization_ledger (org_id, created_at DESC);

CREATE INDEX idx_users_org ON users (org_id);

CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE INDEX idx_credit_ledger_user ON credit_ledger (user_id, created_at DESC);

CREATE INDEX idx_invitations_org ON invitations (org_id, created_at DESC);

CREATE INDEX idx_invitations_email ON invitations (email);

CREATE INDEX idx_audit_org ON audit_events (org_id, created_at DESC);

CREATE INDEX idx_news_feeds_due ON news_feeds (enabled, next_due_at);

CREATE INDEX idx_news_articles_published ON news_articles (published_at DESC);

CREATE INDEX idx_news_articles_domain ON news_articles (domain, published_at DESC);
  `,
];
