import { openAppHttpLink } from './app-http-link-open'

let listening = false

/** Opens plugin `links.open` requests through the same routing as a link the user clicks. */
export function ensurePluginOpenLinksHandled(): void {
  // Why guarded: the store also loads in non-DOM test and SSR contexts.
  const plugins = typeof window === 'undefined' ? undefined : window.api?.plugins
  if (listening || !plugins?.onOpenLink) {
    return
  }
  listening = true
  plugins.onOpenLink(({ url, external, alternate }) =>
    openAppHttpLink(url, { external, alternate })
  )
}
