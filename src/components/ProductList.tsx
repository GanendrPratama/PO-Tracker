import { useState } from 'react';
import { useProducts, useCurrency, useEvents } from '../hooks/useDatabase';
import { Product } from '../types';

export function ProductList() {
    const { products, loading, addProduct, updateProduct, deleteProduct } = useProducts();
    const { events } = useEvents(); // Need events for dropdown
    const { formatCurrency } = useCurrency();
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        price: string;
        currency_code: string;
        event_id: string;
        prices: { currency_code: string; price: string }[];
    }>({
        name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: []
    });
    const [deleting, setDeleting] = useState<number | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(formData.price);

        const prices = formData.prices
            .filter(p => p.currency_code && p.price)
            .map(p => ({ currency_code: p.currency_code, price: parseFloat(p.price) }));

        const productData = {
            name: formData.name,
            description: formData.description,
            price,
            currency_code: formData.currency_code || 'USD',
            event_id: formData.event_id ? parseInt(formData.event_id) : undefined,
            prices
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
            name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: []
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
                : []
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingProduct(null);
        setFormData({ name: '', description: '', price: '', currency_code: 'USD', event_id: '', prices: [] });
    };

    const handleDelete = async (id: number) => {
        setDeleting(id);
        try {
            await deleteProduct(id);
        } finally {
            setDeleting(null);
        }
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

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Products</h2>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        ➕ Add Product
                    </button>
                </div>

                {products.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>No products yet. Add your first product!</p>
                    </div>
                ) : (
                    <div className="product-grid">
                        {products.map((product) => (
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

        </div>
    );
}
