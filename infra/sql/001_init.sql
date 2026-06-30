CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  id uuid PRIMARY KEY,
  visitor_id text UNIQUE NOT NULL,
  account_id uuid REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY,
  object_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('food', 'store-cover', 'banner', 'icon')),
  rights_status text NOT NULL CHECK (rights_status IN ('owned', 'licensed', 'authorized', 'pending-review', 'blocked')),
  source_url text,
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY,
  name text NOT NULL,
  category_id text NOT NULL,
  display_status text NOT NULL CHECK (display_status IN ('published', 'hidden', 'draft')),
  source_type text NOT NULL CHECK (source_type IN ('original', 'licensed', 'authorized', 'derived')),
  delivery_fee_cents integer NOT NULL CHECK (delivery_fee_cents >= 0),
  packing_fee_cents integer NOT NULL CHECK (packing_fee_cents >= 0),
  minimum_order_cents integer NOT NULL CHECK (minimum_order_cents >= 0),
  location geometry(Point, 4326)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id text PRIMARY KEY,
  store_id text NOT NULL REFERENCES stores(id),
  category_id text NOT NULL,
  name text NOT NULL,
  subtitle text,
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  source_type text NOT NULL CHECK (source_type IN ('original', 'licensed', 'authorized', 'derived')),
  status text NOT NULL CHECK (status IN ('published', 'draft', 'hidden')),
  asset_id uuid REFERENCES assets(id),
  spec_groups jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS virtual_routes (
  id uuid PRIMARY KEY,
  city_code text NOT NULL,
  coord_system text NOT NULL CHECK (coord_system IN ('gcj02', 'wgs84', 'bd09')),
  origin jsonb NOT NULL,
  destination jsonb NOT NULL,
  polyline jsonb NOT NULL,
  route_source text NOT NULL,
  label text NOT NULL DEFAULT '虚拟配送路线'
);

CREATE TABLE IF NOT EXISTS virtual_orders (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES accounts(id),
  visitor_id text,
  is_virtual boolean NOT NULL DEFAULT true CHECK (is_virtual = true),
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  seed text NOT NULL,
  route_id uuid UNIQUE NOT NULL REFERENCES virtual_routes(id),
  items_total_cents integer NOT NULL CHECK (items_total_cents >= 0),
  delivery_fee_cents integer NOT NULL CHECK (delivery_fee_cents >= 0),
  packing_fee_cents integer NOT NULL CHECK (packing_fee_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  destination_id text NOT NULL,
  lines jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  visitor_id text,
  account_id uuid REFERENCES accounts(id),
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_records (
  id uuid PRIMARY KEY,
  source_type text NOT NULL,
  source_url text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_candidates (
  id uuid PRIMARY KEY,
  source_record_id uuid REFERENCES source_records(id),
  candidate_type text NOT NULL,
  payload jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  public_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stores_location_gix ON stores USING gist(location);
CREATE INDEX IF NOT EXISTS catalog_candidates_review_idx ON catalog_candidates(review_status);

