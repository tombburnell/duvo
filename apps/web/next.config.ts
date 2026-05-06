import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function findEnvDir(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (existsSync(join(currentDir, ".env"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

loadEnvConfig(findEnvDir(process.cwd()));

const nextConfig: NextConfig = {};

export default nextConfig;
