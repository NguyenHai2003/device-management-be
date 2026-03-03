const si = require("systeminformation");
const os = require("os");
const LIGHT_METRICS_CACHE_TTL_MS = Number(
  process.env.SYSTEM_METRICS_LIGHT_CACHE_TTL_MS || 1000,
);
const HEAVY_METRICS_CACHE_TTL_MS = Number(
  process.env.SYSTEM_METRICS_HEAVY_CACHE_TTL_MS || 30000,
);

/**
 * Service to retrieve system metrics
 */
class SystemService {
  constructor() {
    this.lightMetricsCache = null;
    this.lightMetricsCollectedAt = 0;
    this.lightCollectPromise = null;

    this.heavyMetricsCache = null;
    this.heavyMetricsCollectedAt = 0;
    this.heavyCollectPromise = null;

    this.defaultHeavyMetrics = {
      monitors: 0,
      osInfo: null,
      macAddress: null,
      macAddresses: [],
      networkUsage: {
        rx_bytes: 0,
        tx_bytes: 0,
        rx_sec: 0,
        tx_sec: 0,
      },
      diskUsage: [],
    };
  }

  isFresh(collectedAt, ttlMs) {
    return collectedAt > 0 && Date.now() - collectedAt < ttlMs;
  }

  async collectLightMetrics() {
    try {
      const cpuLoad = await si.currentLoad();
      const totalRam = os.totalmem();
      const freeRam = os.freemem();
      const usedRam = totalRam - freeRam;

      return {
        ram: {
          total: totalRam,
          used: usedRam,
          available: freeRam,
          free: freeRam,
        },
        cpuUsage: {
          currentLoad: cpuLoad.currentLoad,
          user: cpuLoad.currentLoadUser,
          system: cpuLoad.currentLoadSystem,
        },
        uptime: os.uptime(),
        loadAverage: {
          avg1: cpuLoad.avgLoad,
          currentLoad: cpuLoad.currentLoad,
        },
      };
    } catch (error) {
      console.error("Error fetching light system metrics:", error);
      throw new Error("Failed to retrieve light metrics");
    }
  }

  async collectHeavyMetrics() {
    try {
      const [graphics, osInfo, network, fsSize, networkInterfaces] =
        await Promise.all([
          si.graphics(),
          si.osInfo(),
          si.networkStats(),
          si.fsSize(),
          si.networkInterfaces(),
        ]);

      // Calculate network usage (sum bytes received and transferred from all active interfaces)
      const networkUsage = network.reduce(
        (acc, net) => {
          acc.rx_bytes += net.rx_bytes || 0;
          acc.tx_bytes += net.tx_bytes || 0;
          acc.rx_sec += net.rx_sec || 0;
          acc.tx_sec += net.tx_sec || 0;
          return acc;
        },
        { rx_bytes: 0, tx_bytes: 0, rx_sec: 0, tx_sec: 0 },
      );

      // Summarize disk usage
      const diskUsage = fsSize.map((disk) => ({
        fs: disk.fs,
        type: disk.type,
        size: disk.size,
        used: disk.used,
        available: disk.available,
        use: disk.use,
        mount: disk.mount,
      }));

      // Resolve MAC address information
      const validMacInterfaces = networkInterfaces.filter(
        (iface) =>
          iface.mac && iface.mac !== "00:00:00:00:00:00" && !iface.internal,
      );

      const primaryMacAddress =
        validMacInterfaces.find((iface) => iface.operstate === "up")?.mac ||
        validMacInterfaces[0]?.mac ||
        null;

      const macAddresses = validMacInterfaces.map((iface) => ({
        iface: iface.iface,
        mac: iface.mac,
        ip4: iface.ip4,
        ip6: iface.ip6,
        operstate: iface.operstate,
      }));

      return {
        monitors: graphics.displays ? graphics.displays.length : 0,
        osInfo: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          arch: osInfo.arch,
          hostname: osInfo.hostname,
        },
        macAddress: primaryMacAddress,
        macAddresses,
        networkUsage,
        diskUsage,
      };
    } catch (error) {
      console.error("Error fetching heavy system metrics:", error);
      throw new Error("Failed to retrieve heavy metrics");
    }
  }

  async getLightMetrics() {
    if (
      this.lightMetricsCache &&
      this.isFresh(this.lightMetricsCollectedAt, LIGHT_METRICS_CACHE_TTL_MS)
    ) {
      return this.lightMetricsCache;
    }

    if (this.lightCollectPromise) {
      if (this.lightMetricsCache) {
        return this.lightMetricsCache;
      }
      return this.lightCollectPromise;
    }

    this.lightCollectPromise = this.collectLightMetrics()
      .then((metrics) => {
        this.lightMetricsCache = metrics;
        this.lightMetricsCollectedAt = Date.now();
        return metrics;
      })
      .catch((error) => {
        if (this.lightMetricsCache) {
          return this.lightMetricsCache;
        }
        throw error;
      })
      .finally(() => {
        this.lightCollectPromise = null;
      });

    return this.lightCollectPromise;
  }

  triggerHeavyRefreshIfNeeded() {
    if (
      this.isFresh(this.heavyMetricsCollectedAt, HEAVY_METRICS_CACHE_TTL_MS)
    ) {
      return;
    }

    if (this.heavyCollectPromise) {
      return;
    }

    this.heavyCollectPromise = this.collectHeavyMetrics()
      .then((metrics) => {
        this.heavyMetricsCache = metrics;
        this.heavyMetricsCollectedAt = Date.now();
      })
      .catch((error) => {
        console.error("Heavy metrics refresh failed:", error.message);
      })
      .finally(() => {
        this.heavyCollectPromise = null;
      });
  }

  getHeavyMetricsSnapshot() {
    this.triggerHeavyRefreshIfNeeded();
    return this.heavyMetricsCache || this.defaultHeavyMetrics;
  }

  async getSystemMetrics() {
    const lightMetrics = await this.getLightMetrics();
    const heavyMetrics = this.getHeavyMetricsSnapshot();

    return {
      monitors: heavyMetrics.monitors,
      ram: lightMetrics.ram,
      cpuUsage: lightMetrics.cpuUsage,
      osInfo: heavyMetrics.osInfo,
      uptime: lightMetrics.uptime,
      loadAverage: lightMetrics.loadAverage,
      macAddress: heavyMetrics.macAddress,
      macAddresses: heavyMetrics.macAddresses,
      networkUsage: heavyMetrics.networkUsage,
      diskUsage: heavyMetrics.diskUsage,
    };
  }
}

module.exports = new SystemService();
