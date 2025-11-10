"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Zap, CheckCircle2, AlertCircle, Download } from "lucide-react"
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
  status: "pending" | "processing" | "completed"
  steps: string[]
  result?: any
}

export default function Home() {
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [results, setResults] = useState<ScanResult | null>(null)
  const [liveResults, setLiveResults] = useState<URLScanStatus[]>([]) // add live results state for streaming
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    setIsScanning(true)
    setScanProgress(0)
    setResults(null)
    setLiveResults(urls.map((url) => ({ url, status: "pending", steps: [] }))) // initialize live results

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      })

      if (!response.ok) throw new Error("Scan failed")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")

        // Keep the incomplete line in the buffer
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))

              // Update live results with new URL status
              setLiveResults((prev) =>
                prev.map((item) =>
                  item.url === data.url
                    ? { ...item, status: data.status, steps: data.steps, result: data.result }
                    : item,
                ),
              )

              setScanProgress(
                Math.round((urls.filter((u, i) => liveResults[i]?.status === "completed").length / urls.length) * 100),
              )
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Final aggregation
      const allItems: any[] = []
      for (const item of liveResults) {
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
        total_pages: urls.length,
        broken_count: brokenCount,
        working_count: workingCount,
        no_gallery_count: noCuratedGalleryCount,
        cloudflare_blocked_count: cloudflareBlockedCount,
        items: uniqueItems,
      })
      setScanProgress(100)
    } catch (error) {
      console.error("Scan error:", error)
      alert("Failed to complete scan. Please try again.")
    } finally {
      setIsScanning(false)
    }
  }

  const handleURLSubmit = async (urls: string[]) => {
    await startScan(urls)
  }

  const exportToCSV = () => {
    if (!results?.items) return

    const csv = [
      ["Page URL", "Image URL", "Alt Text", "Reason"],
      ...results.items.map((item) => [item.page_url, item.image_url, item.alt_text, item.reason]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "broken_curated_galleries.csv"
    a.click()
    window.URL.revokeObjectURL(url)
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
          {!isScanning && !results ? (
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
          {isScanning ? (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Scanning in Progress</CardTitle>
                <CardDescription>Processing URLs sequentially...</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Overall Progress</span>
                    <span className="text-sm text-muted-foreground">{Math.round(scanProgress)}%</span>
                  </div>
                  <Progress value={scanProgress} className="h-2" />
                </div>

                <div className="space-y-3 mt-6">
                  {liveResults.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {item.status === "completed" && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                          {item.status === "processing" && (
                            <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                          )}
                          {item.status === "pending" && (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-mono text-foreground break-all mb-2">{item.url}</p>
                          <div className="space-y-1">
                            {item.steps.map((step, sidx) => (
                              <p key={sidx} className="text-xs text-muted-foreground">
                                ✓ {step}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Results Section */}
          {results ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-lg bg-white dark:bg-slate-950">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-muted-foreground text-sm mb-2">Total Pages Scanned</p>
                      <p className="text-3xl font-bold text-foreground">{results.total_pages}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-red-50 dark:bg-red-950/20">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-600" />
                      <p className="text-muted-foreground text-sm mb-2">Broken Galleries</p>
                      <p className="text-3xl font-bold text-red-600">{results.broken_count}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-green-50 dark:bg-green-950/20">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-600" />
                      <p className="text-muted-foreground text-sm mb-2">Working Galleries</p>
                      <p className="text-3xl font-bold text-green-600">{results.working_count}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-orange-50 dark:bg-orange-950/20">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                      <p className="text-muted-foreground text-sm mb-2">No Curated Gallery</p>
                      <p className="text-3xl font-bold text-orange-600">{results.no_gallery_count}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-pink-50 dark:bg-pink-950/20">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-pink-600" />
                      <p className="text-muted-foreground text-sm mb-2">Cloudflare Blocked</p>
                      <p className="text-3xl font-bold text-pink-600">{results.cloudflare_blocked_count}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Results Table */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Broken Galleries</CardTitle>
                    <CardDescription>
                      {results.items.length} broken curated gallery {results.items.length === 1 ? "image" : "images"}{" "}
                      found
                    </CardDescription>
                  </div>
                  {results.items.length > 0 && (
                    <Button onClick={exportToCSV} variant="outline" size="sm" className="gap-2 bg-transparent">
                      <Download className="w-4 h-4" />
                      Export CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <Results items={results.items} />
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => {
                    setResults(null)
                    setScanProgress(0)
                  }}
                  variant="outline"
                  size="lg"
                >
                  Scan Again
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
