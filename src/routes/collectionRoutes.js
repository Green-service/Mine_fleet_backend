/**
 * Mounts GET/POST/PATCH/DELETE handlers for a { list, create, update, remove }
 * collection (see services/collectionService.js) onto an Express router at `path`.
 * Pass `readOnly: true` for registers with no add/edit/delete UI — only GET is mounted.
 */
export function mountCollection(router, path, collection, { readOnly = false } = {}) {
  router.get(path, async (_req, res, next) => {
    try {
      res.json(await collection.list());
    } catch (err) {
      next(err);
    }
  });

  if (readOnly) return;

  router.post(path, async (req, res, next) => {
    try {
      res.status(201).json(await collection.create(req.body || {}));
    } catch (err) {
      next(err);
    }
  });

  router.patch(`${path}/:id`, async (req, res, next) => {
    try {
      res.json(await collection.update(req.params.id, req.body || {}));
    } catch (err) {
      next(err);
    }
  });

  router.delete(`${path}/:id`, async (req, res, next) => {
    try {
      res.json(await collection.remove(req.params.id));
    } catch (err) {
      next(err);
    }
  });
}
