-- Weather Images Database Schema
-- Designed for both gallery display and data analysis

CREATE TABLE IF NOT EXISTS weather_images (
    id SERIAL PRIMARY KEY,

    -- ═══════════════════════════════════════════════════════════════════
    -- GALLERY CORE (essential for display)
    -- ═══════════════════════════════════════════════════════════════════
    storage_path TEXT NOT NULL,                              -- File location relative to IMAGES_STORE
    width INTEGER NOT NULL,                                  -- Image width in pixels
    height INTEGER NOT NULL,                                 -- Image height in pixels
    spider_name VARCHAR(50) NOT NULL,                        -- Source spider (cimss, sfcana, etc.)
    file_format VARCHAR(10),                                 -- gif, jpg, png (lowercase)
    is_animated BOOLEAN DEFAULT FALSE,                       -- True for animated GIFs
    file_size_bytes INTEGER,                                 -- File size on disk
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,            -- When downloaded

    -- ═══════════════════════════════════════════════════════════════════
    -- ANALYSIS: Source Tracking
    -- ═══════════════════════════════════════════════════════════════════
    name VARCHAR(255),                                       -- Original filename from source
    image_url TEXT,                                          -- Original source URL
    parent_url TEXT,                                         -- Page where image link was found
    page_title TEXT,                                         -- Title of source page
    source_modified TIMESTAMP WITH TIME ZONE,                -- When source last updated
    observation_time TIMESTAMP WITH TIME ZONE,               -- Resolved valid/observation time

    -- ═══════════════════════════════════════════════════════════════════
    -- ANALYSIS: HTTP/Caching
    -- ═══════════════════════════════════════════════════════════════════
    etag VARCHAR(255),                                       -- HTTP ETag for change detection
    checksum VARCHAR(64) UNIQUE,                             -- Content hash for deduplication
    download_status VARCHAR(20),                             -- downloaded, uptodate, failed

    -- ═══════════════════════════════════════════════════════════════════
    -- ANALYSIS: Technical Image Data
    -- ═══════════════════════════════════════════════════════════════════
    mode VARCHAR(10),                                        -- PIL mode: RGB, RGBA, P, L
    frame_count INTEGER DEFAULT 1,                           -- Number of frames (animated GIFs)

    -- ═══════════════════════════════════════════════════════════════════
    -- ANALYSIS: Raw Scrape Data
    -- ═══════════════════════════════════════════════════════════════════
    raw_metadata JSONB DEFAULT '{}'::jsonb,                  -- HTTP headers, server info, etc.

    -- ═══════════════════════════════════════════════════════════════════
    -- SYSTEM
    -- ═══════════════════════════════════════════════════════════════════
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- GALLERY INDEXES (fast display queries)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_gallery_list 
    ON weather_images(spider_name, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_fetched 
    ON weather_images(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_gallery_animated 
    ON weather_images(is_animated) WHERE is_animated = true;

CREATE INDEX IF NOT EXISTS idx_gallery_format 
    ON weather_images(file_format);

-- ═══════════════════════════════════════════════════════════════════════════
-- ANALYSIS INDEXES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_analysis_source_url 
    ON weather_images(image_url);

CREATE INDEX IF NOT EXISTS idx_analysis_parent_url 
    ON weather_images(parent_url);

CREATE INDEX IF NOT EXISTS idx_analysis_modified 
    ON weather_images(source_modified DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_observation_time 
    ON weather_images(observation_time DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_checksum 
    ON weather_images(checksum);

CREATE INDEX IF NOT EXISTS idx_analysis_raw_metadata 
    ON weather_images USING GIN(raw_metadata);

