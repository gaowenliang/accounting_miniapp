// cloud/functions/rateLimit.js — 公共防刷模块
// 每用户每分钟最多 N 次，Map + 容量上限防 OOM

const rateLimiter = new Map()
const MAX_USERS = 10000

/**
 * @param {string} openid
 * @param {number} maxPerMinute 默认 30
 * @returns {boolean} true=放行
 */
function checkRateLimit(openid, maxPerMinute = 30) {
  const now = Date.now()
  if (rateLimiter.size > MAX_USERS) {
    for (const [key, timestamps] of rateLimiter) {
      const filtered = timestamps.filter(t => now - t < 60000)
      if (filtered.length === 0) rateLimiter.delete(key)
      else rateLimiter.set(key, filtered)
    }
  }
  const timestamps = rateLimiter.get(openid) || []
  const recent = timestamps.filter(t => now - t < 60000)
  if (recent.length >= maxPerMinute) return false
  recent.push(now)
  rateLimiter.set(openid, recent)
  return true
}

module.exports = { checkRateLimit }
