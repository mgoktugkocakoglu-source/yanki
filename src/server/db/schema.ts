/**
 * Şema göçleri. Sıra numarası `PRAGMA user_version` ile izlenir; uygulanmış
 * bir göç asla değiştirilmez, yeni değişiklik dizinin sonuna eklenir.
 *
 * Her tabloda çalışma alanı (workspace) kimliği bulunur: kiracı sınırı ilk
 * günden şemanın parçasıdır.
 */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('demo', 'live')),
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    query          TEXT NOT NULL,
    connector_ids  TEXT NOT NULL DEFAULT '[]',
    color_slot     INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX idx_projects_workspace ON projects (workspace_id, created_at);

  CREATE TABLE project_topics (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    group_name   TEXT NOT NULL,
    name         TEXT NOT NULL,
    name_folded  TEXT NOT NULL,
    query        TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_topics_project ON project_topics (project_id, position);

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
    author_followers      INTEGER,
    language              TEXT NOT NULL,
    published_at          INTEGER NOT NULL,
    collected_at          INTEGER NOT NULL,
    likes                 INTEGER,
    comments              INTEGER,
    shares                INTEGER,
    views                 INTEGER,
    engagement            INTEGER,
    reach                 INTEGER,
    reach_basis           TEXT,
    sentiment             TEXT NOT NULL,
    sentiment_score       REAL NOT NULL,
    sentiment_confidence  REAL NOT NULL,
    emotion               TEXT NOT NULL,
    is_sarcastic          INTEGER NOT NULL DEFAULT 0,
    intent                TEXT NOT NULL,
    story_key             TEXT NOT NULL,
    analyzer_version      TEXT NOT NULL,
    sentiment_override    TEXT,
    is_irrelevant         INTEGER NOT NULL DEFAULT 0,
    is_demo               INTEGER NOT NULL DEFAULT 0,
    UNIQUE (project_id, connector_id, external_id)
  );
  CREATE INDEX idx_mentions_project_time ON mentions (project_id, published_at DESC);
  CREATE INDEX idx_mentions_project_story ON mentions (project_id, story_key);

  CREATE TABLE mention_topics (
    mention_id  TEXT NOT NULL REFERENCES mentions(id) ON DELETE CASCADE,
    topic_id    TEXT NOT NULL REFERENCES project_topics(id) ON DELETE CASCADE,
    PRIMARY KEY (mention_id, topic_id)
  ) WITHOUT ROWID;
  CREATE INDEX idx_mention_topics_topic ON mention_topics (topic_id);

  CREATE TABLE collection_runs (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connector_id  TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    finished_at   INTEGER NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('ok', 'empty', 'error', 'skipped')),
    fetched       INTEGER NOT NULL DEFAULT 0,
    matched       INTEGER NOT NULL DEFAULT 0,
    inserted      INTEGER NOT NULL DEFAULT 0,
    message       TEXT
  );
  CREATE INDEX idx_runs_project ON collection_runs (project_id, started_at DESC);

  CREATE TABLE audit_events (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT,
    actor         TEXT NOT NULL,
    action        TEXT NOT NULL,
    object_type   TEXT NOT NULL,
    object_id     TEXT,
    detail        TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX idx_audit_time ON audit_events (created_at DESC);
  `,
  `
  CREATE TABLE app_meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  ) WITHOUT ROWID;
  `,
  `
  CREATE TABLE ai_summaries (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    range_key       TEXT NOT NULL,
    range_from      INTEGER NOT NULL,
    range_to        INTEGER NOT NULL,
    provider        TEXT NOT NULL,
    model           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    themes          TEXT NOT NULL DEFAULT '[]',
    mentions_sent   INTEGER NOT NULL,
    mentions_total  INTEGER NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX idx_ai_summaries_project ON ai_summaries (project_id, range_key, created_at DESC);
  `,
  `
  ALTER TABLE mentions ADD COLUMN ai_sentiment TEXT;
  ALTER TABLE mentions ADD COLUMN ai_model TEXT;
  ALTER TABLE mentions ADD COLUMN ai_classified_at INTEGER;
  ALTER TABLE mention_topics ADD COLUMN source TEXT NOT NULL DEFAULT 'rule';
  `,
  `
  CREATE TABLE claim_runs (
    id                 TEXT PRIMARY KEY,
    workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    range_key          TEXT NOT NULL,
    range_from         INTEGER NOT NULL,
    range_to           INTEGER NOT NULL,
    model              TEXT NOT NULL,
    mentions_sent      INTEGER NOT NULL,
    mentions_total     INTEGER NOT NULL,
    factcheck_status   TEXT NOT NULL CHECK (factcheck_status IN ('ok', 'disabled', 'error')),
    factcheck_message  TEXT,
    created_at         INTEGER NOT NULL
  );
  CREATE INDEX idx_claim_runs_project ON claim_runs (project_id, range_key, created_at DESC);

  CREATE TABLE claims (
    id             TEXT PRIMARY KEY,
    run_id         TEXT NOT NULL REFERENCES claim_runs(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    text           TEXT NOT NULL,
    first_seen_at  INTEGER NOT NULL,
    platforms      TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX idx_claims_run ON claims (run_id, position);

  CREATE TABLE claim_mentions (
    claim_id    TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    mention_id  TEXT NOT NULL REFERENCES mentions(id) ON DELETE CASCADE,
    PRIMARY KEY (claim_id, mention_id)
  ) WITHOUT ROWID;

  CREATE TABLE claim_checks (
    id              TEXT PRIMARY KEY,
    claim_id        TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    publisher_name  TEXT NOT NULL,
    publisher_site  TEXT,
    url             TEXT NOT NULL,
    title           TEXT NOT NULL,
    rating          TEXT NOT NULL,
    review_date     INTEGER,
    claim_text      TEXT NOT NULL,
    language        TEXT
  );
  CREATE INDEX idx_claim_checks_claim ON claim_checks (claim_id);
  `,
  `
  CREATE TABLE report_shares (
    token         TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    range_key     TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    revoked_at    INTEGER
  ) WITHOUT ROWID;
  CREATE INDEX idx_report_shares_project ON report_shares (project_id, created_at DESC);
  `,
  `
  -- Kaynakların bildirdiği bölgeli dil etiketleri ("en-US") iki harfli koda indirilir.
  UPDATE mentions SET language = lower(substr(language, 1, 2))
  WHERE length(language) > 2 AND language <> 'und' AND substr(language, 3, 1) IN ('-', '_');
  `,
  `
  CREATE TABLE users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
    password_hash  TEXT NOT NULL,
    credits        INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    created_at     INTEGER NOT NULL,
    disabled_at    INTEGER
  );

  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX idx_sessions_user ON sessions (user_id);

  CREATE TABLE credit_ledger (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    object_id   TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_credit_ledger_user ON credit_ledger (user_id, created_at DESC);

  CREATE TABLE project_owners (
    project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  ) WITHOUT ROWID;
  `,
  `
  -- Üç katmanlı yetki: sistem yöneticisi (kurum dışı), kurum yöneticisi, kullanıcı.
  -- Kurumlar, kurum kredi havuzu, yöneticiye verilen yetkiler, davetler ve parola sıfırlama.
  CREATE TABLE organizations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    credit_pool   INTEGER NOT NULL DEFAULT 0 CHECK (credit_pool >= 0),
    seat_limit    INTEGER CHECK (seat_limit IS NULL OR seat_limit > 0),
    created_at    INTEGER NOT NULL,
    suspended_at  INTEGER
  );
  CREATE UNIQUE INDEX idx_organizations_name ON organizations (name COLLATE NOCASE);

  CREATE TABLE organization_domains (
    org_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain  TEXT NOT NULL,
    PRIMARY KEY (org_id, domain)
  ) WITHOUT ROWID;

  CREATE TABLE organization_ledger (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    actor       TEXT NOT NULL,
    user_id     TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_org_ledger ON organization_ledger (org_id, created_at DESC);

  -- users tablosundaki rol kısıtı değiştiği için tablo yeniden kurulur. Bağlı
  -- tablolar önce düşürülür; yoksa basamaklı silme kayıtlarını götürür.
  CREATE TABLE old_users AS SELECT * FROM users;
  CREATE TABLE old_ledger AS SELECT * FROM credit_ledger;
  CREATE TABLE old_owners AS SELECT * FROM project_owners;
  DROP TABLE sessions;
  DROP TABLE credit_ledger;
  DROP TABLE project_owners;
  DROP TABLE users;

  INSERT INTO organizations (id, name, created_at)
  SELECT 'varsayilan-kurum', 'Varsayılan kurum', MIN(created_at) FROM old_users WHERE role = 'analyst' HAVING COUNT(*) > 0;

  CREATE TABLE users (
    id                   TEXT PRIMARY KEY,
    email                TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    role                 TEXT NOT NULL CHECK (role IN ('sysadmin', 'admin', 'analyst')),
    org_id               TEXT REFERENCES organizations(id),
    password_hash        TEXT NOT NULL,
    credits              INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    created_at           INTEGER NOT NULL,
    disabled_at          INTEGER,
    password_changed_at  INTEGER,
    last_login_at        INTEGER,
    -- Sistem yöneticisi kurum dışıdır; diğer herkes bir kuruma bağlıdır.
    CHECK ((role = 'sysadmin') = (org_id IS NULL))
  );
  CREATE INDEX idx_users_org ON users (org_id);

  INSERT INTO users (id, email, name, role, org_id, password_hash, credits, created_at, disabled_at)
  SELECT id, email, name,
         CASE role WHEN 'admin' THEN 'sysadmin' ELSE 'analyst' END,
         CASE role WHEN 'admin' THEN NULL ELSE 'varsayilan-kurum' END,
         password_hash, credits, created_at, disabled_at
  FROM old_users;

  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX idx_sessions_user ON sessions (user_id);

  CREATE TABLE credit_ledger (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    object_id   TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_credit_ledger_user ON credit_ledger (user_id, created_at DESC);
  INSERT INTO credit_ledger SELECT id, user_id, delta, reason, object_id, created_at FROM old_ledger;

  CREATE TABLE project_owners (
    project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  ) WITHOUT ROWID;
  INSERT INTO project_owners SELECT project_id, user_id FROM old_owners;

  DROP TABLE old_users;
  DROP TABLE old_ledger;
  DROP TABLE old_owners;

  -- Kurum yöneticisine sistem yöneticisinin verdiği yetkiler.
  CREATE TABLE user_permissions (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    granted_by  TEXT NOT NULL,
    granted_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, permission)
  ) WITHOUT ROWID;

  -- E-posta yetkilendirme: davet bağlantısının yalnızca özeti saklanır.
  CREATE TABLE invitations (
    id           TEXT PRIMARY KEY,
    token_hash   TEXT NOT NULL UNIQUE,
    org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    name         TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
    credits      INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    permissions  TEXT NOT NULL DEFAULT '[]',
    invited_by   TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    accepted_at  INTEGER,
    revoked_at   INTEGER
  );
  CREATE INDEX idx_invitations_org ON invitations (org_id, created_at DESC);
  CREATE INDEX idx_invitations_email ON invitations (email);

  CREATE TABLE password_resets (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER
  ) WITHOUT ROWID;

  -- Denetim izi kurum bazında süzülebilsin.
  ALTER TABLE audit_events ADD COLUMN org_id TEXT;
  CREATE INDEX idx_audit_org ON audit_events (org_id, created_at DESC);
  `,

  // 10: Haber arşivi. Projelerden bağımsız, sürekli toplanan haber başlıkları.
  `
  -- Taranan akışlar (RSS/Atom ya da haber site haritası) ve son durumları.
  CREATE TABLE news_feeds (
    id               TEXT PRIMARY KEY,
    outlet           TEXT NOT NULL,
    domain           TEXT NOT NULL,
    url              TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL CHECK (kind IN ('rss', 'sitemap')),
    language         TEXT NOT NULL DEFAULT 'tr',
    origin           TEXT NOT NULL CHECK (origin IN ('seed', 'manual')),
    enabled          INTEGER NOT NULL DEFAULT 1,
    etag             TEXT,
    last_modified    TEXT,
    last_fetched_at  INTEGER,
    last_ok_at       INTEGER,
    last_status      TEXT CHECK (last_status IN ('ok', 'unchanged', 'error', 'robots')),
    last_error       TEXT,
    last_item_count  INTEGER NOT NULL DEFAULT 0,
    failures         INTEGER NOT NULL DEFAULT 0,
    next_due_at      INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL
  );
  CREATE INDEX idx_news_feeds_due ON news_feeds (enabled, next_due_at);

  -- Alan adı başına robots.txt; günde bir yenilenir.
  CREATE TABLE news_robots (
    host        TEXT PRIMARY KEY,
    body        TEXT NOT NULL,
    fetched_at  INTEGER NOT NULL
  ) WITHOUT ROWID;

  -- Arşiv: yalnızca başlık, kısa özet ve bağlantı. Tam metin saklanmaz.
  CREATE TABLE news_articles (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id        TEXT NOT NULL,
    outlet         TEXT NOT NULL,
    domain         TEXT NOT NULL,
    url            TEXT NOT NULL UNIQUE,
    external_id    TEXT NOT NULL,
    title          TEXT NOT NULL,
    summary        TEXT NOT NULL,
    search_text    TEXT NOT NULL,
    language       TEXT NOT NULL,
    published_at   INTEGER NOT NULL,
    first_seen_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_news_articles_published ON news_articles (published_at DESC);
  CREATE INDEX idx_news_articles_domain ON news_articles (domain, published_at DESC);
  `,
];
