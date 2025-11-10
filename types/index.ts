export interface BrokenGallery {
  page_url: string
  image_url: string
  alt_text: string
  reason: string
  status: "broken" | "working" | "no curated gallery"
  scraped_html: string
  puppeteer_used: boolean
  debug_info: string
  cloudflare_blocked: boolean
}

export interface ScanResult {
  total_pages: number
  broken_count: number
  working_count: number
  no_gallery_count: number
  cloudflare_blocked_count: number
  items: BrokenGallery[]
}
