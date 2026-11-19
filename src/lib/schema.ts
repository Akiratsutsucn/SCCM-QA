/** 数据库迁移。只增不改：新变更追加新的 id。 */
export const MIGRATIONS: { id: number; sql: string[] }[] = [
  {
    id: 1,
    sql: [
      `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
      `CREATE TABLE admin_users (
        id serial PRIMARY KEY,
        username text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        must_change boolean NOT NULL DEFAULT true,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE admin_sessions (
        id text PRIMARY KEY,
        user_id int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE vocabularies (
        id serial PRIMARY KEY,
        kind text NOT NULL CHECK (kind IN ('stage','symptom')),
        label text NOT NULL,
        sort int NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        UNIQUE (kind, label)
      )`,
      `CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL)`,
      `CREATE TABLE articles (
        id serial PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
        draft jsonb NOT NULL,
        published jsonb,
        published_version int,
        search_text text NOT NULL DEFAULT '',
        stage text,
        reviewed_at date,
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX articles_search_trgm ON articles USING gin (search_text gin_trgm_ops)`,
      `CREATE TABLE article_versions (
        id serial PRIMARY KEY,
        article_id int NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        version_no int NOT NULL,
        content jsonb NOT NULL,
        note text NOT NULL DEFAULT '',
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (article_id, version_no)
      )`,
      `CREATE TABLE article_codes (
        article_id int NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        code text NOT NULL,
        PRIMARY KEY (article_id, code)
      )`,
      `CREATE INDEX article_codes_code ON article_codes (code)`,
      `CREATE TABLE article_tags (
        article_id int NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        tag text NOT NULL,
        PRIMARY KEY (article_id, tag)
      )`,
      `CREATE TABLE media (
        id text PRIMARY KEY,
        mime text NOT NULL,
        width int NOT NULL,
        height int NOT NULL,
        sha256 text NOT NULL,
        caption text NOT NULL DEFAULT '',
        stage text,
        tags text[] NOT NULL DEFAULT '{}',
        in_gallery boolean NOT NULL DEFAULT false,
        article_id int REFERENCES articles(id) ON DELETE SET NULL,
        redaction_checked boolean NOT NULL DEFAULT false,
        is_public boolean NOT NULL DEFAULT false,
        broken boolean NOT NULL DEFAULT false,
        rev int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE synonyms (
        id serial PRIMARY KEY,
        phrase text NOT NULL,
        target_type text NOT NULL CHECK (target_type IN ('phrase','code','article')),
        target_value text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (phrase, target_type, target_value)
      )`,
      `CREATE TABLE guide_trees (
        id serial PRIMARY KEY,
        name text NOT NULL,
        root_node_id int,
        published_snapshot jsonb,
        published_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE guide_nodes (
        id serial PRIMARY KEY,
        tree_id int NOT NULL REFERENCES guide_trees(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('question','terminal')),
        title text NOT NULL,
        article_ids int[] NOT NULL DEFAULT '{}',
        sort int NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE guide_options (
        id serial PRIMARY KEY,
        node_id int NOT NULL REFERENCES guide_nodes(id) ON DELETE CASCADE,
        label text NOT NULL,
        sort int NOT NULL DEFAULT 0,
        is_unsure boolean NOT NULL DEFAULT false,
        target_node_id int REFERENCES guide_nodes(id) ON DELETE SET NULL,
        target_article_id int REFERENCES articles(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE query_log (
        id bigserial PRIMARY KEY,
        idem_key text NOT NULL UNIQUE,
        raw_redacted text NOT NULL,
        was_redacted boolean NOT NULL,
        code text,
        result_count int NOT NULL,
        clicked boolean NOT NULL DEFAULT false,
        session_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX query_log_created ON query_log (created_at)`,
      `CREATE TABLE events (
        id bigserial PRIMARY KEY,
        type text NOT NULL,
        idem_key text NOT NULL UNIQUE,
        article_id int,
        node_id int,
        query_id bigint,
        session_hash text NOT NULL,
        units int NOT NULL DEFAULT 1,
        changes int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX events_created ON events (created_at)`,
      `CREATE TABLE feedback (
        id bigserial PRIMARY KEY,
        idem_key text NOT NULL UNIQUE,
        text text NOT NULL,
        stage text,
        extra text NOT NULL DEFAULT '',
        context text NOT NULL DEFAULT '',
        session_hash text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE candidates (
        id bigserial PRIMARY KEY,
        source text NOT NULL CHECK (source IN ('zero_result','no_click','feedback','unresolved')),
        ref_id bigint NOT NULL,
        text text NOT NULL,
        status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','mapped','ignored','drafted','synonym')),
        reason text NOT NULL DEFAULT '',
        article_id int,
        created_at timestamptz NOT NULL DEFAULT now(),
        handled_at timestamptz,
        UNIQUE (source, ref_id)
      )`,
      `CREATE TABLE stats_daily (
        day date NOT NULL,
        type text NOT NULL,
        article_id int NOT NULL DEFAULT 0,
        n int NOT NULL DEFAULT 0,
        sessions int NOT NULL DEFAULT 0,
        units int NOT NULL DEFAULT 0,
        PRIMARY KEY (day, type, article_id)
      )`,
      `CREATE TABLE audit_log (
        id bigserial PRIMARY KEY,
        actor text NOT NULL,
        action text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE announcements (
        id serial PRIMARY KEY,
        title text NOT NULL,
        body text NOT NULL DEFAULT '',
        link_url text,
        link_label text,
        pinned boolean NOT NULL DEFAULT false,
        published boolean NOT NULL DEFAULT false,
        starts_at timestamptz,
        ends_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
];
