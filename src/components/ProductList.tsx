import { useState } from 'react';
import { useCurrency, useEvents } from '../hooks/useDatabase';
import { useProductsContext } from '../contexts/ProductsContext';
import { Product, Tag } from '../types';

// Preset tag colors
const TAG_COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4',
    '#3b82f6', '#64748b'
];

export function ProductList() {
    const {
        products, loading, addProduct, updateProduct, deleteProduct,
        tags, addTag, updateTag, deleteTag,
        tagFilter, setTagFilter, filteredProducts
    } = useProductsContext();
    const { events } = useEvents();
    const { formatCurrency } = useCurrency();

    // Product modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        price: string;
        currency_code: string;
        event_id: string;
        prices: { currency_code: string; price: string }[];
        selectedTagIds: number[];
    }>({
        name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: [], selectedTagIds: []
    });
    const [deleting, setDeleting] = useState<number | null>(null);

    // Tag management modal state
    const [showTagModal, setShowTagModal] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [editingTag, setEditingTag] = useState<Tag | null>(null);

    // --- Product CRUD handlers ---

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(formData.price);

        const prices = formData.prices
            .filter(p => p.currency_code && p.price)
            .map(p => ({ currency_code: p.currency_code, price: parseFloat(p.price) }));

        const selectedTags = tags.filter(t => t.id !== undefined && formData.selectedTagIds.includes(t.id!));

        const productData = {
            name: formData.name,
            description: formData.description,
            price,
            currency_code: formData.currency_code || 'USD',
            event_id: formData.event_id ? parseInt(formData.event_id) : undefined,
            prices,
            tags: selectedTags
        };

        if (editingProduct && editingProduct.id) {
            await updateProduct(editingProduct.id, productData);
        } else {
            await addProduct(productData);
        }

        closeModal();
    };

    const openAddModal = () => {
        setEditingProduct(null);
        setFormData({
            name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: [], selectedTagIds: []
        });
        setShowModal(true);
    };

    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price.toString(),
            currency_code: product.currency_code || 'USD',
            event_id: product.event_id ? product.event_id.toString() : '',
            prices: product.prices
                ? product.prices.map(p => ({ currency_code: p.currency_code, price: p.price.toString() }))
                : [],
            selectedTagIds: product.tags ? product.tags.filter(t => t.id !== undefined).map(t => t.id!) : []
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingProduct(null);
        setFormData({ name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: [], selectedTagIds: [] });
    };

    const handleDelete = async (id: number) => {
        setDeleting(id);
        try {
            await deleteProduct(id);
        } finally {
            setDeleting(null);
        }
    };

    const toggleFormTag = (tagId: number) => {
        setFormData(prev => ({
            ...prev,
            selectedTagIds: prev.selectedTagIds.includes(tagId)
                ? prev.selectedTagIds.filter(id => id !== tagId)
                : [...prev.selectedTagIds, tagId]
        }));
    };

    // --- Tag management handlers ---

    const handleAddTag = async () => {
        if (!newTagName.trim()) return;
        if (editingTag && editingTag.id) {
            await updateTag(editingTag.id, newTagName, newTagColor);
            setEditingTag(null);
        } else {
            await addTag(newTagName, newTagColor);
        }
        setNewTagName('');
        setNewTagColor(TAG_COLORS[0]);
    };

    const handleDeleteTag = async (id: number) => {
        await deleteTag(id);
    };

    const startEditTag = (tag: Tag) => {
        setEditingTag(tag);
        setNewTagName(tag.name);
        setNewTagColor(tag.color);
    };

    const cancelEditTag = () => {
        setEditingTag(null);
        setNewTagName('');
        setNewTagColor(TAG_COLORS[0]);
    };

    // --- Tag filter helpers ---

    const toggleTagFilter = (tagId: number) => {
        setTagFilter(
            tagFilter.includes(tagId)
                ? tagFilter.filter(id => id !== tagId)
                : [...tagFilter, tagId]
        );
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Products</h1>
                <p className="page-subtitle">Manage your product catalog</p>
            </div>

            {/* Tag Filter Bar */}
            {tags.length > 0 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-lg)',
                    alignItems: 'center'
                }}>
                    <button
                        className={`btn ${tagFilter.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: 'var(--text-sm)' }}
                        onClick={() => setTagFilter([])}
                    >
                        All
                    </button>
                    {tags.map(tag => {
                        const isActive = tag.id !== undefined && tagFilter.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => tag.id !== undefined && toggleTagFilter(tag.id)}
                                style={{
                                    padding: 'var(--space-xs) var(--space-md)',
                                    fontSize: 'var(--text-sm)',
                                    borderRadius: 'var(--radius-full)',
                                    border: `2px solid ${tag.color}`,
                                    background: isActive ? tag.color : 'transparent',
                                    color: isActive ? '#fff' : tag.color,
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    transition: 'all var(--transition-fast)'
                                }}
                            >
                                {tag.name}
                            </button>
                        );
                    })}
                    <button
                        className="btn btn-icon"
                        onClick={() => setShowTagModal(true)}
                        title="Manage Tags"
                        style={{ fontSize: 'var(--text-sm)' }}
                    >
                        🏷️ Manage
                    </button>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">
                        {tagFilter.length > 0
                            ? `Filtered Products (${filteredProducts.length})`
                            : `All Products (${products.length})`
                        }
                    </h2>
                    <div className="btn-group">
                        {tags.length === 0 && (
                            <button className="btn btn-secondary" onClick={() => setShowTagModal(true)}>
                                🏷️ Manage Tags
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={openAddModal}>
                            ➕ Add Product
                        </button>
                    </div>
                </div>

                {filteredProducts.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>{tagFilter.length > 0 ? 'No products match the selected tags.' : 'No products yet. Add your first product!'}</p>
                    </div>
                ) : (
                    <div className="product-grid">
                        {filteredProducts.map((product) => (
                            <div key={product.id} className="product-card">
                                <div className="product-card-image">
                                    {product.image_url ? (
                                        <img
                                            src={product.image_url}
                                            alt={product.name}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`product-card-placeholder ${product.image_url ? 'hidden' : ''}`}>
                                        📦
                                    </div>
                                </div>
                                <div className="product-card-content">
                                    {product.unique_id && (
                                        <div style={{
                                            fontFamily: 'monospace',
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--color-text-muted)',
                                            marginBottom: '2px',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {product.unique_id}
                                        </div>
                                    )}
                                    <h3 className="product-card-name">{product.name}</h3>
                                    {product.description && (
                                        <p className="product-card-description">{product.description}</p>
                                    )}
                                    <div className="product-card-price">
                                        {product.currency_code
                                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: product.currency_code }).format(product.price)
                                            : formatCurrency(product.price)
                                        }
                                    </div>
                                    {/* Tag Badges */}
                                    {product.tags && product.tags.length > 0 && (
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '4px',
                                            marginTop: 'var(--space-sm)'
                                        }}>
                                            {product.tags.map(tag => (
                                                <span
                                                    key={tag.id}
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        borderRadius: 'var(--radius-full)',
                                                        background: `${tag.color}22`,
                                                        color: tag.color,
                                                        fontSize: 'var(--text-xs)',
                                                        fontWeight: 500,
                                                        border: `1px solid ${tag.color}44`
                                                    }}
                                                >
                                                    {tag.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="product-card-actions">
                                    <button
                                        className="btn btn-icon"
                                        onClick={() => openEditModal(product)}
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="btn btn-icon"
                                        onClick={() => product.id && handleDelete(product.id)}
                                        title="Delete"
                                        disabled={deleting === product.id}
                                    >
                                        {deleting === product.id ? '⏳' : '🗑️'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Product Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingProduct ? 'Edit Product' : 'Add Product'}
                            </h3>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Product Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Enter product name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-textarea"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Enter product description"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Event (Optional)</label>
                                <select
                                    className="form-input"
                                    value={formData.event_id}
                                    onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                                >
                                    <option value="">-- No Event --</option>
                                    {events.map(e => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Base Price *</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        style={{ width: '100px' }}
                                        value={formData.currency_code}
                                        onChange={(e) => setFormData({ ...formData, currency_code: e.target.value.toUpperCase() })}
                                        placeholder="USD"
                                        required
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="form-input"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Additional Currencies</label>
                                {formData.prices.map((p, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="Currency (e.g. IDR)"
                                            className="form-input"
                                            style={{ width: '100px' }}
                                            value={p.currency_code}
                                            onChange={(e) => {
                                                const newPrices = [...formData.prices];
                                                newPrices[idx].currency_code = e.target.value.toUpperCase();
                                                setFormData({ ...formData, prices: newPrices });
                                            }}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Price"
                                            className="form-input"
                                            value={p.price}
                                            onChange={(e) => {
                                                const newPrices = [...formData.prices];
                                                newPrices[idx].price = e.target.value;
                                                setFormData({ ...formData, prices: newPrices });
                                            }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-icon"
                                            style={{ color: 'var(--color-error)' }}
                                            onClick={() => {
                                                const newPrices = formData.prices.filter((_, i) => i !== idx);
                                                setFormData({ ...formData, prices: newPrices });
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setFormData({
                                        ...formData,
                                        prices: [...formData.prices, { currency_code: '', price: '' }]
                                    })}
                                >
                                    + Add Currency Price
                                </button>
                            </div>

                            {/* Tag Selector */}
                            <div className="form-group">
                                <label className="form-label">Tags</label>
                                {tags.length === 0 ? (
                                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                        No tags yet.{' '}
                                        <button
                                            type="button"
                                            style={{
                                                background: 'none', border: 'none', color: 'var(--color-accent)',
                                                cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit'
                                            }}
                                            onClick={() => { closeModal(); setShowTagModal(true); }}
                                        >
                                            Create tags first
                                        </button>
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {tags.map(tag => {
                                            const isSelected = tag.id !== undefined && formData.selectedTagIds.includes(tag.id);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => tag.id !== undefined && toggleFormTag(tag.id)}
                                                    style={{
                                                        padding: '4px 12px',
                                                        borderRadius: 'var(--radius-full)',
                                                        border: `2px solid ${tag.color}`,
                                                        background: isSelected ? tag.color : 'transparent',
                                                        color: isSelected ? '#fff' : tag.color,
                                                        cursor: 'pointer',
                                                        fontSize: 'var(--text-sm)',
                                                        fontWeight: 500,
                                                        transition: 'all var(--transition-fast)'
                                                    }}
                                                >
                                                    {isSelected ? '✓ ' : ''}{tag.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProduct ? 'Save Changes' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Manage Tags Modal */}
            {showTagModal && (
                <div className="modal-overlay" onClick={() => { setShowTagModal(false); cancelEditTag(); }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">🏷️ Manage Tags</h3>
                            <button className="modal-close" onClick={() => { setShowTagModal(false); cancelEditTag(); }}>×</button>
                        </div>

                        {/* Create / Edit Tag Form */}
                        <div style={{
                            display: 'flex',
                            gap: 'var(--space-sm)',
                            marginBottom: 'var(--space-lg)',
                            alignItems: 'flex-end'
                        }}>
                            <div style={{ flex: 1 }}>
                                <label className="form-label">
                                    {editingTag ? 'Edit Tag' : 'New Tag'}
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    placeholder="Tag name"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleAddTag}
                                disabled={!newTagName.trim()}
                                style={{ flexShrink: 0 }}
                            >
                                {editingTag ? '✓ Save' : '+ Add'}
                            </button>
                            {editingTag && (
                                <button
                                    className="btn btn-secondary"
                                    onClick={cancelEditTag}
                                    style={{ flexShrink: 0 }}
                                >
                                    Cancel
                                </button>
                            )}
                        </div>

                        {/* Color Picker */}
                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <label className="form-label" style={{ marginBottom: 'var(--space-xs)' }}>Color</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {TAG_COLORS.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setNewTagColor(color)}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            background: color,
                                            border: newTagColor === color ? '3px solid var(--color-text-primary)' : '3px solid transparent',
                                            cursor: 'pointer',
                                            transition: 'all var(--transition-fast)'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Existing Tags List */}
                        <div>
                            <label className="form-label">Existing Tags</label>
                            {tags.length === 0 ? (
                                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                    No tags created yet.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                    {tags.map(tag => (
                                        <div
                                            key={tag.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: 'var(--space-sm) var(--space-md)',
                                                background: 'var(--color-bg-tertiary)',
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--color-border)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                <div style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    borderRadius: '50%',
                                                    background: tag.color,
                                                    flexShrink: 0
                                                }} />
                                                <span style={{ fontWeight: 500 }}>{tag.name}</span>
                                            </div>
                                            <div className="btn-group">
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => startEditTag(tag)}
                                                    title="Edit"
                                                    style={{ fontSize: 'var(--text-sm)' }}
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-icon"
                                                    onClick={() => tag.id && handleDeleteTag(tag.id)}
                                                    title="Delete"
                                                    style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-primary" onClick={() => { setShowTagModal(false); cancelEditTag(); }}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
