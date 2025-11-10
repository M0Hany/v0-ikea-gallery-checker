"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface URLInputProps {
  onSubmit: (urls: string[]) => void
}

export function URLInput({ onSubmit }: URLInputProps) {
  const [urls, setUrls] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = () => {
    setError("")
    const parsedUrls = urls
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0)

    if (parsedUrls.length === 0) {
      setError("Please enter at least one URL")
      return
    }

    const invalidUrl = parsedUrls.find((url) => !url.startsWith("http://") && !url.startsWith("https://"))
    if (invalidUrl) {
      setError(`Invalid URL: ${invalidUrl}`)
      return
    }

    onSubmit(parsedUrls)
  }

  return (
    <div className="space-y-4 pt-6">
      <div>
        <label className="block text-sm font-medium mb-2">Enter IKEA URLs (one per line)</label>
        <Textarea
          placeholder="https://www.ikea.com/sa/en/bedroom/&#10;https://www.ikea.com/sa/en/kitchen/"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={6}
          className="font-mono text-sm"
        />
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>
      <Button onClick={handleSubmit} size="lg" className="w-full">
        Start Scan
      </Button>
    </div>
  )
}
