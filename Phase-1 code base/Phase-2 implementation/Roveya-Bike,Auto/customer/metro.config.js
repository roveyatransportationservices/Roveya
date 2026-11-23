const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { resolve } = require("metro-resolver");

const projectRoot = __dirname;
const usersApp = path.resolve(projectRoot, "../../../users-app");
const customerModules = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [usersApp];
config.resolver.blockList = [new RegExp(`${usersApp.replace(/[/\\\\]/g, "[\\\\/]")}[\\\\/]node_modules[\\\\/].*`)];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || "";
  const fromUsersSource = origin.startsWith(usersApp) && !origin.includes(`${path.sep}node_modules${path.sep}`);
  if (!fromUsersSource || moduleName.startsWith(".") || path.isAbsolute(moduleName)) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return resolve(
    {
      ...context,
      resolveRequest: resolve,
      disableHierarchicalLookup: true,
      nodeModulesPaths: [customerModules],
    },
    moduleName,
    platform,
  );
};

module.exports = config;
