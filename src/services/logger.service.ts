export interface LogEntry {
  id: string;
  timestamp: string;
  type: "payment_created" | "payment_error" | "webhook_in" | "webhook_out" | "config_updated" | "system";
  level: "info" | "success" | "warn" | "error";
  title: string;
  message?: string;
  appId?: string;
  provider?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  details?: any;
}

export class LoggerService {
  private static logs: LogEntry[] = [];
  private static readonly MAX_LOGS = 200;

  static addLog(entry: Omit<LogEntry, "id" | "timestamp">): LogEntry {
    const fullEntry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.logs.unshift(fullEntry);

    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(0, this.MAX_LOGS);
    }

    return fullEntry;
  }

  static getLogs(filter?: { type?: string; appId?: string; limit?: number }): LogEntry[] {
    let result = this.logs;

    if (filter?.type && filter.type !== "all") {
      result = result.filter((l) => l.type === filter.type);
    }

    if (filter?.appId && filter.appId !== "all") {
      result = result.filter((l) => l.appId === filter.appId);
    }

    const limit = filter?.limit || 100;
    return result.slice(0, limit);
  }

  static clearLogs(): void {
    this.logs = [];
  }
}
