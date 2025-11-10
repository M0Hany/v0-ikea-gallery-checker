import { type NextRequest, NextResponse } from "next/server"
import { AbortController } from "node-abort-controller"

interface BrokenGallery {
  page_url: string
  image_url: string
  alt_text: string
  reason: string
  status: "broken" | "working"
  scraped_html: string
  puppeteer_used: boolean
  debug_info: string
}

interface ScanResult {
  total_pages: number
  broken_count: number
  working_count: number
  items: BrokenGallery[]
}

async function detectBrokenGalleries(url: string): Promise<BrokenGallery[]> {
  try {
    let html: string
    let puppeteerUsed = false
    let debugInfo = ""

    try {
      const puppeteer = await import("puppeteer")
      debugInfo = "Puppeteer imported successfully"

      const launchOptions: any = {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      }

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
        debugInfo += " | Using system Chromium"
      }

      const browser = await puppeteer.default.launch(launchOptions)
      debugInfo += " | Browser launched"

      const page = await browser.newPage()

      // Wait for network idle and specific IKEA elements to load
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 }) // Increased timeout to 60 seconds and changed waitUntil strategy
      debugInfo += " | Page loaded"

      // Wait for gallery elements or fallback after timeout
      try {
        await page.waitForSelector('[class*="c1s88gxp"], [class*="pub__shoppable-image"], .product-item', {
          timeout: 15000,
        })
        debugInfo += " | Gallery elements found"
      } catch {
        debugInfo += " | Gallery selectors not found, continuing anyway"
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))

      html = await page.content()
      puppeteerUsed = true
      debugInfo += " | Final DOM captured"

      await browser.close()

      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        html = bodyMatch[1]
        // Remove script and style tags
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        // Remove inline event handlers and data attributes we don't need
        html = html.replace(/\s+(on\w+|data-[a-z-]*)\s*=\s*"[^"]*"/gi, "")
      }
    } catch (puppeteerError) {
      debugInfo += ` | Puppeteer failed: ${puppeteerError instanceof Error ? puppeteerError.message : "Unknown error"}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

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

    // Pattern 1: Look for the container div with class c1s88gxp a1wqrctr
    const containerRegex = /<div[^>]*class="[^"]*c1s88gxp[^"]*a1wqrctr[^"]*"[^>]*>([\s\S]*?)<\/div>/g
    let containerMatch

    while ((containerMatch = containerRegex.exec(html)) !== null) {
      const containerDiv = containerMatch[0]
      const containerContent = containerMatch[1]

      // Check if inside the container there's a pub__shoppable-image with --visible-dots (WORKING)
      const hasWorkingGallery = /pub__shoppable-image[^"]*--visible-dots/.test(containerContent)

      if (hasWorkingGallery) {
        // Gallery is working - has the visible-dots indicator
        brokenItems.push({
          page_url: url,
          image_url: containerDiv.substring(0, 500),
          alt_text: "Curated gallery with visible dots",
          reason: "Shoppable gallery is working properly",
          status: "working",
          scraped_html: html,
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
        })
      } else {
        // Check if it just has img tag without shoppable-image (BROKEN)
        const hasShoppableImage = /pub__shoppable-image/.test(containerContent)

        if (!hasShoppableImage) {
          // Only has img tag, not a proper shoppable gallery (BROKEN)
          brokenItems.push({
            page_url: url,
            image_url: containerDiv.substring(0, 500),
            alt_text: "Broken curated gallery",
            reason: "Container has image but missing pub__shoppable-image component",
            status: "broken",
            scraped_html: html,
            puppeteer_used: puppeteerUsed,
            debug_info: debugInfo,
          })
        } else if (!hasWorkingGallery) {
          // Has shoppable-image but missing --visible-dots (BROKEN)
          brokenItems.push({
            page_url: url,
            image_url: containerDiv.substring(0, 500),
            alt_text: "Gallery without visible dots",
            reason: "Shoppable gallery missing --visible-dots class",
            status: "broken",
            scraped_html: html,
            puppeteer_used: puppeteerUsed,
            debug_info: debugInfo,
          })
        }
      }
    }

    if (brokenItems.length === 0) {
      return [
        {
          page_url: url,
          image_url: "",
          alt_text: "",
          reason: "No curated galleries found on page",
          status: "working",
          scraped_html: html,
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
        },
      ]
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
    let workingPages = 0

    for (const url of urls) {
      try {
        const items = await detectBrokenGalleries(url)

        const brokenCount = items.filter((item) => item.status === "broken").length
        if (brokenCount === 0) {
          workingPages++
        }

        allItems.push(...items)
        totalScanned++
      } catch (error) {
        console.error(`Error scanning ${url}:`, error)
        totalScanned++
      }
    }

    const brokenItems = allItems.filter((item) => item.status === "broken")

    const result: ScanResult = {
      total_pages: totalScanned,
      broken_count: brokenItems.length,
      working_count: workingPages,
      items: allItems, // Return all items including working status
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" } as any, { status: 500 })
  }
}
