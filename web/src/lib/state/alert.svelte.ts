// alert.svelte.ts - Alert state class
import { ReactiveEntity } from './reactive-base.svelte';

export class Alert extends ReactiveEntity {
  message = $state<string>('');
  timestamp = $state<string>('');
  severity = $state<'info' | 'warning' | 'error'>('info');

  constructor(message: string, severity: 'info' | 'warning' | 'error' = 'info') {
    super(Math.random().toString(36).substr(2, 9), 'alert');
    this.message = message;
    this.severity = severity;
    this.timestamp = new Date().toISOString();
  }

  update(data: Partial<AlertData>) {
    if (data.message !== undefined) this.message = data.message;
    if (data.severity !== undefined) this.severity = data.severity;
    if (data.timestamp !== undefined) this.timestamp = data.timestamp;
    this.lastUpdated = new Date();
  }

  get timeAgo() {
    const now = new Date();
    const alertTime = new Date(this.timestamp);
    const diff = now.getTime() - alertTime.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  toObject() {
    return {
      id: this.id,
      type: this.type,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      timeAgo: this.timeAgo,
      lastUpdated: this.lastUpdated,
    };
  }
}

export interface AlertData {
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string;
}
