/**
 * Object URLs for stored blobs, cached for the life of the page so an image is decoded once and a tile
 * that re-renders does not flicker. A missing blob is remembered as missing until `forget` is called.
 */
export function createBlobUrls(storage) {
  const urls = new Map();
  const loading = new Map();

  async function load(id) {
    const record = await storage.getBlob(id);
    urls.set(id, record ? URL.createObjectURL(record.data) : null);
  }

  return {
    peek: (id) => urls.get(id) ?? null,
    async ensure(ids) {
      const missing = [...new Set(ids)].filter((id) => id && !urls.has(id));

      await Promise.all(missing.map((id) => {
        if (!loading.has(id)) {
          loading.set(id, load(id).finally(() => loading.delete(id)));
        }

        return loading.get(id);
      }));

      return missing.length > 0;
    },
    forget(id) {
      const url = urls.get(id);

      if (url) {
        URL.revokeObjectURL(url);
      }

      urls.delete(id);
    }
  };
}
