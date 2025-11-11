"use client"
import { useState } from "react"
import React from "react"

import { AlertCircle, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react"

interface URLScanStatus {
  url: string
  status: "pending" | "processing" | "completed"
  steps: string[]
  result?: any
}

interface ResultsProps {
  items: URLScanStatus[]
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

  const getStatusIcon = (status: string) => {
    if (status === "broken") {
      return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
    } else if (status === "no curated gallery") {
      return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
    } else if (status === "working") {
      return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
    } else {
      return <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent" />
    }
  }

  const getStatusText = (status: string) => {
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

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <th className="px-4 py-3 text-left font-semibold text-foreground w-8"></th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">URL</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
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
                      {getStatusIcon(item.status)}
                      {getStatusText(item.status)}
                    </div>
                  </td>
                </tr>
                {expandedUrls.has(item.url) && (
                  <tr
                    key={`${idx}-expanded`}
                    className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
                  >
                    <td colSpan={3} className="px-4 py-4">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
