-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- User profiles table for additional user data
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Items table
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,  -- For future auth
    name TEXT,
    description TEXT,
    keywords TEXT,  -- Searchable tags/keywords
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
CREATE INDEX idx_user_profiles_is_pro ON user_profiles(is_pro);
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_embeddings_item_id ON embeddings(item_id);

-- Create storage bucket (run this in Supabase dashboard or via SQL)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('reactions', 'reactions', true);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Policies for user_profiles
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policies for items (users can only access their own items)
CREATE POLICY "Users can view their own items" ON items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items" ON items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items" ON items
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items" ON items
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for embeddings (cascade from items)
CREATE POLICY "Users can view embeddings for their items" ON embeddings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM items WHERE items.id = embeddings.item_id AND items.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert embeddings for their items" ON embeddings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM items WHERE items.id = embeddings.item_id AND items.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete embeddings for their items" ON embeddings
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM items WHERE items.id = embeddings.item_id AND items.user_id = auth.uid()
        )
    );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, is_pro)
    VALUES (NEW.id, FALSE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
