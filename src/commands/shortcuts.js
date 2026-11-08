/**
 * The keyboard shortcuts an options page lists: only the ones that are set,
 * in the extension's own order (Chrome's `commands.getAll()` order is the
 * manifest's object order, which isn't the menu's). Users set and change them
 * on chrome://extensions/shortcuts, which the page links to.
 *
 * @module commands/shortcuts
 */

/**
 * @typedef {object} ShortcutEntry
 * @property {string} id The command's name in the manifest.
 * @property {string} title What the page calls it.
 */

/**
 * The shortcuts that are set, in `entries`' order.
 *
 * @param {readonly ShortcutEntry[]} entries - The commands to list, in order.
 * @param {readonly {name?: string, shortcut?: string}[]} commands - `chrome.commands.getAll()`.
 * @returns {(ShortcutEntry & {shortcut: string})[]} Each entry with its shortcut; unset ones left out.
 * @example
 * setShortcuts([{ id: 'reset', title: 'Reset' }], await chrome.commands.getAll());
 * // [{ id: 'reset', title: 'Reset', shortcut: '⌥⇧0' }]
 */
export function setShortcuts(entries, commands) {
  return entries.flatMap((entry) => {
    const shortcut = commands.find((command) => command.name === entry.id)?.shortcut;
    return shortcut ? [{ ...entry, shortcut }] : [];
  });
}
