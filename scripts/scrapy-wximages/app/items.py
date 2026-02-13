# Define here the models for your scraped items
#
# See documentation in:
# https://docs.scrapy.org/en/latest/topics/items.html

import scrapy


class ImageItem(scrapy.Item):
    """
    Weather image metadata for gallery display and analysis.

    Fields are organized into:
    - SCRAPY INTERNAL: Required by ImagesPipeline
    - GALLERY CORE: Essential for frontend display
    - ANALYSIS: Source tracking, HTTP data, technical metadata
    """

    # ═══════════════════════════════════════════════════════════════════
    # SCRAPY INTERNAL (not stored in DB, used during pipeline)
    # ═══════════════════════════════════════════════════════════════════
    image_urls = scrapy.Field()  # URLs for ImagesPipeline to download
    images = scrapy.Field()      # Filled by ImagesPipeline: path, checksum, status
    spider_name = scrapy.Field() # Which spider produced this item

    # ═══════════════════════════════════════════════════════════════════
    # GALLERY CORE (essential for display)
    # ═══════════════════════════════════════════════════════════════════
    # Note: storage_path comes from images[0]["path"] during import

    width = scrapy.Field()           # Image width in pixels
    height = scrapy.Field()          # Image height in pixels
    file_format = scrapy.Field()     # gif, png, jpg (lowercase)
    is_animated = scrapy.Field()     # True for animated GIFs
    file_size_bytes = scrapy.Field() # File size on disk
    fetched_at = scrapy.Field()      # When downloaded (ISO 8601)

    # ═══════════════════════════════════════════════════════════════════
    # ANALYSIS: Source Tracking
    # ═══════════════════════════════════════════════════════════════════
    name = scrapy.Field()            # Original filename from source
    parent_url = scrapy.Field()      # Page where image link was found
    page_title = scrapy.Field()      # Title of source page
    source_modified = scrapy.Field() # When source says file was modified (ISO 8601)
    observation_time = scrapy.Field() # Resolved valid/observation time (ISO 8601)

    # ═══════════════════════════════════════════════════════════════════
    # ANALYSIS: HTTP/Caching
    # ═══════════════════════════════════════════════════════════════════
    etag = scrapy.Field()            # HTTP ETag for change detection

    # ═══════════════════════════════════════════════════════════════════
    # ANALYSIS: Technical Image Data
    # ═══════════════════════════════════════════════════════════════════
    mode = scrapy.Field()            # PIL mode: RGB, RGBA, P, L
    frame_count = scrapy.Field()     # Number of frames (animated GIFs)

    # ═══════════════════════════════════════════════════════════════════
    # ANALYSIS: Raw Scrape Data
    # ═══════════════════════════════════════════════════════════════════
    raw_metadata = scrapy.Field()    # Dict of HTTP headers, server info, etc.
