import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type { FeatureRoutes, NavItem } from './feature-routes.js';
import type { LinkTab, LinkTabsModule } from './link-tabs.js';

/** Everything the features contribute, merged and ordered for the shell. */
export interface Registry {
  publicRoutes: RouteObject[];
  accountRoutes: RouteObject[];
  workspaceRoutes: RouteObject[];
  accountNav: NavItem[];
  workspaceNav: NavItem[];
  linkTabs: LinkTab[];
  LinkHeader: ComponentType | null;
}

/** Discovered modules by file path, as `import.meta.glob` returns them. */
export type DiscoveredModules = Readonly<Record<string, unknown>>;

const TAB_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const EMPTY_REGISTRY: Registry = {
  publicRoutes: [],
  accountRoutes: [],
  workspaceRoutes: [],
  accountNav: [],
  workspaceNav: [],
  linkTabs: [],
  LinkHeader: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Modules in path order, so the result never depends on discovery order. */
function inPathOrder(modules: DiscoveredModules): Array<[string, unknown]> {
  return Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));
}

function byOrder<Item extends { order: number; label: string }>(
  items: Item[],
): Item[] {
  return [...items].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );
}

function readFeatureRoutes(path: string, module: unknown): FeatureRoutes {
  if (!isRecord(module) || !isRecord(module.routes)) {
    throw new Error(`${path} must export \`routes\`, a FeatureRoutes object`);
  }
  return module.routes;
}

function readLinkTabsModule(path: string, module: unknown): LinkTabsModule {
  if (!isRecord(module) || !('linkTabs' in module || 'LinkHeader' in module)) {
    throw new Error(`${path} must export \`linkTabs\` or \`LinkHeader\``);
  }
  return module;
}

function assertValidTabs(tabs: Array<{ path: string; tab: LinkTab }>): void {
  const owners = new Map<string, string>();
  for (const { path, tab } of tabs) {
    if (!TAB_ID_PATTERN.test(tab.id)) {
      throw new Error(
        `${path}: link tab id "${tab.id}" must be lowercase letters, digits, and hyphens`,
      );
    }
    const owner = owners.get(tab.id);
    if (owner !== undefined) {
      throw new Error(
        `${path}: link tab id "${tab.id}" is already used by ${owner}`,
      );
    }
    owners.set(tab.id, path);
  }
}

function collectLinkTabs(
  modules: DiscoveredModules,
): Pick<Registry, 'linkTabs' | 'LinkHeader'> {
  const tabs: Array<{ path: string; tab: LinkTab }> = [];
  const headers: Array<{ path: string; LinkHeader: ComponentType }> = [];
  for (const [path, module] of inPathOrder(modules)) {
    const { linkTabs = [], LinkHeader } = readLinkTabsModule(path, module);
    tabs.push(...linkTabs.map((tab) => ({ path, tab })));
    if (LinkHeader !== undefined) {
      headers.push({ path, LinkHeader });
    }
  }
  assertValidTabs(tabs);
  if (headers.length > 1) {
    const files = headers.map((header) => header.path).join(' and ');
    throw new Error(`Only one feature may export LinkHeader: ${files}`);
  }
  return {
    linkTabs: byOrder(tabs.map(({ tab }) => tab)),
    LinkHeader: headers[0]?.LinkHeader ?? null,
  };
}

/**
 * Merges what every feature exports into one registry. A malformed module
 * throws, naming its file, so a mistake stops the build's tests rather than
 * quietly dropping a feature from the dashboard.
 */
export function collectRegistry(
  routeModules: DiscoveredModules,
  linkTabModules: DiscoveredModules,
): Registry {
  const features = inPathOrder(routeModules).map(([path, module]) =>
    readFeatureRoutes(path, module),
  );
  return {
    publicRoutes: features.flatMap((feature) => feature.public ?? []),
    accountRoutes: features.flatMap((feature) => feature.account ?? []),
    workspaceRoutes: features.flatMap((feature) => feature.workspace ?? []),
    accountNav: byOrder(
      features.flatMap((feature) => feature.accountNav ?? []),
    ),
    workspaceNav: byOrder(
      features.flatMap((feature) => feature.workspaceNav ?? []),
    ),
    ...collectLinkTabs(linkTabModules),
  };
}
