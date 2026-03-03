const systemService = require("../services/systemService");

class MonitorController {
  constructor() {
    this.streamMetrics = this.streamMetrics.bind(this);

    this.clients = new Map();
    this.nextClientId = 1;

    this.pollTimeoutId = null;
    this.heartbeatIntervalId = null;
    this.collectPromise = null;

    this.lastEventId = 0;
    this.lastMetricsPayload = null;

    this.streamIntervalMs = this.parseIntervalMs({
      envName: "SYSTEM_METRICS_STREAM_INTERVAL_MS",
      fallback: 2000,
      min: 500,
      max: 60000,
    });

    this.heartbeatIntervalMs = this.parseIntervalMs({
      envName: "SSE_HEARTBEAT_INTERVAL_MS",
      fallback: 15000,
      min: 5000,
      max: 120000,
    });

    this.retryMs = this.parseIntervalMs({
      envName: "SSE_RETRY_MS",
      fallback: 5000,
      min: 1000,
      max: 60000,
    });
  }

  parseIntervalMs({ envName, fallback, min, max }) {
    const raw = process.env[envName];
    if (raw == null) {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      console.warn(
        `${envName} must be a number in range ${min}-${max}. Using default ${fallback}.`,
      );
      return fallback;
    }

    return Math.trunc(parsed);
  }

  createClientRecord(res) {
    const clientId = this.nextClientId;
    this.nextClientId += 1;
    const client = { id: clientId, res };
    this.clients.set(clientId, client);
    return client;
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    if (this.clients.size === 0) {
      this.stopBackgroundLoops();
    }
  }

  writeToClient(client, chunk) {
    try {
      client.res.write(chunk);
      return true;
    } catch (error) {
      console.error(`SSE write failed for client ${client.id}:`, error.message);
      try {
        client.res.end();
      } catch (_error) {
        // no-op
      }
      this.removeClient(client.id);
      return false;
    }
  }

  writeEventToClient(client, eventName, data, eventId) {
    const payload = JSON.stringify(data);
    const chunk = `id: ${eventId}\nevent: ${eventName}\ndata: ${payload}\n\n`;
    this.writeToClient(client, chunk);
  }

  broadcastEvent(eventName, data) {
    if (this.clients.size === 0) {
      return;
    }

    this.lastEventId += 1;
    const eventId = this.lastEventId;

    for (const client of this.clients.values()) {
      this.writeEventToClient(client, eventName, data, eventId);
    }
  }

  broadcastHeartbeat() {
    if (this.clients.size === 0) {
      return;
    }

    for (const client of this.clients.values()) {
      this.writeToClient(client, `: heartbeat\n\n`);
    }
  }

  async collectAndBroadcastMetrics() {
    if (this.collectPromise) {
      return this.collectPromise;
    }

    this.collectPromise = (async () => {
      try {
        const systemMetrics = await systemService.getSystemMetrics();
        this.lastMetricsPayload = systemMetrics;
        this.broadcastEvent("metrics", systemMetrics);
      } catch (error) {
        console.error("Error in SSE polling loop:", error);
        this.broadcastEvent("error", { error: "Failed to collect metrics" });
      } finally {
        this.collectPromise = null;
      }
    })();

    return this.collectPromise;
  }

  startPollingLoop() {
    if (this.pollTimeoutId) {
      return;
    }

    const scheduleNext = () => {
      this.pollTimeoutId = setTimeout(async () => {
        if (this.clients.size === 0) {
          this.pollTimeoutId = null;
          return;
        }

        await this.collectAndBroadcastMetrics();

        if (this.clients.size > 0) {
          scheduleNext();
        } else {
          this.pollTimeoutId = null;
        }
      }, this.streamIntervalMs);
    };

    scheduleNext();
  }

  startHeartbeatLoop() {
    if (this.heartbeatIntervalId) {
      return;
    }

    this.heartbeatIntervalId = setInterval(() => {
      if (this.clients.size === 0) {
        this.stopHeartbeatLoop();
        return;
      }

      this.broadcastHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeatLoop() {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  stopPollingLoop() {
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
  }

  stopBackgroundLoops() {
    this.stopPollingLoop();
    this.stopHeartbeatLoop();
  }

  ensureBackgroundLoopsRunning() {
    this.startPollingLoop();
    this.startHeartbeatLoop();
  }

  /**
   * SSE Endpoint to stream system metrics in real-time
   * GET /api/system-metrics
   */
  async streamMetrics(req, res) {
    // 1. Establish SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Handle immediate flush if supported by framework/environment (not strictly required in standard Express, but good practice)
    res.flushHeaders();

    const client = this.createClientRecord(res);

    // SSE reconnect hint for EventSource clients
    this.writeToClient(client, `retry: ${this.retryMs}\n\n`);

    // Send latest payload immediately if we have one; otherwise trigger a fresh collection once.
    if (this.lastMetricsPayload) {
      this.lastEventId += 1;
      this.writeEventToClient(
        client,
        "metrics",
        this.lastMetricsPayload,
        this.lastEventId,
      );
    } else {
      await this.collectAndBroadcastMetrics();
    }

    this.ensureBackgroundLoopsRunning();

    // 2. Cleanup: Listen for client disconnect to prevent memory leaks
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      console.log(`Client ${client.id} disconnected from SSE stream`);
      this.removeClient(client.id);
    };

    res.on("close", cleanup);
    req.on("aborted", cleanup);
    res.on("error", cleanup);
  }
}

module.exports = new MonitorController();
