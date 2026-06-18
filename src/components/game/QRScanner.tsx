'use client'
import { useEffect } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'

interface Props {
  onScan:  (result: string) => void
  onClose: () => void
}

export default function QRScanner({ onScan, onClose }: Props) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 220, height: 220 } },
      false
    )
    scanner.render(
      (decodedText) => { scanner.clear().catch(() => {}); onScan(decodedText) },
      () => {}
    )
    return () => { scanner.clear().catch(() => {}) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="rounded-xl overflow-hidden border border-[#243D57]">
      <div id="qr-reader" />
      <button
        onClick={onClose}
        className="w-full py-2 text-[#8A9BB0] text-sm border-t border-[#243D57] bg-[#1A2D42]"
      >
        Avbryt
      </button>
    </div>
  )
}
