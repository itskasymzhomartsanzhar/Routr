const seen = new Set()

const toAbsoluteUrl = (url) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  try {
    return new URL(url, window.location.origin).toString()
  } catch {
    return null
  }
}

const preloadOne = (url) =>
  new Promise((resolve) => {
    const absolute = toAbsoluteUrl(url)
    if (!absolute || seen.has(absolute)) {
      resolve(false)
      return
    }
    seen.add(absolute)
    const img = new Image()
    img.decoding = 'async'
    img.loading = 'eager'
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = absolute
  })

export const preloadProductImagesInBackground = (products) => {
  const urls = (Array.isArray(products) ? products : [])
    .map((product) => product?.image)
    .filter(Boolean)

  if (!urls.length) return

  const run = async () => {
    const queue = [...new Set(urls)]
    const concurrency = 4
    let cursor = 0
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        const index = cursor
        cursor += 1
        await preloadOne(queue[index])
      }
    })
    await Promise.all(workers)
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      run()
    }, { timeout: 2000 })
    return
  }
  setTimeout(() => {
    run()
  }, 0)
}

