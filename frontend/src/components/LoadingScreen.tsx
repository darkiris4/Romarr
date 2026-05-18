import { useMemo } from 'react'

const QUIPS = [
  'Blowing on the cartridge…',
  'Downloading more RAM…',
  'Inserting coins…',
  'Please do not turn off the power…',
  'Rewinding the tape…',
  'Warming up the BIOS…',
  'Verifying No-Intro checksums…',
  'Searching for a memory card…',
  'Adjusting the tracking…',
  'Consulting the strategy guide…',
  'Defragmenting the floppy disk…',
  'Calibrating the CRT monitor…',
  'Connecting to the Game Link Cable…',
  'Sharpening pixels…',
  'Generating dungeon…',
  'Dusting off the cartridge slot…',
  'Loading sprites…',
  'Scanning ROM library…',
  'Locating your save file…',
  'Counting your coins…',
]

export default function LoadingScreen() {
  const quip = useMemo(() => QUIPS[Math.floor(Math.random() * QUIPS.length)], [])

  return (
    <div className="loading-page" style={{ flexDirection: 'column', gap: 14 }}>
      <div className="pixel-spinner" />
      <span style={{ color: 'var(--text-muted)', fontSize: 18, fontStyle: 'italic' }}>{quip}</span>
    </div>
  )
}
