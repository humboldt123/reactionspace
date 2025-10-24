-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Items table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,  -- For future auth
    name TEXT,
    description TEXT,
    caption TEXT,  -- Searchable tags/keywords
    file_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
    x FLOAT NOT NULL DEFAULT 0,
    y FLOAT NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 200,
    height INTEGER NOT NULL DEFAULT 150,
    position_locked BOOLEAN NOT NULL DEFAULT FALSE,
    manual_cluster_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Embeddings table with pgvector
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    vector vector(1536),  -- OpenAI text-embedding-3-small dimension
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_embeddings_item_id ON embeddings(item_id);

-- Create storage bucket (run this in Supabase dashboard or via SQL)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('reactions', 'reactions', true);

-- Enable Row Level Security (optional, for future auth)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (you can restrict this later with auth)
CREATE POLICY "Allow all operations on items" ON items
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on embeddings" ON embeddings
    FOR ALL USING (true) WITH CHECK (true);
