/**
 * Update Identity tool — section-level edits on self-model and preferences.
 *
 * Identity files are markdown with H2 sections. This tool can:
 * - List sections in a file
 * - Replace a section's content (between its H2 and the next H2 or EOF)
 * - Append a new section at the end
 *
 * IDENTITY.md is immutable — only self-model.md and preferences.md are editable.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Files that can be edited via this tool. IDENTITY.md is explicitly excluded. */
const EDITABLE_FILES: Record<string, string> = {
  'self-model': 'self-model.md',
  'preferences': 'preferences.md',
};

export interface IdentitySection {
  header: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Parse a markdown file into H2 sections.
 * Content before the first H2 is captured as a preamble (header: '').
 */
export function parseSections(text: string): IdentitySection[] {
  const lines = text.split('\n');
  const sections: IdentitySection[] = [];
  let currentHeader = '';
  let currentLines: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      // Close previous section
      sections.push({
        header: currentHeader,
        content: currentLines.join('\n').trim(),
        startLine,
        endLine: i - 1,
      });
      currentHeader = line.replace(/^## /, '').trim();
      currentLines = [];
      startLine = i;
    } else {
      currentLines.push(line);
    }
  }

  // Close final section
  sections.push({
    header: currentHeader,
    content: currentLines.join('\n').trim(),
    startLine,
    endLine: lines.length - 1,
  });

  return sections;
}

/**
 * Rebuild a markdown file from sections.
 */
export function rebuildMarkdown(sections: IdentitySection[]): string {
  const parts: string[] = [];

  for (const section of sections) {
    if (section.header === '') {
      // Preamble — just the content
      if (section.content) {
        parts.push(section.content);
      }
    } else {
      parts.push(`## ${section.header}\n${section.content}`);
    }
  }

  return parts.join('\n\n') + '\n';
}

export type UpdateMode = 'replace' | 'append';

export interface UpdateIdentityInput {
  file: string;
  section?: string;
  content?: string;
  mode?: UpdateMode;
}

/**
 * List sections in an identity file.
 */
export async function listSections(contextDir: string, file: string): Promise<string> {
  const filename = EDITABLE_FILES[file];
  if (!filename) {
    return `Unknown file "${file}". Editable files: ${Object.keys(EDITABLE_FILES).join(', ')}`;
  }

  const filepath = join(contextDir, filename);
  let text: string;
  try {
    text = await readFile(filepath, 'utf-8');
  } catch {
    return `File not found: ${filename}. It will be created when you add a section.`;
  }

  const sections = parseSections(text);
  const named = sections.filter(s => s.header !== '');
  if (named.length === 0) {
    return `${filename} has no H2 sections.`;
  }

  const list = named.map(s => `- **${s.header}** (${s.content.split('\n').length} lines)`).join('\n');
  return `Sections in ${filename}:\n${list}`;
}

/**
 * Update or append a section in an identity file.
 */
export async function updateIdentity(
  contextDir: string,
  input: UpdateIdentityInput,
): Promise<string> {
  const { file, section, content, mode = 'replace' } = input;

  // Validate file
  const filename = EDITABLE_FILES[file];
  if (!filename) {
    return `Unknown file "${file}". Editable files: ${Object.keys(EDITABLE_FILES).join(', ')}`;
  }

  // List mode — no section or content means "show me what's there"
  if (!section && !content) {
    return listSections(contextDir, file);
  }

  if (!section) {
    return 'Section name is required when providing content.';
  }

  if (!content) {
    return 'Content is required when specifying a section.';
  }

  const filepath = join(contextDir, filename);
  let text: string;
  try {
    text = await readFile(filepath, 'utf-8');
  } catch {
    // File doesn't exist — create it with the new section
    const newContent = `## ${section}\n${content}\n`;
    await writeFile(filepath, newContent, 'utf-8');
    return `Created ${filename} with section "${section}".`;
  }

  const sections = parseSections(text);
  const existing = sections.find(
    s => s.header.toLowerCase() === section.toLowerCase()
  );

  if (mode === 'append') {
    if (existing) {
      return `Section "${section}" already exists in ${filename}. Use mode "replace" to update it.`;
    }
    sections.push({
      header: section,
      content,
      startLine: 0,
      endLine: 0,
    });
    await writeFile(filepath, rebuildMarkdown(sections), 'utf-8');
    return `Appended new section "${section}" to ${filename}.`;
  }

  // Replace mode
  if (!existing) {
    return `Section "${section}" not found in ${filename}. Available sections: ${sections.filter(s => s.header !== '').map(s => s.header).join(', ')}. Use mode "append" to add a new section.`;
  }

  existing.content = content;
  await writeFile(filepath, rebuildMarkdown(sections), 'utf-8');
  return `Updated section "${section}" in ${filename}.`;
}
