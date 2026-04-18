/**
 * Escape special ILIKE / LIKE metacharacters to prevent pattern injection.
 * '%' and '_' are SQL wildcards; '\' is the escape character itself.
 * @param {string} str — raw user search input
 * @returns {string} — safe string for use inside ILIKE patterns
 */
function escapeILIKE(str) {
    return str.replaceAll('\\', '\\\\')
              .replaceAll('%', String.raw`\%`)
              .replaceAll('_', String.raw`\_`);
}

module.exports = { escapeILIKE };
