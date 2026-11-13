const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { resolve } = require("metro-resolver");

const projectRoot = __dirname;
const carApp = path.resolve(projectRoot, "../../../car-captains");
const captainModules = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [carApp];
config.resolver.blockList = [new RegExp(`${carApp.replace(/[/\\\\]/g, "[\\\\/]")}[\\\\/]node_modules[\\\\/].*`)];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || "";
  const fromCarSource = origin.startsWith(carApp) && !origin.includes(`${path.sep}node_modules${path.sep}`);
  if (!fromCarSource || moduleName.startsWith(".") || path.isAbsolute(moduleName)) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return resolve(
    {
      ...context,
      resolveRequest: resolve,
      disableHierarchicalLookup: true,
      nodeModulesPaths: [captainModules],
    },
    moduleName,
    platform,
  );
};

module.exports = config;
