import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function detectCloudflareBlocking(status: number, headers: Headers, html: string): boolean {
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
