// jsdom lays nothing out, so it cannot scroll, and it logs a warning each
// time the router's scroll restoration asks it to. Scrolling is covered by
// the browser tests; here the request is simply accepted.
window.scrollTo = () => undefined;
