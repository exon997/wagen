// Metro konfiguracija za pnpm monorepo.
// Bez ovoga bundler ne vidi pakete izvan apps/mobile (@wagen/domain, @wagen/supabase).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Prati promjene u cijelom workspaceu, ne samo u apps/mobile
config.watchFolders = [workspaceRoot];

// 2. Trazi module i u root node_modules (hoisted linker vecinu smjesta tamo)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
