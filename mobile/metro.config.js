// Shares the web app's pure rule modules (../src, listed in shared.json) in place.
// Files under ../src may import only relative paths and the npm packages in
// shared.json, and those packages always resolve from mobile/node_modules.
// tsconfig.json `paths` and the jest moduleNameMapper in package.json do the
// same for tsc and jest, so neither needs the web's root node_modules (CI
// installs only mobile/). ../tests/mobile-shared-purity.test.ts checks the
// shared files and the entries list.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const shared = require('./shared.json');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, shared.root);
const appModules = path.join(projectRoot, 'node_modules');
const allowed = new Set([...shared.npm, '@babel/runtime']); // babel-preset-expo injects @babel/runtime helpers

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
  if (fromShared && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    const pkg = moduleName.startsWith('@') ? moduleName.split('/').slice(0, 2).join('/') : moduleName.split('/')[0];
    if (!allowed.has(pkg)) {
      throw new Error(
        `[shared] ${path.relative(sharedRoot, context.originModulePath)} imports "${moduleName}"; shared files may import only relative paths and ${[...allowed].join(', ')}`,
      );
    }
    // Resolve from mobile/node_modules, never the web's root node_modules (absent on EAS; React 19.0.0 vs 19.3.0).
    return context.resolveRequest({ ...context, disableHierarchicalLookup: true, nodeModulesPaths: [appModules] }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
