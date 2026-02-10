/**
 * Filesystem abstraction for testing with memfs
 */

export interface FileSystem {
  readFileSync(path: string, encoding: string): string;
  writeFileSync(path: string, data: string, options?: { mode?: number }): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

/**
 * Default Node.js filesystem implementation
 */
export class NodeFileSystem implements FileSystem {
  readFileSync(path: string, encoding: string): string {
    const fs = require("node:fs");
    return fs.readFileSync(path, encoding);
  }

  writeFileSync(path: string, data: string, options?: { mode?: number }): void {
    const fs = require("node:fs");
    return fs.writeFileSync(path, data, options);
  }

  existsSync(path: string): boolean {
    const fs = require("node:fs");
    return fs.existsSync(path);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const fs = require("node:fs");
    return fs.mkdirSync(path, options);
  }
}

/**
 * Global filesystem instance (can be swapped for testing)
 */
let fsInstance: FileSystem = new NodeFileSystem();

export function setFileSystem(fs: FileSystem): void {
  fsInstance = fs;
}

export function getFileSystem(): FileSystem {
  return fsInstance;
}

export function resetFileSystem(): void {
  fsInstance = new NodeFileSystem();
}
