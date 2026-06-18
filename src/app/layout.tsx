import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

// Suite brand fonts: Playfair Display for the display/wordmark, Hanken Grotesk
// for body. Exposed as CSS variables and wired into Tailwind's theme in globals.css.
const display = Playfair_Display({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['700', '800'],
})
const body = Hanken_Grotesk({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'SundayMarket — byttehandel for hele gruppa',
  description: 'Et sanntids handelsspill for ungdoms- og menighetsgrupper. Ingen vinner alene.',
}

export const viewport: Viewport = {
  themeColor: '#0D1B2A',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no" className={`${display.variable} ${body.variable}`}>
      <body className="bg-[#0D1B2A] text-[#F0EEE9] min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
