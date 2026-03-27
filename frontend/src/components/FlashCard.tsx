import { useState } from 'react'
import Md from './Md'

interface Props {
  front: string
  back: string
  index: number
  total: number
  flipped?: boolean
  onFlip?: () => void
}

export default function FlashCard({ front, back, index, total, flipped: flippedProp, onFlip }: Props) {
  const [flippedInternal, setFlippedInternal] = useState(false)

  const isControlled = flippedProp !== undefined
  const flipped = isControlled ? flippedProp : flippedInternal

  function handleClick() {
    if (isControlled) {
      onFlip?.()
    } else {
      setFlippedInternal((f) => !f)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-gray-400">{index + 1} / {total}</p>
      <div
        className="w-full cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={handleClick}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '160px',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center p-6 text-center font-medium text-base overflow-y-auto max-h-60"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <Md className="prose prose-sm prose-invert max-w-none [&_p]:my-0 [&_.katex]:text-white">{front}</Md>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl bg-white border border-indigo-100 shadow-inner text-gray-800 flex items-center justify-center p-6 text-center overflow-y-auto max-h-60"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <Md className="prose prose-sm max-w-none [&_p]:my-0">{back}</Md>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400">{flipped ? 'Answer' : 'Tap to reveal answer'}</p>
    </div>
  )
}
