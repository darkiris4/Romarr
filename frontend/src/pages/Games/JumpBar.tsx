import { memo } from 'react'

const ALL_LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))]

interface Props {
  available: Set<string>
  onJump: (letter: string) => void
}

export default memo(function JumpBar({ available, onJump }: Props) {
  return (
    <div className="jump-bar">
      {ALL_LETTERS.map((letter) => (
        <button
          key={letter}
          className={`jump-bar-btn${available.has(letter) ? '' : ' dim'}`}
          onClick={() => available.has(letter) && onJump(letter)}
          tabIndex={-1}
          aria-label={`Jump to ${letter}`}
        >
          {letter}
        </button>
      ))}
    </div>
  )
})
