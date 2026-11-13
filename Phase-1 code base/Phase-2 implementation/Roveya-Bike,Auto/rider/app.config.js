// The Google Maps key comes from the EAS environment so it never sits in the repo.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: { ...(config.android && config.android.config), googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY || "" } },
  },
});
