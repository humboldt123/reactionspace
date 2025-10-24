# ReactionSpace Backend

FastAPI backend for ReactionSpace. Primarily for semantically/spatially organizing reaction media

**Tech Stack:**
- FastAPI: Web Framework
- Supabase: PostgreSQL + pgvector + storage
- OpenAI: Vision API (auto-captioning) + text embeddings
- ~~UMAP: Dimensionality reduction for 2D positioning~~


## Setup

**Install dependencies:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Set up Supabase:**
   - Create a new project at https://supabase.com
   - Run the SQL in `supabase_schema.sql` in the SQL Editor
   - Create a storage bucket called `reactions` and make it public
   - Copy your project URL and keys to `.env`

**Configure environment:**
   - Copy `.env.example` to `.env`
   - Add your OpenAI API key
   - Add your Supabase credentials

## Run

```bash
uvicorn app.main:app --reload --port 8000
```



## Endpoints:

- `POST /api/upload` - Upload image/video, auto-caption, compute position
- `GET /api/items` - Get all items
- `GET /api/items/{id}` - Get single item
- `PATCH /api/items/{id}` - Update item metadata
- `PATCH /api/items/{id}/position` - Update item position
- `GET /api/search?q=query` - Search items (includes spatial proximity)
- `POST /api/recompute-positions` - Regenerate UMAP layout



### User Flow
1. User uploads image/video
2. File stored in Supabase storage
3. OpenAI Vision analyzes and generates:
   - Name (short, catchy)
   - Description (1 sentence)
   - Caption (searchable keywords)
4. Text embedding generated from name+description+caption
5. UMAP computes 2D position from embedding
6. Item + embedding stored in database

#### Search

1. Query matches name/description/caption
2. Spatially nearby items (300px radius) also included
3. Results returned with positions

## Development

API docs available at http://localhost:8000/docs
