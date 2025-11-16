"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Zap, Download } from 'lucide-react'
import { URLInput } from "@/components/url-input"
import { Results } from "@/components/results"
import { Progress } from "@/components/ui/progress"

interface BrokenGallery {
  page_url: string
  image_url: string
  alt_text: string
  reason: string
}

interface ScanResult {
  total_pages: number
  broken_count: number
  working_count: number
  no_gallery_count: number
  cloudflare_blocked_count: number
  items: any[]
}

interface URLScanStatus {
  url: string
  status: "pending" | "processing" | "completed" | "error"
  steps: string[]
  result?: any
  error?: string
  startTime?: number // Add tracking for elapsed time
  elapsedTime?: number // Store elapsed time in seconds
}

const calculateProgress = (liveResults: URLScanStatus[]): number => {
  if (liveResults.length === 0) return 0
  const completed = liveResults.filter((item) => item.status !== "pending" && item.status !== "processing").length
  return Math.round((completed / liveResults.length) * 100)
}

export default function Home() {
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [results, setResults] = useState<ScanResult | null>(null)
  const [liveResults, setLiveResults] = useState<URLScanStatus[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null) // Store abort controller for halt
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null) // Store timer interval

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const urls = parseCSV(text)
    await startScan(urls)
  }

  const parseCSV = (text: string): string[] => {
    const lines = text.split("\n")
    const urls: string[] = []

    lines.forEach((line, index) => {
      // Skip header row if it contains 'url'
      if (index === 0 && line.toLowerCase().includes("url")) return

      const url = line.trim()
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        urls.push(url)
      }
    })

    return urls
  }

  const startScan = async (urls: string[]) => {
    const existingUrls = new Set(liveResults.map((item) => item.url))
    const urlsToScan = urls.filter((url) => !existingUrls.has(url))

    if (urlsToScan.length === 0) {
      setScanError("All URLs have already been scanned")
      return
    }

    setIsScanning(true)
    setScanError(null)

    const newResults = [...liveResults, ...urlsToScan.map((url) => ({ url, status: "pending" as const, steps: [], startTime: 0 }))]
    setLiveResults(newResults)

    const controller = new AbortController()
    abortControllerRef.current = controller // Store controller for halt button

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: urlsToScan }),
        signal: controller.signal,
      })

      if (!response.ok) {
        setScanError(`Server error: ${response.statusText}`)
        setIsScanning(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      timerIntervalRef.current = setInterval(() => {
        setLiveResults((prev) =>
          prev.map((item) => {
            if (item.status === "processing" && item.startTime) {
              return { ...item, elapsedTime: Math.floor((Date.now() - item.startTime) / 1000) }
            }
            return item
          })
        )
      }, 1000)

      while (reader) {
        try {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.trim().startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6))

                setLiveResults((prev) => {
                  const updated = prev.map((item) => {
                    if (item.url === data.url) {
                      const startTime = item.startTime || (data.status === "processing" ? Date.now() : 0)
                      const elapsedTime =
                        data.status !== "processing" && startTime
                          ? Math.floor((Date.now() - startTime) / 1000)
                          : item.elapsedTime || 0

                      return {
                        ...item,
                        status: data.status,
                        steps: data.steps,
                        result: data.result,
                        error: data.error,
                        startTime,
                        elapsedTime,
                      }
                    }
                    return item
                  })
                  const progress = calculateProgress(updated)
                  setScanProgress(progress)
                  return updated
                })
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name !== "AbortError") {
            setScanError("Connection interrupted. Your progress has been saved. Download and try remaining URLs.")
          }
          break
        }
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }

      const allItems: any[] = []
      for (const item of newResults) {
        if (item.result?.items) {
          allItems.push(...item.result.items)
        }
      }

      const urlStatusMap = new Map<string, any>()
      for (const item of allItems) {
        if (!urlStatusMap.has(item.page_url)) {
          urlStatusMap.set(item.page_url, item)
        } else {
          const existing = urlStatusMap.get(item.page_url)!
          if (item.status === "broken") {
            existing.status = "broken"
            existing.cloudflare_blocked = item.cloudflare_blocked || existing.cloudflare_blocked
          }
        }
      }

      const uniqueItems = Array.from(urlStatusMap.values())
      const brokenCount = uniqueItems.filter((item) => item.status === "broken").length
      const workingCount = uniqueItems.filter((item) => item.status === "working").length
      const noCuratedGalleryCount = uniqueItems.filter((item) => item.status === "no curated gallery").length
      const cloudflareBlockedCount = uniqueItems.filter((item) => item.cloudflare_blocked).length

      setResults({
        total_pages: newResults.length,
        broken_count: brokenCount,
        working_count: workingCount,
        no_gallery_count: noCuratedGalleryCount,
        cloudflare_blocked_count: cloudflareBlockedCount,
        items: uniqueItems,
      })
      setScanProgress(100)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setScanError("Scan halted by user. Download your progress and continue with remaining URLs.")
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Network error occurred. Partial results are saved."
        setScanError(errorMessage)
      }
    } finally {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      abortControllerRef.current = null
      setIsScanning(false)
    }
  }

  const handleURLSubmit = async (urls: string[]) => {
    await startScan(urls)
  }

  const exportToCSV = () => {
    if (!liveResults || liveResults.length === 0) return

    const csv = [
      ["URL", "Status"],
      ...liveResults.map((item) => {
        let statusText = item.status
        if (item.status === "broken") statusText = "BROKEN"
        else if (item.status === "working") statusText = "WORKING"
        else if (item.status === "no curated gallery") statusText = "NO GALLERY"
        else if (item.status === "processing") statusText = "PROCESSING"
        else statusText = "PENDING"

        return [item.url, statusText]
      }),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "ikea_gallery_checker_results.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleScanAgain = () => {
    setResults(null)
    setScanProgress(0)
    setScanError(null)
    setLiveResults([])
  }

  const getPendingURLs = () => {
    return liveResults.filter((item) => item.status === "pending").map((item) => item.url)
  }

  const handleResumeScan = async () => {
    const pendingURLs = getPendingURLs()
    if (pendingURLs.length > 0) {
      await startScan(pendingURLs)
    }
  }

  const handleHaltProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setScanError("Scan halted by user. Download your progress and continue with remaining URLs.")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-50 dark:to-slate-950">
      <div className="container mx-auto py-12 px-4">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">IKEA Gallery Checker</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Detect and analyze broken curated gallery components on IKEA category pages.
          </p>
        </div>

        <div className="grid gap-8">
          {/* Input Section */}
          {!isScanning && !results && liveResults.length === 0 ? (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Upload IKEA URLs</CardTitle>
                <CardDescription>
                  Provide a CSV file with IKEA URLs or enter them manually to scan for broken galleries.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="manual" className="w-full">
                  <TabsList className="grid w-full max-w-xs grid-cols-2">
                    <TabsTrigger value="manual">Manual Input</TabsTrigger>
                    <TabsTrigger value="upload">File Upload</TabsTrigger>
                  </TabsList>

                  <TabsContent value="manual">
                    <URLInput onSubmit={handleURLSubmit} />
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-4 pt-6">
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                      <p className="font-medium text-foreground mb-1">Drop your CSV file here</p>
                      <p className="text-sm text-muted-foreground">or click to select</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        aria-label="Upload CSV file"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}

          {/* Scanning State */}
          {isScanning || liveResults.length > 0 ? (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>{isScanning ? "Scanning in Progress" : "Scan Results"}</CardTitle>
                <CardDescription>
                  {isScanning ? "Processing URLs sequentially..." : `${liveResults.length} total URLs processed`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scanError && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg">
                    <p className="font-medium">Error during scan:</p>
                    <p className="text-sm">{scanError}</p>
                  </div>
                )}
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">{Math.round(scanProgress)}%</span>
                  </div>
                  <Progress value={scanProgress} className="h-2" />
                </div>

                <Results items={liveResults} isLive={isScanning} />
              </CardContent>
            </Card>
          ) : null}

          {/* Action Buttons */}
          {liveResults.length > 0 ? (
            <div className="flex gap-3 justify-center flex-wrap">
              {isScanning && (
                <Button onClick={handleHaltProcessing} variant="destructive" size="lg">
                  Halt Processing
                </Button>
              )}
              {!isScanning && getPendingURLs().length > 0 && (
                <Button onClick={handleResumeScan} variant="default" size="lg">
                  Resume Scan ({getPendingURLs().length} remaining)
                </Button>
              )}
              <Button onClick={handleScanAgain} variant="outline" size="lg">
                Scan Again
              </Button>
              <Button onClick={exportToCSV} variant="outline" size="lg" className="gap-2 bg-transparent">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
