/**
 * Chrome's window around a page: the macOS tab strip and toolbar (light or dark, the default
 * theme), drawn as HTML. Shared by the store screenshots (`build/store-frame`, which lays it on a
 * 1280×800 canvas in Playwright) and by extension pages, which draw it on a canvas around a
 * capture through {@link windowChromeSvg} (an SVG image with the HTML inside, which Chrome draws
 * without tainting the canvas). The markup is XML-clean so both can use it.
 *
 * Window metrics follow Chrome's 2023 refresh on macOS (tabs 34px high in a 42px strip, a 46px
 * toolbar with a pill omnibox).
 *
 * @module frame/window
 */
/** The tab strip's and the toolbar's heights (px): the content starts below both. */
export declare const WINDOW_BARS: Readonly<{
    strip: 42;
    toolbar: 46;
}>;
/** The window's default width (px): the store screenshot's. */
export declare const WINDOW_W = 1152;
/**
 * A letter favicon for made-up sites (no real brands).
 *
 * @param {string} letter - The letter.
 * @param {string} bg - Background colour.
 * @param {string} [fg] - Letter colour. Default white.
 * @returns {string} A data: URL of the SVG.
 */
export declare const letterIcon: (letter: string, bg: string, fg?: string) => string;
/** Chrome's light and dark window colours, and the canvas behind. */
export declare const THEMES: {
    light: {
        bg: string;
        caption: string;
        sub: string;
        frame: string;
        tabText: string;
        tabTextInactive: string;
        tabSep: string;
        activeTab: string;
        toolbar: string;
        toolbarIcon: string;
        omnibox: string;
        url: string;
        urlDim: string;
        contentLine: string;
        shadow: string;
    };
    dark: {
        bg: string;
        caption: string;
        sub: string;
        frame: string;
        tabText: string;
        tabTextInactive: string;
        tabSep: string;
        activeTab: string;
        toolbar: string;
        toolbarIcon: string;
        omnibox: string;
        url: string;
        urlDim: string;
        contentLine: string;
        shadow: string;
    };
};
export type Theme = keyof typeof THEMES;
export type Tab = {
    /**
     * Its title.
     */
    title: string;
    /**
     * Its favicon's URL.
     */
    icon: string;
    /**
     * The selected tab.
     */
    active?: boolean;
    /**
     * Playing sound.
     */
    audible?: boolean;
    /**
     * Muted.
     */
    muted?: boolean;
};
/**
 * The window's tab strip and toolbar, as HTML. Positions are window-relative.
 *
 * @param {object} options - What to draw.
 * @param {readonly Tab[]} options.tabs - The tabs, left to right.
 * @param {string} options.url - The address bar's text.
 * @param {string} [options.urlHost] - The start of `url` to show in full; the rest is dimmed.
 * @param {Theme} [options.theme] - Default light.
 * @param {number} [options.w] - The window's width. Default {@link WINDOW_W}.
 * @param {readonly string[]} [options.ext] - Toolbar extension icons' URLs.
 * @returns {string} The HTML, with its own styles.
 */
export declare function windowChrome({ tabs, url, urlHost, theme, w, ext }: {
    tabs: readonly Tab[];
    url: string;
    urlHost?: string;
    theme?: Theme;
    w?: number;
    ext?: readonly string[];
}): string;
/**
 * The window's tab strip and toolbar as a standalone SVG image, `w` wide and the bars' height
 * high (scale it when drawing), for an extension page to draw on a canvas: `new Image()` with a
 * `data:image/svg+xml` URL of it, then `drawImage`. Images in it (the tabs' icons, `ext`) must be
 * `data:` URLs: an SVG image loads nothing else.
 *
 * @param {Parameters<typeof windowChrome>[0]} options - As {@link windowChrome}.
 * @returns {string} The SVG markup.
 * @example
 * const svg = windowChromeSvg({ tabs: [{ title: 'Example', icon: letterIcon('E', '#1a73e8'), active: true }], url: 'example.com', w: 1280 });
 */
export declare function windowChromeSvg(options: Parameters<typeof windowChrome>[0]): string;
