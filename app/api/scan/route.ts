// ... existing imports ...
import { type NextRequest, NextResponse } from "next/server"
import type { BrokenGallery } from "./types" // Assuming BrokenGallery is defined in a types file
import { detectCloudflareBlocking } from "@/lib/utils" // Fix import path for detectCloudflareBlocking from relative to absolute

// ... existing helper functions ...

async function detectBrokenGalleriesWithSteps(url: string, onStep: (step: string) => void): Promise<BrokenGallery[]> {
  try {
    let html: string
    let puppeteerUsed = false
    const debugInfo = ""
    let cloudflareBlocked = false

    onStep("Initializing...")

    try {
      const puppeteer = await import("puppeteer")
      onStep("Puppeteer loaded")

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
      }

      const browser = await puppeteer.default.launch(launchOptions)
      onStep("Browser launched")

      const page = await browser.newPage()

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
        onStep("Page loaded")
      } catch (navError) {
        cloudflareBlocked = true
      }

      try {
        await page.waitForSelector('[class*="c1s88gxp"]', { timeout: 5000 })
        onStep("Gallery elements detected")
      } catch {
        onStep("Waiting for dynamic content...")
      }

      onStep("Waiting for content to render...")
      await new Promise((resolve) => setTimeout(resolve, 1000))

      html = await page.content()
      onStep("Capturing DOM...")
      puppeteerUsed = true

      await browser.close()
      onStep("Extracting galleries...")

      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        html = bodyMatch[1]
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        html = html.replace(/\s+(on\w+|data-[a-z-]*)\s*=\s*"[^"]*"/gi, "")
      }
    } catch (puppeteerError) {
      onStep("Puppeteer failed, using fetch...")

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
          onStep("Cloudflare blocking detected")
          return [
            {
              page_url: url,
              image_url: "N/A",
              alt_text: "",
              reason: "Cloudflare is blocking requests",
              status: "broken",
              scraped_html: "",
              puppeteer_used: false,
              debug_info: "Cloudflare blocking detected",
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
              debug_info: `Fetch status: ${response.status}`,
              cloudflare_blocked: false,
            },
          ]
        }

        html = await response.text()
        onStep("Content fetched")
      } catch (fetchError) {
        clearTimeout(timeoutId)
        throw fetchError
      }
    }

    const brokenItems: BrokenGallery[] = []
    onStep("Analyzing galleries...")

    const containerRegex = /<div[^>]*class="[^"]*c1s88gxp[^"]*a1wqrctr[^"]*"[^>]*>([\s\S]*?)<\/div>/g
    const containers = Array.from(html.matchAll(containerRegex))

    if (containers.length === 0) {
      onStep("No curated galleries found")
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

    onStep(`Found ${containers.length} gallery container(s)`)

    let containerMatch
    while ((containerMatch = containerRegex.exec(html)) !== null) {
      const containerDiv = containerMatch[0]
      const containerContent = containerMatch[1]

      if (/<video[^>]*>/i.test(containerContent)) {
        continue
      }

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

    onStep("Analysis complete")
    return brokenItems
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    onStep(`Error: ${errorMessage}`)
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

// ... existing detectCloudflareBlocking function ...

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { urls } = (await request.json()) as { urls: string[] }

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "No URLs provided" } as any, { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        for (const url of urls) {
          const steps: string[] = []
          let finalStatus: "pending" | "processing" | "completed" = "processing"
          let finalResult: any = { items: [] }

          const onStep = (step: string) => {
            steps.push(step)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  url,
                  status: "processing",
                  steps,
                  currentStep: step,
                })}\n`,
              ),
            )
          }

          try {
            const items = await detectBrokenGalleriesWithSteps(url, onStep)

            let urlStatus: "working" | "broken" | "no curated gallery" = "working"
            let hasAnyBroken = false
            let hasAnyWorking = false
            let hasNoGallery = false

            for (const item of items) {
              if (item.status === "broken") {
                hasAnyBroken = true
              } else if (item.status === "working") {
                hasAnyWorking = true
              } else if (item.status === "no curated gallery") {
                hasNoGallery = true
              }
            }

            if (hasAnyBroken) {
              urlStatus = "broken"
            } else if (hasNoGallery && !hasAnyWorking) {
              urlStatus = "no curated gallery"
            } else if (hasAnyWorking) {
              urlStatus = "working"
            }

            finalStatus = "completed"
            finalResult = { items }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  url,
                  status: urlStatus,
                  steps,
                  currentStep: "Complete",
                  result: finalResult,
                })}\n`,
              ),
            )
          } catch (error) {
            console.error(`Error scanning ${url}:`, error)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  url,
                  status: "broken",
                  steps: [...steps, "Failed"],
                  currentStep: "Failed",
                  result: { items: [] },
                })}\n`,
              ),
            )
          }
        }
        controller.close()
      },
    })

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("API error:", error)
    return NextResponse.json({ error: "Internal server error" } as any, { status: 500 })
  }
}
