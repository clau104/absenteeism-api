const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const cacheMiddleware = (duration = CACHE_TTL) => {
  return (req, res, next) => {
    const key = `${req.method}:${req.originalUrl}`;
    const cached = cache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < duration) {
      console.log(`🎯 Cache HIT: ${key}`);
      return res.json({
        ...cached.data,
        fromCache: true,
        cachedAt: new Date(cached.timestamp).toISOString()
      });
    }
    
    const originalSend = res.json;
    res.json = function(data) {
      if (res.statusCode === 200 && data.success) {
        cache.set(key, {
          data: data,
          timestamp: Date.now()
        });
        console.log(`💾 Cache SET: ${key}`);
      }
      originalSend.call(this, data);
    };
    
    next();
  };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL * 2) {
      cache.delete(key);
    }
  }
  console.log(`🧹 Cache limpo. Entries restantes: ${cache.size}`);
}, 10 * 60 * 1000);

module.exports = { cacheMiddleware };
