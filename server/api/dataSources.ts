import { Router } from 'express';

import { getDataRegistry } from '../data/configure.js';
import { DataRegistryHealthSchema } from '../data/types.js';

interface DataSourceHealthPort {
  health(): unknown;
}

export function createDataSourcesRouter(source: DataSourceHealthPort): Router {
  const router = Router();
  router.get('/data-sources/health', (_req, res) => {
    try {
      res.json(DataRegistryHealthSchema.parse(source.health()));
    } catch {
      res.status(503).json({ error: 'Data source health is unavailable' });
    }
  });
  return router;
}

export const dataSourcesRouter = createDataSourcesRouter({
  health: () => getDataRegistry().health(),
});
