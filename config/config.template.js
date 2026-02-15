let config = {
  address: "0.0.0.0",
  port: 8080,
  basePath: "/",
  ipWhitelist: [],
  useHttps: false,
  language: "en",
  timeFormat: 24,
  units: "metric",
  modules: [
    { module: "alert" },

    {
      module: "MMM-Cursor",
      config: {
        timeout: 1500
      }
    },

    { module: "clock", position: "top_left" },
    {
      module: 'MMM-CalDAV-Tasks',
      disabled: false,
      position: "top_bar",
      config: {
        webDavAuth: {
          url: 'https://nc.<your-nextcloud-server>/remote.php/dav/',
          username: "<username>",
          password: "<password>>",
        },
        // includeCalendars: ['Alex', 'Heiko', 'Merle'],
        updateInterval: 60000,
        hideCompletedTasksAfter: 0,
        sortMethod: "created",
        colorize: true,
        displayStartDate: false,
        showCompletionPercent: true,
        startsInDays: 30,
        dateFormat: "DD.MM.YYYY HH:mm",
      }
    },

  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
