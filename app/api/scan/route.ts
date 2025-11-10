import { type NextRequest, NextResponse } from "next/server"
import { AbortSignal } from "abort-controller"

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

      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      debugInfo += " | Browser launched"

      const page = await browser.newPage()

      // Wait for network idle and specific IKEA elements to load
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })
      debugInfo += " | Page loaded"

      // Wait for IKEA gallery elements to be rendered
      await page
        .waitForFunction(
          () =>
            document.querySelectorAll('[class*="pub__shoppable-image"]').length > 0 ||
            document.querySelectorAll("img").length > 0,
          { timeout: 5000 },
        )
        .catch(() => {
          debugInfo += " | Gallery elements timeout (not critical)"
        })

      // Extra wait for any dynamic content
      await page.waitForTimeout(2000)

      html = await page.content()
      puppeteerUsed = true
      debugInfo += " | Final DOM captured"

      await browser.close()
    } catch (puppeteerError) {
      debugInfo += ` | Puppeteer failed: ${puppeteerError instanceof Error ? puppeteerError.message : "Unknown error"}`

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(15000),
      })

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
    }

    const brokenItems: BrokenGallery[] = []

    // Pattern 1: Look for the specific IKEA curated gallery pattern
    // Check for shoppable-image divs with empty product data
    const shoppableImageRegex = /<div[^>]*class="[^"]*pub__shoppable-image[^"]*"[^>]*>[\s\S]*?<\/div>/g
    let match

    while ((match = shoppableImageRegex.exec(html)) !== null) {
      const galleryDiv = match[0]
      const hasProductImages = /data-product-id|pub__product-image/.test(galleryDiv)
      const hasImageSrc = /src="(?!.*\?f=[^"]*)"/.test(galleryDiv)

      // If shoppable-image div exists but has no product images, it's broken
      if (!hasProductImages || !hasImageSrc) {
        brokenItems.push({
          page_url: url,
          image_url: galleryDiv.substring(0, 500),
          alt_text: "Empty shoppable gallery",
          reason: "Shoppable gallery component has no product images",
          status: "broken",
          scraped_html: html.substring(0, 50000), // Full DOM after JavaScript execution
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
        })
      }
    }

    // Pattern 2: Check for valid image tags in galleries
    const imageRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g
    while ((match = imageRegex.exec(html)) !== null) {
      const imageUrl = match[1]
      const altText = match[2]

      if (
        imageUrl.includes("broken") ||
        imageUrl.includes("null") ||
        imageUrl.includes("undefined") ||
        imageUrl.includes("error") ||
        !imageUrl.startsWith("http")
      ) {
        brokenItems.push({
          page_url: url,
          image_url: imageUrl,
          alt_text: altText,
          reason: "Invalid or broken image URL",
          status: "broken",
          scraped_html: html.substring(0, 50000),
          puppeteer_used: puppeteerUsed,
          debug_info: debugInfo,
        })
      }
    }

    if (brokenItems.length === 0) {
      return [
        {
          page_url: url,
          image_url: "",
          alt_text: "",
          reason: "Page scanned successfully",
          status: "working",
          scraped_html: html.substring(0, 50000),
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
