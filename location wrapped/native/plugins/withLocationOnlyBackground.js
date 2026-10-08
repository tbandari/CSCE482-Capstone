const { withInfoPlist } = require('expo/config-plugins');
// This app registers a location task only, never a background-fetch task.
// expo-task-manager adds fetch generically; keep only our required modes.
module.exports = config => withInfoPlist(config, config => {
 config.modResults.UIBackgroundModes = (config.modResults.UIBackgroundModes || []).filter(mode => mode !== 'fetch');
 return config;
});
