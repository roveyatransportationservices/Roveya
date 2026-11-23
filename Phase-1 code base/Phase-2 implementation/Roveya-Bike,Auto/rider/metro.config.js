const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { resolve } = require("metro-resolver");

const projectRoot = __dirname;
const carApp = path.resolve(projectRoot, "../../../car-captains");
const customerApp = path.resolve(projectRoot, "../customer");
const usersApp = path.resolve(projectRoot, "../../../users-app");
const captainModules = path.resolve(projectRoot, "node_modules");
const outsideModules = (folder) => new RegExp(`${folder.replace(/[/\\\\]/g, "[\\\\/]")}[\\\\/]node_modules[\\\\/].*`);

const config = getDefaultConfig(projectRoot);
config.watchFolders = [carApp, customerApp, usersApp];
config.resolver.blockList = [outsideModules(carApp), outsideModules(customerApp), outsideModules(usersApp)];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || "";
  const outside = [carApp, customerApp, usersApp].some((folder) => origin.startsWith(folder));
  const fromOutsideSource = outside && !origin.includes(`${path.sep}node_modules${path.sep}`);
  if (!fromOutsideSource || moduleName.startsWith(".") || path.isAbsolute(moduleName)) {
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
