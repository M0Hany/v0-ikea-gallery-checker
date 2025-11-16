"use client"

import React from "react"
import { useState } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react' // Declare these variables before using them

type ResultsProps = {
  items: {
    url: string
    status: string
    steps: string[]
    result?: {
      scraped_html?: string
    }
    elapsedTime?: number
  }[]
  isLive?: boolean
}

export function Results({ items, isLive = false }: ResultsProps) {
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(new Set())

  const toggleExpanded = (url: string) => {
    const newExpanded = new Set(expandedUrls)
    if (newExpanded.has(url)) {
      newExpanded.delete(url)
    } else {
      newExpanded.add(url)
    }
    setExpandedUrls(newExpanded)
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-2">No results found!</p>
        <p className="text-sm text-muted-foreground">Please scan URLs to see results.</p>
      </div>
    )
  }

  const getStatusIcon = (status: string, isProcessing = false) => {
    if (isProcessing) {
      return (
        <div className="relative w-4 h-4">
          <div className="absolute inset-0 rounded-full border-2 border-blue-200 dark:border-blue-900"></div>
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-600 dark:border-t-blue-400 animate-spin"
            style={{ animationDuration: "0.8s" }}
          ></div>
        </div>
      )
    }

    if (status === "broken") {
      return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
    } else if (status === "no curated gallery") {
      return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
    } else if (status === "working") {
      return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
    } else {
      return <div className="w-4 h-4 rounded-full border-2 border-slate-400 dark:border-slate-600" />
    }
  }

  const getStatusText = (status: string, elapsedTime?: number) => {
    if (status === "broken") {
      return <span className="text-xs font-semibold text-red-600 dark:text-red-400">BROKEN</span>
    } else if (status === "no curated gallery") {
      return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">NO GALLERY</span>
    } else if (status === "working") {
      return <span className="text-xs font-semibold text-green-600 dark:text-green-400">WORKING</span>
    } else if (status === "processing") {
      return <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">PROCESSING</span>
    } else {
      return <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">PENDING</span>
    }
  }

  const getCurrentStep = (steps: string[]) => {
    return steps.length > 0 ? steps[steps.length - 1] : "Waiting..."
  }

  const getProgressPercentage = (steps: string[]) => {
    const TOTAL_STEPS = 13 // Based on typical step count
    return Math.min(Math.round((steps.length / TOTAL_STEPS) * 100), 99)
  }

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <th className="px-4 py-3 text-left font-semibold text-foreground w-8"></th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">URL</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Time</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const isProcessing = item.status === "processing"
              const progressPercent = isLive && isProcessing ? getProgressPercentage(item.steps) : 0

              return (
                <React.Fragment key={idx}>
                  <tr className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer">
                    <td className="px-4 py-3" onClick={() => toggleExpanded(item.url)}>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transform transition-transform ${
                          expandedUrls.has(item.url) ? "rotate-180" : ""
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3" onClick={() => toggleExpanded(item.url)}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 w-fit">
                        {getStatusIcon(item.status, isProcessing)}
                        <div className="flex flex-col">
                          {getStatusText(item.status, item.elapsedTime)}
                          {isProcessing && progressPercent > 0 && (
                            <span className="text-xs text-muted-foreground">{progressPercent}%</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.elapsedTime !== undefined ? formatElapsedTime(item.elapsedTime) : "-"}
                    </td>
                  </tr>
                  {expandedUrls.has(item.url) && (
                    <tr key={`${idx}-expanded`} className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <td colSpan={4} className="px-4 py-4">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Current Step</p>
                            <p className="text-sm text-foreground">{getCurrentStep(item.steps)}</p>
                          </div>
                          {item.steps.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Step History</p>
                              <div className="space-y-1">
                                {item.steps.map((step, sidx) => (
                                  <p key={sidx} className="text-xs text-muted-foreground">
                                    {step}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.result?.scraped_html && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Scraped HTML</p>
                              <div className="p-3 bg-slate-900 rounded border border-slate-700 overflow-x-auto">
                                <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                                  {item.result.scraped_html || "(No HTML captured)"}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
