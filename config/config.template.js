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
    { module: "clock", position: "top_left" },
    {
      module: "MMM-HomeConnect2",
      header: "Home Connect Appliances",
      position: "top_right",
      config: {
        clientId: "YOUR_CLIENT_ID",
        showDeviceIcon: true,
        updateFrequency: 60 * 60 * 1000 // 1 hour
      }
    },
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
