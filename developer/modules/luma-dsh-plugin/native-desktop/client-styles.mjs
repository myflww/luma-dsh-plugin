const styles = new Map()
export function registerStyle(key, css) {
  styles.set(key, css)
}

/** Restore the original host document when the user leaves this panel. */
export function mountDesktopStyles() {
  const tags = []
  for (const [key, css] of styles) {
    const tag = document.createElement('style')
    tag.dataset.lumaDesktopStyle = key
    tag.textContent = css
    document.head.append(tag)
    tags.push(tag)
  }
  return () => { for (const tag of tags) tag.remove() }
}
