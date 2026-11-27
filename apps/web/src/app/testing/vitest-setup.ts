// jsdom lays nothing out, so it cannot scroll, and it logs a warning each
// time the router's scroll restoration asks it to. Scrolling is covered by
// the browser tests; here the request is simply accepted.
window.scrollTo = () => undefined;

// jsdom has no screen to measure either. The layout only listens for the
// screen growing wide, which never happens here.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;
