import { type NextRequest, NextResponse } from "next/server"
import { AbortController } from "node-abort-controller"

interface BrokenGallery {
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

interface ScanResult {
  total_pages: number
  broken_count: number
  working_count: number
  no_gallery_count: number
  cloudflare_blocked_count: number
  items: BrokenGallery[]
}

function detectCloudflareBlocking(status: number, headers: Headers, html: string): boolean {
  // Check for Cloudflare status codes
  if (status === 403 || status === 429 || status === 503) {
    return true
  }
  // Check for Cloudflare-specific headers
  if (headers.get("server")?.includes("cloudflare") || headers.get("cf-ray")) {
    return true
  }
  // Check for Cloudflare challenge page content
  if (
    html.includes("You are being rate limited") ||
    html.includes("Checking your browser") ||
    html.includes("cloudflare-challenge") ||
    html.includes("Ray ID:")
  ) {
    return true
  }
  return false
}

async function detectBrokenGalleries(url: string): Promise<BrokenGallery[]> {
  try {
    let html: string
    let puppeteerUsed = false
    let debugInfo = ""
    let cloudflareBlocked = false

    try {
      const puppeteer = await import("puppeteer")
      debugInfo = "Puppeteer imported successfully"

      const launchOptions: any = {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-plugins",
        ],
      }

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
        debugInfo += " | Using system Chromium"
      }

      const browser = await puppeteer.default.launch(launchOptions)
      debugInfo += " | Browser launched"

      const page = await browser.newPage()

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
        debugInfo += " | Page loaded"
      } catch (navError) {
        debugInfo += ` | Navigation timeout after 30s`
        cloudflareBlocked = true
      }

      try {
        await page.waitForSelector('[class*="c1s88gxp"]', { timeout: 5000 })
        debugInfo += " | Gallery elements found"
      } catch {
        debugInfo += " | No gallery selectors found"
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))

      html = await page.content()
      puppeteerUsed = true
      debugInfo += " | Final DOM captured"

      await browser.close()

      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        html = bodyMatch[1]
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        html = html.replace(/\s+(on\w+|data-[a-z-]*)\s*=\s*"[^"]*"/gi, "")
      }
    } catch (puppeteerError) {
      debugInfo += ` | Puppeteer failed: ${puppeteerError instanceof Error ? puppeteerError.message : "Unknown error"}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        cloudflareBlocked = detectCloudflareBlocking(response.status, response.headers, await response.text())
        if (cloudflareBlocked) {
          debugInfo += " | Cloudflare blocking detected"
          return [
            {
              page_url: url,
              image_url: "N/A",
              alt_text: "",
              reason: "Cloudflare is blocking requests",
              status: "broken",
              scraped_html: "",
              puppeteer_used: false,
              debug_info: debugInfo,
              cloudflare_blocked: true,
            },
          ]
        }

        if (!response.ok) {
          return [
            {
              page_url: url,
              image_url: "N/A",
              alt_text: "",
              reason: `Page returned status ${response.status}`,
              status: "broken",
              scraped_html: "",
              puppeteer_used: false,
              debug_info: debugInfo + ` | Fetch status: ${response.status}`,
              cloudflare_blocked: false,
            },
          ]
        }

        html = await response.text()
        debugInfo += " | Using fetch fallback (no JS execution)"
      } catch (fetchError) {
        clearTimeout(timeoutId)
        throw fetchError
      }
    }

    const brokenItems: BrokenGallery[] = []

    const containerRegex = /<div[^>]*class="[^"]*c1s88gxp[^"]*a1wqrctr[^"]*"[^>]*>([\s\S]*?)<\/div>/g
    const containers = Array.from(html.matchAll(containerRegex))

    if (containers.length === 0) {
      return [
        {
          page_url: url,
          image_url: "",
          alt_text: "",
          reason: "No curated gallery components found on this page",
          status: "no curated gallery",
          scraped_html: "",
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
          cloudflare_blocked: false,
        },
      ]
    }

    let containerMatch
    while ((containerMatch = containerRegex.exec(html)) !== null) {
      const containerDiv = containerMatch[0]
      const containerContent = containerMatch[1]

      const hasWorkingGallery = /pub__shoppable-image[^"]*--visible-dots/.test(containerContent)

      if (hasWorkingGallery) {
        brokenItems.push({
          page_url: url,
          image_url: containerDiv.substring(0, 500),
          alt_text: "Curated gallery with visible dots",
          reason: "Shoppable gallery is working properly",
          status: "working",
          scraped_html: html,
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
          cloudflare_blocked: false,
        })
      } else {
        const hasShoppableImage = /pub__shoppable-image/.test(containerContent)

        if (!hasShoppableImage) {
          brokenItems.push({
            page_url: url,
            image_url: containerDiv.substring(0, 500),
            alt_text: "Broken curated gallery",
            reason: "Container has image but missing pub__shoppable-image component",
            status: "broken",
            scraped_html: html,
            puppeteer_used: puppeteerUsed,
            debug_info: debugInfo,
            cloudflare_blocked: false,
          })
        } else if (!hasWorkingGallery) {
          brokenItems.push({
            page_url: url,
            image_url: containerDiv.substring(0, 500),
            alt_text: "Gallery without visible dots",
            reason: "Shoppable gallery missing --visible-dots class",
            status: "broken",
            scraped_html: html,
            puppeteer_used: puppeteerUsed,
            debug_info: debugInfo,
            cloudflare_blocked: false,
          })
        }
      }
    }

    return brokenItems
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return [
      {
        page_url: url,
        image_url: "N/A",
        alt_text: "",
        reason: `Scan failed: ${errorMessage}`,
        status: "broken",
        scraped_html: "",
        puppeteer_used: false,
        debug_info: `Fatal error: ${errorMessage}`,
        cloudflare_blocked: false,
      },
    ]
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { urls } = (await request.json()) as { urls: string[] }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "No URLs provided" } as any, { status: 400 })
    }

    const allItems: BrokenGallery[] = []
    let totalScanned = 0

    for (const url of urls) {
      try {
        const items = await detectBrokenGalleries(url)
        allItems.push(...items)
        totalScanned++
      } catch (error) {
        console.error(`Error scanning ${url}:`, error)
        totalScanned++
      }
    }

    const urlStatusMap = new Map<string, BrokenGallery>()

    for (const item of allItems) {
      if (!urlStatusMap.has(item.page_url)) {
        urlStatusMap.set(item.page_url, item)
      } else {
        const existing = urlStatusMap.get(item.page_url)!
        if (item.status === "broken") {
          existing.status = "broken"
          existing.cloudflare_blocked = item.cloudflare_blocked || existing.cloudflare_blocked
          existing.debug_info = item.debug_info
        } else if (item.status === "no curated gallery" && existing.status === "working") {
          existing.status = "no curated gallery"
        }
      }
    }

    const uniqueItems = Array.from(urlStatusMap.values())
    const brokenCount = uniqueItems.filter((item) => item.status === "broken").length
    const workingCount = uniqueItems.filter((item) => item.status === "working").length
    const noCuratedGalleryCount = uniqueItems.filter((item) => item.status === "no curated gallery").length
    const cloudflareBlockedCount = uniqueItems.filter((item) => item.cloudflare_blocked).length

    const result: ScanResult = {
      total_pages: totalScanned,
      broken_count: brokenCount,
      working_count: workingCount,
      no_gallery_count: noCuratedGalleryCount,
      cloudflare_blocked_count: cloudflareBlockedCount,
      items: uniqueItems,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" } as any, { status: 500 })
  }
}
