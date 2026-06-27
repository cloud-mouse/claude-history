import { resolveProjectDir } from './project-path.js';

/**
 * Extract the agent session ID (JSONL filename without extension) from a file path.
 * @param {string} [filePath]
 * @returns {string|null}
 */
export function agentSessionIdFromPath(filePath) {
  if (!filePath) return null;
  const fileName = filePath.split('/').pop();
  return fileName ? fileName.replace(/\.jsonl$/, '') : null;
}

/**
 * Build the `claude --resume` shell command for a conversation.
 *
 * Uses `resolveProjectDir` so the command `cd`s into the real working directory
 * (the cwd recorded in the JSONL), not the encoded projects-folder name.
 *
 * @param {{ filePath?: string, projectDir?: string|null }} [conv]
 * @returns {string} e.g. `cd "/Users/x/proj" && claude --resume <sessionId>`
 */
export function buildResumeCommand(conv) {
  if (!conv?.filePath) return '';
  const sessionId = agentSessionIdFromPath(conv.filePath);
  const projectDir = resolveProjectDir(conv);
  return `cd "${projectDir}" && claude --resume ${sessionId}`;
}
