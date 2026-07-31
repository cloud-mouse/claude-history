'use strict';

const { parseStream } = require('./jsonl-parser');
const { parseMessage } = require('./message-parser');
const {
  parseCodexRecord,
  parseCodexSessionMeta,
} = require('./codex-parser');
const {
  normalizeSource,
  assertConversationFilePath,
} = require('./conversation-source');

/**
 * Validate, stream, and normalize one conversation transcript.
 * @param {string} filePath
 * @param {'claude'|'codex'} [source]
 * @param {{env?: Object, homeDir?: string}} [options]
 * @returns {Promise<{source:'claude'|'codex', messages:Object[], projectDir:string|null}>}
 */
async function loadConversationFile(filePath, source, options = {}) {
  const normalizedSource = normalizeSource(source);
  const validatedPath = assertConversationFilePath(
    filePath,
    normalizedSource,
    options
  );
  const messages = [];
  let projectDir = null;
  let codexMetadataSeen = false;

  await parseStream(validatedPath, (raw) => {
    if (normalizedSource === 'codex') {
      if (!codexMetadataSeen) {
        const metadata = parseCodexSessionMeta(raw);
        if (metadata) {
          codexMetadataSeen = true;
          projectDir = metadata.projectDir;
        }
      }
      messages.push(...parseCodexRecord(raw));
      return;
    }

    if (!projectDir && raw.type === 'user' && raw.cwd) {
      projectDir = raw.cwd;
    }
    messages.push(parseMessage(raw));
  });

  return { source: normalizedSource, messages, projectDir };
}

module.exports = { loadConversationFile };
