let lockCount = 0
let savedPaddingRight = ''
let savedOverflow = ''

const getScrollbarWidth = () => {
  if (typeof window === 'undefined') return 0
  return window.innerWidth - document.documentElement.clientWidth
}

export const lockBodyScroll = () => {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    savedPaddingRight = document.body.style.paddingRight
    savedOverflow = document.body.style.overflow
    const scrollbarWidth = getScrollbarWidth()
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

export const unlockBodyScroll = () => {
  if (typeof document === 'undefined') return
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow
    document.body.style.paddingRight = savedPaddingRight
  }
}
