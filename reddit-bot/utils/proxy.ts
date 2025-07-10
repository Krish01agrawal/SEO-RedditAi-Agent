import { LaunchOptions } from 'playwright';
import proxyList from '../data/proxies.json';

interface ProxyEntry {
  server: string;
  username?: string;
  password?: string;
}

// Cast the imported JSON to a typed array so TS knows it has .length, etc.
const proxies = proxyList as ProxyEntry[];

export function getProxy(index: number): LaunchOptions {
  // If the list is empty or not an array, launch with no proxy.
  if (!Array.isArray(proxies) || proxies.length === 0) {
    return {} as LaunchOptions;
  }

  const proxy = proxies[index % proxies.length];
  return {
    proxy: {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password,
    },
  } as LaunchOptions;
} 