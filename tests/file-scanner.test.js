'use strict';

const fs = require('fs');
const path = require('path');
const { scanProjects, scanConversations } = require('../electron/file-scanner');

describe('file-scanner', () => {
  const tempBase = path.join(__dirname, 'test-scanner-dir');

  beforeEach(() => {
    // Clean up before each test to ensure isolation
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (fs.existsSync(tempBase)) {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  function getProjectsDir() {
    return path.join(tempBase, '.claude', 'projects');
  }

  function createTestFile(filePath, content = '') {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
  }

  function setFileTime(filePath, mtimeMs) {
    const now = new Date(mtimeMs);
    fs.utimesSync(filePath, now, now);
  }

  describe('scanConversations', () => {
    test('returns empty array for empty directory', async () => {
      const projectsDir = getProjectsDir();
      const projectPath = path.join(projectsDir, 'empty-project');
      createTestFile(path.join(projectPath, '.gitkeep'));

      const conversations = await scanConversations(projectPath);
      expect(conversations).toEqual([]);
    });

    test('finds .jsonl files and returns their metadata', async () => {
      const projectsDir = getProjectsDir();
      const projectPath = path.join(projectsDir, 'jsonl-project');
      const filePath = path.join(projectPath, 'conversation.jsonl');
      const content = JSON.stringify({ messages: [] });
      createTestFile(filePath, content);
      setFileTime(filePath, 1000000);

      const conversations = await scanConversations(projectPath);
      expect(conversations.length).toBe(1);
      expect(conversations[0].filePath).toBe(filePath);
      expect(conversations[0].fileSize).toBe(content.length);
      expect(conversations[0].updatedAt).toBe(1000000);
    });

    test('ignores non-.jsonl files', async () => {
      const projectsDir = getProjectsDir();
      const projectPath = path.join(projectsDir, 'mixed-project');
      createTestFile(path.join(projectPath, 'readme.md'), '# Project');
      createTestFile(path.join(projectPath, 'data.json'), '{}');
      createTestFile(path.join(projectPath, 'conversation.jsonl'), 'test');

      const conversations = await scanConversations(projectPath);
      expect(conversations.length).toBe(1);
      expect(conversations[0].filePath).toContain('conversation.jsonl');
    });

    test('finds multiple .jsonl files', async () => {
      const projectsDir = getProjectsDir();
      const projectPath = path.join(projectsDir, 'multi-project');
      createTestFile(path.join(projectPath, 'conv1.jsonl'), 'a');
      createTestFile(path.join(projectPath, 'conv2.jsonl'), 'bb');
      createTestFile(path.join(projectPath, 'conv3.jsonl'), 'ccc');

      const conversations = await scanConversations(projectPath);
      expect(conversations.length).toBe(3);
    });

    test('returns empty array for non-existent directory', async () => {
      const conversations = await scanConversations('/non/existent/path');
      expect(conversations).toEqual([]);
    });
  });

  describe('scanProjects', () => {
    test('returns empty array for empty projects directory', async () => {
      const projectsDir = getProjectsDir();
      // Create empty projects dir with only a .gitkeep
      createTestFile(path.join(projectsDir, '.gitkeep'), '');

      const projects = await scanProjects(projectsDir);
      expect(projects).toEqual([]);
    });

    test('finds project directories and their conversations', async () => {
      const projectsDir = getProjectsDir();

      const project1Path = path.join(projectsDir, 'project-one');
      const conv1Path = path.join(project1Path, 'chat.jsonl');
      createTestFile(conv1Path, 'content1');
      setFileTime(conv1Path, 2000000);

      const project2Path = path.join(projectsDir, 'project-two');
      const conv2Path = path.join(project2Path, 'session.jsonl');
      createTestFile(conv2Path, 'content2');
      setFileTime(conv2Path, 3000000);

      const projects = await scanProjects(projectsDir);
      expect(projects.length).toBe(2);

      // Check structure of returned projects
      for (const proj of projects) {
        expect(proj).toHaveProperty('name');
        expect(proj).toHaveProperty('path');
        expect(proj).toHaveProperty('conversations');
        expect(Array.isArray(proj.conversations)).toBe(true);
      }

      // Verify project names
      const names = projects.map((p) => p.name);
      expect(names).toContain('project-one');
      expect(names).toContain('project-two');

      // Verify conversations are associated correctly
      const proj1 = projects.find((p) => p.name === 'project-one');
      expect(proj1.conversations.length).toBe(1);
      expect(proj1.conversations[0].filePath).toBe(conv1Path);

      const proj2 = projects.find((p) => p.name === 'project-two');
      expect(proj2.conversations.length).toBe(1);
      expect(proj2.conversations[0].filePath).toBe(conv2Path);
    });

    test('ignores files in projects directory (only looks at subdirectories)', async () => {
      const projectsDir = getProjectsDir();
      // Create a file directly in projects dir (not in a subdirectory)
      createTestFile(path.join(projectsDir, 'not-a-project.jsonl'), 'data');

      const projects = await scanProjects(projectsDir);
      expect(projects.length).toBe(0);
    });

    test('handles nested subdirectories (files only, no recursion into sub-subdirs)', async () => {
      const projectsDir = getProjectsDir();
      const projectPath = path.join(projectsDir, 'nested-test');
      createTestFile(path.join(projectPath, 'root-conversation.jsonl'), 'root');
      createTestFile(path.join(projectPath, 'subdir', 'nested-conversation.jsonl'), 'nested');

      const conversations = await scanConversations(projectPath);
      // Only files directly in project directory are returned
      expect(conversations.length).toBe(1);
      expect(conversations[0].filePath).toContain('root-conversation.jsonl');
    });

    test('returns empty array for non-existent projects directory', async () => {
      const projects = await scanProjects('/non/existent/projects/dir');
      expect(projects).toEqual([]);
    });
  });
});
