"use client"
import { useState } from "react"
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react"

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

interface ResultsProps {
  items: BrokenGallery[]
}

export function Results({ items }: ResultsProps) {
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

  const uniqueUrlItems = Array.from(new Map(items.map((item) => [item.page_url, item])).values())

  const getStatusIcon = (status: string) => {
    if (status === "broken") {
      return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
    } else if (status === "no curated gallery") {
      return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
    } else {
      return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
    }
  }

  const getStatusText = (status: string) => {
    if (status === "broken") {
      return <span className="text-xs font-semibold text-red-600 dark:text-red-400">BROKEN</span>
    } else if (status === "no curated gallery") {
      return <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">NO GALLERY</span>
    } else {
      return <span className="text-xs font-semibold text-green-600 dark:text-green-400">WORKING</span>
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <th className="px-4 py-3 text-left font-semibold text-foreground">URL</th>
              <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {uniqueUrlItems.map((item, idx) => (
              <tr
                key={idx}
                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                onClick={() => toggleExpanded(item.page_url)}
              >
                <td className="px-4 py-3">
                  <a
                    href={item.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.page_url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 w-fit">
                    {getStatusIcon(item.status)}
                    {getStatusText(item.status)}
                    {item.cloudflare_blocked && (
                      <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1 rounded ml-2">
                        CF Blocked
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Array.from(expandedUrls).map((expandedUrl) => {
        const item = items.find((i) => i.page_url === expandedUrl)
        if (!item) return null

        return (
          <div
            key={expandedUrl}
            className="space-y-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">URL: {expandedUrl}</p>
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono">{item.debug_info}</p>
                </div>
                <div className="space-y-2 mb-4 text-xs">
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase">Image URL</p>
                    <a
                      href={item.image_url.startsWith("http") ? item.image_url : "#"}
                      target={item.image_url.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className={`${item.image_url.startsWith("http") ? "text-blue-600 dark:text-blue-400 hover:underline" : "text-slate-500"} break-all`}
                    >
                      {item.image_url}
                    </a>
                  </div>
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase">Alt Text</p>
                    <p className="text-foreground">{item.alt_text || "(No alt text)"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase">Reason</p>
                    <p className="text-red-600 dark:text-red-400 font-medium">{item.reason}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-900 rounded border border-slate-700 overflow-x-auto">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words font-mono">
                {item.scraped_html || "(No HTML captured)"}
              </pre>
            </div>
          </div>
        )
      })}
    </div>
  )
}
