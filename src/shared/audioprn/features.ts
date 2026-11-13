// audioprn: switches for upstream Lemmy features the site doesn't use (yet).

/**
 * Communities: lists, links, selectors and pages. When off, the site has one
 * community (`main`), shown as the Content page.
 */
export const SHOW_COMMUNITIES = true;

/** Multi-communities (feeds combining several communities) stay hidden. */
export const SHOW_MULTI_COMMUNITIES = false;

/** The only community while SHOW_COMMUNITIES is off. */
export const MAIN_COMMUNITY_NAME = "main";
