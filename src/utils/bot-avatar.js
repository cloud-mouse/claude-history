/**
 * Shared bot-avatar helpers (used by the management page + bind picker).
 *
 * The avatar visual is a colored gradient tile with the bot name's first
 * grapheme as the label. Gradient is selected deterministically by bot id so
 * the same bot always looks the same across the UI.
 */

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0a84ff, #0040dd)',
  'linear-gradient(135deg, #30d158, #1a9e3e)',
  'linear-gradient(135deg, #bf5af2, #8944ab)',
  'linear-gradient(135deg, #ff9f0a, #c66e00)',
  'linear-gradient(135deg, #ff375f, #b81f44)',
  'linear-gradient(135deg, #5ac8fa, #0a84ff)'
];

/**
 * CSS background value for a bot avatar.
 * @param {number} id
 * @returns {string}
 */
export function avatarGradient(id) {
  const idx = (Number(id) - 1) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] || AVATAR_GRADIENTS[0];
}

/**
 * First grapheme of a bot name (handles CJK + latin), uppercased.
 * @param {string} name
 * @returns {string}
 */
export function avatarChar(name) {
  if (!name) return '?';
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : '?';
}
