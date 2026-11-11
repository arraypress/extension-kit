/**
 * Windows around a page, drawn as HTML: Chrome's (the macOS tab strip and toolbar) and a plain
 * macOS window's title bar, light or dark, sharing the traffic lights, the colours and the
 * shadow. Chrome's is shared by the store screenshots (`build/store-frame`, which lays it on a
 * 1280×800 canvas in Playwright) and by extension pages, which draw either on a canvas around a
 * capture through {@link windowChromeSvg} or {@link macWindowSvg} (an SVG image with the HTML
 * inside, which Chrome draws without tainting the canvas). The markup is XML-clean so both can
 * use it.
 *
 * Window metrics follow Chrome's 2023 refresh on macOS (tabs 34px high in a 42px strip, a 46px
 * toolbar with a pill omnibox) and AppKit's titled window (a 28px title bar, 12px traffic lights
 * 8px apart, corners of 10px).
 *
 * @module frame/window
 */
/** The tab strip's and the toolbar's heights (px): the content starts below both. */
export declare const WINDOW_BARS: Readonly<{
    strip: 42;
    toolbar: 46;
}>;
/** A plain macOS window's title bar height (px): the content starts below it. */
export declare const MAC_TITLE_BAR = 28;
/** A macOS window's corner radius (px), Chrome's window's too (Big Sur to Sequoia). */
export declare const WINDOW_RADIUS = 10;
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
export type WindowShadow = {
    /**
     * How far down it falls.
     */
    y: number;
    /**
     * Its blur.
     */
    blur: number;
    /**
     * Its colour.
     */
    color: string;
};
/**
 * Chrome's light and dark window colours, a macOS title bar's (`titleBar`), the canvas behind,
 * and the window's shadow (`windowShadow` for a canvas's `shadow*`, `shadow` for CSS).
 */
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
        titleBar: string;
        windowShadow: WindowShadow;
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
        titleBar: string;
        windowShadow: WindowShadow;
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
/**
 * A plain macOS window's title bar, as HTML: the traffic lights at the left, the title centred
 * between them and the right edge's matching room, a hairline below.
 *
 * @param {object} options - What to draw.
 * @param {string} options.title - The window's title.
 * @param {Theme} [options.theme] - Default light.
 * @param {number} [options.w] - The window's width. Default {@link WINDOW_W}.
 * @returns {string} The HTML, with its own styles.
 */
declare function macTitleBar({ title, theme, w }: {
    title: string;
    theme?: Theme;
    w?: number;
}): string;
/**
 * A plain macOS window's title bar as a standalone SVG image, `w` wide and {@link MAC_TITLE_BAR}
 * high (scale it when drawing), for an extension page to draw on a canvas as
 * {@link windowChromeSvg}'s bars are drawn. The window's corners ({@link WINDOW_RADIUS}) and its
 * shadow (`THEMES[theme].windowShadow`) are the canvas's to draw.
 *
 * @param {Parameters<typeof macTitleBar>[0]} options - As {@link macTitleBar}.
 * @returns {string} The SVG markup.
 * @example
 * const svg = macWindowSvg({ title: 'Example', theme: 'dark', w: 1280 });
 */
export declare function macWindowSvg(options: Parameters<typeof macTitleBar>[0]): string;
export {};
