import Database from '@tauri-apps/plugin-sql';

/**
 * Product Updater — normalizes products from older app versions.
 * Run on each app init to ensure data consistency.
 */
export async function runProductUpdater(db: Database): Promise<void> {
    console.log('[ProductUpdater] Running product migrations...');

    // 1. Backfill missing unique_id
    try {
        const productsWithoutUid = await db.select<{ id: number }[]>(
            'SELECT id FROM products WHERE unique_id IS NULL OR unique_id = ""'
        );
        for (const p of productsWithoutUid) {
            const uid = 'PRD-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            await db.execute('UPDATE products SET unique_id = ? WHERE id = ?', [uid, p.id]);
        }
        if (productsWithoutUid.length > 0) {
            console.log(`[ProductUpdater] Backfilled unique_id for ${productsWithoutUid.length} products`);
        }
    } catch (e) {
        console.warn('[ProductUpdater] Failed to backfill unique_id:', e);
    }

    // 2. Set default currency_code where NULL
    try {
        const result = await db.execute(
            'UPDATE products SET currency_code = "USD" WHERE currency_code IS NULL OR currency_code = ""'
        );
        if (result.rowsAffected > 0) {
            console.log(`[ProductUpdater] Set default currency_code for ${result.rowsAffected} products`);
        }
    } catch (e) {
        console.warn('[ProductUpdater] Failed to set default currency_code:', e);
    }

    // 3. Set is_active = 1 where NULL (old products before soft-delete was added)
    try {
        const result = await db.execute(
            'UPDATE products SET is_active = 1 WHERE is_active IS NULL'
        );
        if (result.rowsAffected > 0) {
            console.log(`[ProductUpdater] Set is_active=1 for ${result.rowsAffected} products`);
        }
    } catch (e) {
        console.warn('[ProductUpdater] Failed to set is_active:', e);
    }

    // 4. Normalize empty descriptions to NULL for consistency
    try {
        await db.execute('UPDATE products SET description = NULL WHERE description = ""');
    } catch (e) {
        console.warn('[ProductUpdater] Failed to normalize descriptions:', e);
    }

    // 5. Ensure price is never NULL or negative
    try {
        const result = await db.execute(
            'UPDATE products SET price = 0 WHERE price IS NULL OR price < 0'
        );
        if (result.rowsAffected > 0) {
            console.log(`[ProductUpdater] Fixed ${result.rowsAffected} products with invalid prices`);
        }
    } catch (e) {
        console.warn('[ProductUpdater] Failed to fix prices:', e);
    }

    console.log('[ProductUpdater] Product migrations complete.');
}
