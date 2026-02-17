import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Database from '@tauri-apps/plugin-sql';
import { Product, Tag } from '../types';

// Reuse the singleton database from useDatabase
let db: Database | null = null;

async function getDatabase(): Promise<Database> {
    if (!db) {
        db = await Database.load('sqlite:potracker.db');
    }
    return db;
}

interface ProductsContextValue {
    products: Product[];
    loading: boolean;
    addProduct: (product: Omit<Product, 'id' | 'created_at'>) => Promise<void>;
    updateProduct: (id: number, product: Partial<Product>) => Promise<void>;
    deleteProduct: (id: number) => Promise<void>;
    reload: () => Promise<void>;
    // Tags
    tags: Tag[];
    addTag: (name: string, color: string) => Promise<void>;
    updateTag: (id: number, name: string, color: string) => Promise<void>;
    deleteTag: (id: number) => Promise<void>;
    setProductTags: (productId: number, tagIds: number[]) => Promise<void>;
    reloadTags: () => Promise<void>;
    // Filtering
    tagFilter: number[];
    setTagFilter: (tagIds: number[]) => void;
    filteredProducts: Product[];
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

interface ProductsProviderProps {
    children: ReactNode;
}

export function ProductsProvider({ children }: ProductsProviderProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [tags, setTags] = useState<Tag[]>([]);
    const [tagFilter, setTagFilter] = useState<number[]>([]);

    const loadTags = useCallback(async () => {
        try {
            const database = await getDatabase();
            const result = await database.select<Tag[]>('SELECT * FROM tags ORDER BY name ASC');
            setTags(result);
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    }, []);

    const loadProducts = useCallback(async () => {
        try {
            const database = await getDatabase();
            const productsResult = await database.select<Product[]>('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC');

            // Load prices and tags for each product
            const productsWithData = await Promise.all(productsResult.map(async (p) => {
                const prices = await database.select<{ id: number, product_id: number, currency_code: string, price: number }[]>(
                    'SELECT * FROM product_prices WHERE product_id = ?',
                    [p.id]
                );
                const productTags = await database.select<Tag[]>(
                    `SELECT t.* FROM tags t
                     INNER JOIN product_tags pt ON t.id = pt.tag_id
                     WHERE pt.product_id = ?
                     ORDER BY t.name ASC`,
                    [p.id]
                );
                return { ...p, prices, tags: productTags };
            }));

            setProducts(productsWithData);
        } catch (error) {
            console.error('Failed to load products:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProducts();
        loadTags();
    }, [loadProducts, loadTags]);

    const addProduct = async (product: Omit<Product, 'id' | 'created_at'>) => {
        const database = await getDatabase();
        const uniqueId = product.unique_id || ('PRD-' + Math.random().toString(36).substring(2, 10).toUpperCase());
        const result = await database.execute(
            'INSERT INTO products (name, description, price, currency_code, image_url, event_id, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [product.name, product.description || null, product.price, product.currency_code || 'USD', product.image_url || null, product.event_id || null, uniqueId]
        );

        const productId = result.lastInsertId;

        if (product.prices && product.prices.length > 0) {
            for (const p of product.prices) {
                await database.execute(
                    'INSERT INTO product_prices (product_id, currency_code, price) VALUES (?, ?, ?)',
                    [productId, p.currency_code, p.price]
                );
            }
        }

        // Save tags if provided
        if (product.tags && product.tags.length > 0) {
            for (const tag of product.tags) {
                if (tag.id) {
                    await database.execute(
                        'INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                        [productId, tag.id]
                    );
                }
            }
        }

        await loadProducts();
    };

    const updateProduct = async (id: number, product: Partial<Product>) => {
        const database = await getDatabase();
        await database.execute(
            'UPDATE products SET name = ?, description = ?, price = ?, currency_code = ?, image_url = ?, event_id = ? WHERE id = ?',
            [product.name, product.description || null, product.price, product.currency_code || 'USD', product.image_url || null, product.event_id || null, id]
        );

        if (product.prices) {
            await database.execute('DELETE FROM product_prices WHERE product_id = ?', [id]);
            for (const p of product.prices) {
                await database.execute(
                    'INSERT INTO product_prices (product_id, currency_code, price) VALUES (?, ?, ?)',
                    [id, p.currency_code, p.price]
                );
            }
        }

        // Update tags if provided
        if (product.tags !== undefined) {
            await database.execute('DELETE FROM product_tags WHERE product_id = ?', [id]);
            if (product.tags) {
                for (const tag of product.tags) {
                    if (tag.id) {
                        await database.execute(
                            'INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                            [id, tag.id]
                        );
                    }
                }
            }
        }

        await loadProducts();
    };

    const deleteProduct = async (id: number) => {
        const database = await getDatabase();
        await database.execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
        await loadProducts();
    };

    // Tag operations
    const addTag = async (name: string, color: string) => {
        const database = await getDatabase();
        await database.execute('INSERT INTO tags (name, color) VALUES (?, ?)', [name.trim(), color]);
        await loadTags();
    };

    const updateTag = async (id: number, name: string, color: string) => {
        const database = await getDatabase();
        await database.execute('UPDATE tags SET name = ?, color = ? WHERE id = ?', [name.trim(), color, id]);
        await loadTags();
        await loadProducts(); // refresh product tags too
    };

    const deleteTag = async (id: number) => {
        const database = await getDatabase();
        await database.execute('DELETE FROM product_tags WHERE tag_id = ?', [id]);
        await database.execute('DELETE FROM tags WHERE id = ?', [id]);
        // Remove from active filter if present
        setTagFilter(prev => prev.filter(tid => tid !== id));
        await loadTags();
        await loadProducts();
    };

    const setProductTags = async (productId: number, tagIds: number[]) => {
        const database = await getDatabase();
        await database.execute('DELETE FROM product_tags WHERE product_id = ?', [productId]);
        for (const tagId of tagIds) {
            await database.execute(
                'INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                [productId, tagId]
            );
        }
        await loadProducts();
    };

    // Computed filtered products
    const filteredProducts = tagFilter.length === 0
        ? products
        : products.filter(p =>
            p.tags && p.tags.some(t => t.id !== undefined && tagFilter.includes(t.id))
        );

    const value: ProductsContextValue = {
        products,
        loading,
        addProduct,
        updateProduct,
        deleteProduct,
        reload: loadProducts,
        tags,
        addTag,
        updateTag,
        deleteTag,
        setProductTags,
        reloadTags: loadTags,
        tagFilter,
        setTagFilter,
        filteredProducts
    };

    return (
        <ProductsContext.Provider value={value}>
            {children}
        </ProductsContext.Provider>
    );
}

export function useProductsContext(): ProductsContextValue {
    const context = useContext(ProductsContext);
    if (!context) {
        throw new Error('useProductsContext must be used within a ProductsProvider');
    }
    return context;
}
