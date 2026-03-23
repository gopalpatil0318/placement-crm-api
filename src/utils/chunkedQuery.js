/**
 * ============================================================================
 * CHUNKED QUERY — Throttled parallel DB query execution
 * ============================================================================
 * Executes an array of SQL queries in batches of `concurrency` to cap
 * per-request connection usage from the pool.
 *
 * Without this, a Promise.all of 12 queries grabs 12 pool connections
 * simultaneously — with pool max of 5 and 200+ concurrent users, the
 * pool is instantly exhausted.
 *
 * Usage:
 *   const results = await chunkedQuery([
 *     { text: 'SELECT ...', params: [1, 2] },
 *     { text: 'SELECT ...', params: [3] },
 *   ], 3);
 *   // results[0], results[1] — same order as input
 * ============================================================================
 */

const { query } = require('../config/db');

/**
 * Execute multiple queries with bounded concurrency.
 *
 * @param {Array<{ text: string, params?: any[] }>} queries - Query descriptors
 * @param {number} [concurrency=3] - Max simultaneous queries (pool connections)
 * @returns {Promise<import('pg').QueryResult[]>} Results in same order as input
 */
async function chunkedQuery(queries, concurrency = 3) {
    const results = new Array(queries.length);

    for (let i = 0; i < queries.length; i += concurrency) {
        const chunk = queries.slice(i, i + concurrency);
        const chunkResults = await Promise.all(
            chunk.map((q) => query(q.text, q.params))
        );
        for (let j = 0; j < chunkResults.length; j++) {
            results[i + j] = chunkResults[j];
        }
    }

    return results;
}

module.exports = chunkedQuery;
